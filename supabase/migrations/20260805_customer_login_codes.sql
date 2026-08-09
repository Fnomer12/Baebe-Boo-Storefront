-- Customer sign-in by emailed one-time code.
--
-- Replaces the Supabase magic link, whose mail went through GoTrue's own
-- rate-limited SMTP and in practice never reached customers. The application
-- now owns the code and sends it through Resend.
--
-- Why the code is stored as an HMAC rather than a plain or bcrypt hash:
--   * The search space is 10^6. A bare SHA-256 of a stolen table falls in
--     milliseconds, so a plain digest is not protection.
--   * bcrypt/argon2 is the wrong control at this size — 10^6 candidates is
--     cheap to parallelize even at a high cost factor, while costing us ~100ms
--     on every verify. It buys a false sense of security.
--   * The only control that works against a low-entropy secret is a key the
--     database does not contain, so the digest is HMAC-ed with an application
--     pepper. The row id is mixed into the message for per-row separation.
--
-- Rate limiting lives here, not in the Node process: src/lib/rate-limit.ts is
-- an in-memory Map that resets on every deploy and does not span workers, so
-- it cannot hold a per-email quota.

create table if not exists public.login_codes (
  id uuid primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  request_ip text,
  created_at timestamptz not null default now()
);

create index if not exists login_codes_email_recent_idx
  on public.login_codes(email, created_at desc);
create index if not exists login_codes_created_idx
  on public.login_codes(created_at);

-- RLS on with zero policies denies everything that is not service_role. That is
-- deliberate: the row IS the credential, so even its owner must not read it.
alter table public.login_codes enable row level security;
revoke all on table public.login_codes from anon, authenticated;
grant all on table public.login_codes to service_role;

-- Addresses that must never receive a CUSTOMER session.
--
-- The suffix checks are the obvious part. The admin_users lookup is the
-- important part: private.has_staff_role() and public.is_admin() both grant
-- owner privileges to ANY session whose JWT email matches an active boss row,
-- regardless of how that session was minted. Without this check, a customer
-- login to the owner's ordinary mailbox would carry full admin RLS and bypass
-- the admin portal's MFA entirely.
create or replace function public.is_staff_login_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    lower(coalesce(p_email, '')) like '%@admin.baebe-boo.local'
    or lower(coalesce(p_email, '')) like '%@counter.baebe-boo.local'
    or exists (
      select 1 from public.admin_users
      where lower(email) = lower(p_email) and is_active = true
    )
    or exists (
      select 1
      from public.shop_staff s
      join auth.users u on u.id = s.auth_user_id
      where lower(u.email) = lower(p_email) and s.is_active = true
    )
    or exists (
      select 1 from auth.users u
      where lower(u.email) = lower(p_email)
        and (
          coalesce(u.raw_app_meta_data ->> 'staff_role', '') <> ''
          or coalesce(u.raw_app_meta_data ->> 'counter_staff_id', '') <> ''
        )
    );
$function$;

revoke all on function public.is_staff_login_email(text) from public, anon, authenticated;
grant execute on function public.is_staff_login_email(text) to service_role;

-- Issues a code, enforcing the per-email cooldown and hourly quota atomically.
--
-- Cooldown and quota rejections deliberately leave any live code untouched:
-- invalidating it here would let anyone lock a victim out of their own account
-- permanently by spamming requests for their address.
create or replace function public.issue_login_code(
  p_id uuid,
  p_email text,
  p_code_hash text,
  p_ttl_seconds integer,
  p_cooldown_seconds integer,
  p_hourly_limit integer,
  p_global_hourly_limit integer,
  p_request_ip text default null
)
returns table (status text, expires_at timestamptz, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_email text := lower(btrim(p_email));
  v_last timestamptz;
  v_recent integer;
  v_global integer;
  v_expires timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));

  -- Opportunistic retention trim, bounded by send rate: no pg_cron needed and
  -- it keeps request_ip from accumulating.
  delete from public.login_codes where created_at < now() - interval '24 hours';

  select max(created_at) into v_last
  from public.login_codes where email = v_email;

  if v_last is not null and v_last > now() - make_interval(secs => p_cooldown_seconds) then
    return query select 'cooldown'::text, null::timestamptz,
      greatest(1, ceil(extract(epoch from (v_last + make_interval(secs => p_cooldown_seconds)) - now()))::integer);
    return;
  end if;

  select count(*) into v_recent
  from public.login_codes
  where email = v_email and created_at > now() - interval '1 hour';

  if v_recent >= p_hourly_limit then
    return query select 'quota'::text, null::timestamptz, 3600;
    return;
  end if;

  -- Circuit breaker: without it, an enumeration-safe endpoint that mails any
  -- valid address is an email-bombing relay, and the sending domain's
  -- reputation is what pays for it.
  select count(*) into v_global
  from public.login_codes where created_at > now() - interval '1 hour';

  if v_global >= p_global_hourly_limit then
    return query select 'quota'::text, null::timestamptz, 3600;
    return;
  end if;

  update public.login_codes
     set invalidated_at = now()
   where email = v_email and consumed_at is null and invalidated_at is null;

  v_expires := now() + make_interval(secs => p_ttl_seconds);
  insert into public.login_codes (id, email, code_hash, expires_at, request_ip)
  values (p_id, v_email, p_code_hash, v_expires, p_request_ip);

  return query select 'issued'::text, v_expires, p_cooldown_seconds;
end;
$function$;

revoke all on function public.issue_login_code(uuid, text, text, integer, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.issue_login_code(uuid, text, text, integer, integer, integer, integer, text)
  to service_role;

-- Validates and consumes in one conditional UPDATE, so two concurrent verifies
-- cannot both win. A constant-time compare is not needed: the caller supplies a
-- code, not a digest, so they cannot steer the compared bytes.
create or replace function public.consume_login_code(p_id uuid, p_code_hash text)
returns table (status text, email text, attempts_remaining integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_row public.login_codes%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  select * into v_row from public.login_codes where id = p_id;
  if not found then
    return query select 'invalid'::text, null::text, 0;
    return;
  end if;

  if v_row.consumed_at is not null then
    return query select 'used'::text, null::text, 0;
    return;
  end if;

  if v_row.invalidated_at is not null then
    return query select 'invalid'::text, null::text, 0;
    return;
  end if;

  if v_row.attempts >= v_row.max_attempts then
    return query select 'locked'::text, null::text, 0;
    return;
  end if;

  -- The attempt is always counted, including for an expired code, so a stale
  -- code cannot be used as a free oracle.
  update public.login_codes set attempts = attempts + 1 where id = p_id
  returning * into v_row;

  if v_row.expires_at <= now() then
    return query select 'expired'::text, null::text, 0;
    return;
  end if;

  if v_row.code_hash <> p_code_hash then
    return query select 'incorrect'::text, null::text,
      greatest(0, v_row.max_attempts - v_row.attempts)::integer;
    return;
  end if;

  update public.login_codes set consumed_at = now() where id = p_id;
  return query select 'consumed'::text, v_row.email, 0;
end;
$function$;

revoke all on function public.consume_login_code(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_login_code(uuid, text) to service_role;

notify pgrst, 'reload schema';
