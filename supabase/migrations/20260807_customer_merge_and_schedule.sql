-- Merge the two customer records, and give the birthday campaign a scheduler.
--
-- WHY THIS EXISTS
-- ---------------
-- Baebe Boo kept customers in two places that never met:
--
--   public.members            the homepage "Join the family" form. Parent name,
--                             child name, phone, email, child's date of birth.
--                             No user_id, no auth user, no orders.
--   public.customer_profiles  created by the bootstrap_customer_account trigger
--                             the first time somebody signs in, with
--                             customer_children alongside it.
--
-- They were joined only by loose email matching at read time, so a customer who
-- signed in and shopped never appeared in admin unless they had ALSO filled in
-- the homepage form — while the CSV export button on that same screen read
-- report_top_customers, which is built from customer_profiles. One screen, two
-- answers.
--
-- This migration makes customer_profiles the single source of truth and gives
-- members a real foreign key to it. It also schedules the campaign dispatcher
-- from the database rather than from a host cron file, so it survives the move
-- to Vercel that this deployment is heading for.
--
-- SAFE TO RUN MORE THAN ONCE. It writes no customer data it cannot re-derive:
-- the only backfill here is the easy half (members whose email already has an
-- account). Minting auth users for the rest is scripts/backfill-customer-merge.mjs,
-- deliberately kept out of SQL because it has to go through the GoTrue admin API.
--
-- AFTER APPLYING:
--   1. node scripts/backfill-customer-merge.mjs            (dry run, prints a plan)
--   2. node scripts/backfill-customer-merge.mjs --apply    (does it)
--   3. Store the two Vault secrets named at the bottom of this file, or the
--      scheduled job will run and get a 401 every time.

-- ---------------------------------------------------------------------------
-- 1. members gains a real link to the account.
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Not unique: a parent with three children has three members rows and one
-- account, which is exactly the shape the merge is supposed to produce.
create index if not exists members_user_id_idx on public.members(user_id);
-- Every lookup in the admin routes is by lower-cased email.
create index if not exists members_email_lower_idx on public.members(lower(email));

comment on column public.members.user_id is
  'The auth account this family lead belongs to. Null means the lead has never signed in; scripts/backfill-customer-merge.mjs mints the account.';

-- The easy half of the merge, and it is idempotent by construction.
update public.members m
set user_id = u.id
from auth.users u
where m.user_id is null
  and m.email is not null
  and lower(u.email) = lower(trim(m.email));

-- ---------------------------------------------------------------------------
-- 2. join_family writes the unified model going forward.
-- ---------------------------------------------------------------------------
-- Same signature as before, so src/app/api/family/join/route.ts is unchanged.
--
-- It deliberately does NOT create an auth user. This RPC is reachable from an
-- unauthenticated public form; minting accounts from there would let anyone
-- create an account for an address they do not control. It links to an account
-- that already exists, and leaves the rest to the backfill script, which runs
-- with the service key under a human.
create or replace function public.join_family(
  p_parent_name text,
  p_child_first_name text,
  p_child_last_name text,
  p_phone text,
  p_email text,
  p_child_date_of_birth date,
  p_policy_version text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_member_id uuid;
  v_user_id uuid;
  v_email text := lower(trim(p_email));
  v_phone text := trim(p_phone);
begin
  if length(trim(p_parent_name)) = 0
    or length(trim(p_child_first_name)) = 0
    or length(trim(p_child_last_name)) = 0
    or length(v_phone) < 7
    or position('@' in v_email) < 2
    or length(trim(p_policy_version)) = 0
    or length(trim(p_source)) = 0 then
    raise exception 'Invalid family membership details';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email || ':' || v_phone, 0));

  select id into v_user_id from auth.users where lower(email) = v_email limit 1;

  select id into v_member_id from public.members
  where lower(email) = v_email and phone = v_phone
  order by created_at limit 1;

  if v_member_id is null then
    insert into public.members (
      parent_name, child_first_name, child_last_name, phone, email,
      child_date_of_birth, user_id
    ) values (
      trim(p_parent_name), trim(p_child_first_name), trim(p_child_last_name),
      v_phone, v_email, p_child_date_of_birth, v_user_id
    ) returning id into v_member_id;
  elsif v_user_id is not null then
    update public.members set user_id = v_user_id
    where id = v_member_id and user_id is null;
  end if;

  -- Mirror into the source of truth when there is an account to mirror into.
  -- Blanks only: the profile is what the customer maintains from /account, and
  -- a form filled in on the homepage must not overwrite a correction they made
  -- there last week.
  if v_user_id is not null then
    insert into public.customer_profiles (user_id, email, full_name, phone)
    values (v_user_id, v_email, trim(p_parent_name), v_phone)
    on conflict (user_id) do update set
      full_name = coalesce(nullif(trim(customer_profiles.full_name), ''), excluded.full_name),
      phone     = coalesce(nullif(trim(customer_profiles.phone), ''), excluded.phone),
      updated_at = now();

    -- Date of birth is the identity: a nickname changes, a birthday does not.
    if not exists (
      select 1 from public.customer_children cc
      where cc.user_id = v_user_id
        and (
          cc.date_of_birth = p_child_date_of_birth
          or lower(coalesce(cc.first_name, '')) = lower(trim(p_child_first_name))
        )
    ) then
      insert into public.customer_children (user_id, first_name, date_of_birth)
      values (v_user_id, trim(p_child_first_name), p_child_date_of_birth);
    end if;
  end if;

  insert into public.customer_consents (
    email, phone, purpose, channel, status, policy_version, source
  ) values
    (v_email, v_phone, 'family_marketing', 'email', 'granted', trim(p_policy_version), trim(p_source)),
    (v_email, v_phone, 'family_marketing', 'whatsapp', 'granted', trim(p_policy_version), trim(p_source));

  return v_member_id;
end;
$function$;

revoke all on function public.join_family(text, text, text, text, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.join_family(text, text, text, text, text, date, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Birthdays, without the 29 February landmine.
-- ---------------------------------------------------------------------------
-- The previous build_birthday_campaign built the next birthday with
-- make_date(year, 2, 29), which RAISES "date field value out of range" in a
-- common year. One leap-day child in the table and the whole recipient preview
-- 500s. Clamping to the last day of the month gives 28 February, which is the
-- same answer src/domain/crm/birthday.ts gives in TypeScript.
create or replace function private.days_in(p_year int, p_month int)
returns int
language sql
immutable
set search_path = pg_catalog
as $function$
  select extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int;
$function$;

create or replace function private.next_anniversary(p_dob date, p_from date)
returns date
language sql
immutable
set search_path = pg_catalog, private
as $function$
  select case when this_year >= p_from then this_year else next_year end
  from (
    select
      make_date(y, m, least(d, private.days_in(y, m)))         as this_year,
      make_date(y + 1, m, least(d, private.days_in(y + 1, m))) as next_year
    from (
      select
        extract(year from p_from)::int as y,
        extract(month from p_dob)::int as m,
        extract(day from p_dob)::int   as d
    ) parts
  ) s;
$function$;

-- The recipient list now reads BOTH sources. customer_children is the
-- destination of the merge; members is where the children still live for every
-- lead the backfill has not converted yet. Reading both means the campaign
-- works the day this migration lands rather than the day the backfill finishes.
drop function if exists public.build_birthday_campaign(integer);
create or replace function public.build_birthday_campaign(p_days_ahead integer default 30)
returns table (
  user_id uuid,
  member_id uuid,
  email text,
  parent_name text,
  child_name text,
  child_date_of_birth date,
  days_until_birthday integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  with candidates as (
    select
      cp.user_id,
      null::uuid                as member_id,
      lower(trim(cp.email))     as email,
      cp.full_name              as parent_name,
      cc.first_name             as child_name,
      cc.date_of_birth          as child_dob
    from public.customer_children cc
    join public.customer_profiles cp on cp.user_id = cc.user_id
    where cc.date_of_birth is not null
      and coalesce(trim(cp.email), '') <> ''
    union all
    select
      m.user_id,
      m.id,
      lower(trim(m.email)),
      m.parent_name,
      nullif(trim(coalesce(m.child_first_name, '')), ''),
      m.child_date_of_birth
    from public.members m
    where m.child_date_of_birth is not null
      and coalesce(trim(m.email), '') <> ''
  ),
  dated as (
    select c.*, private.next_anniversary(c.child_dob, current_date) as birthday
    from candidates c
  )
  -- One email per mailbox per child. A parent in both tables must not be
  -- mailed twice, and the copy that knows the account wins because it is the
  -- one whose loyalty points can be credited.
  --
  -- Every reference below is qualified with `d.` on purpose: RETURNS TABLE puts
  -- user_id, email, parent_name and the rest in scope as OUT parameters, and an
  -- unqualified mention of any of them is "column reference is ambiguous" at
  -- CREATE FUNCTION time.
  select distinct on (d.email, d.child_dob)
    d.user_id,
    d.member_id,
    d.email,
    coalesce(d.parent_name, '') as parent_name,
    coalesce(d.child_name, '')  as child_name,
    d.child_dob                 as child_date_of_birth,
    (d.birthday - current_date)::int as days_until_birthday
  from dated d
  where (d.birthday - current_date) between 0 and greatest(coalesce(p_days_ahead, 30), 0)
  order by d.email, d.child_dob, (d.user_id is null), (d.birthday - current_date);
$function$;

revoke all on function public.build_birthday_campaign(integer) from public, anon;
grant execute on function public.build_birthday_campaign(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. campaign_recipients: stop duplicating everyone without an account.
-- ---------------------------------------------------------------------------
-- The route upserted with onConflict "campaign_id, user_id" and user_id is
-- nullable. NULL is never equal to NULL in Postgres, so the constraint could
-- not fire for exactly the rows that duplicated, and every save re-inserted
-- every recipient who had no account.
-- Of each duplicate set, keep the row that already recorded a send. Deleting
-- that one and keeping an unsent twin would put the recipient straight back on
-- the dispatcher's work list, and mailing somebody twice is the failure mode
-- this whole section exists to stop.
delete from public.campaign_recipients cr
using (
  select id, row_number() over (
    partition by campaign_id, lower(trim(email))
    -- `nulls last` on an ascending sort puts a real sent_at first.
    order by sent_at nulls last, created_at, id
  ) as row_rank
  from public.campaign_recipients
) ranked
where ranked.id = cr.id and ranked.row_rank > 1;

update public.campaign_recipients
set email = lower(trim(email))
where email <> lower(trim(email));

alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_campaign_id_user_id_key;

create unique index if not exists campaign_recipients_campaign_email_key
  on public.campaign_recipients (campaign_id, email);

-- The cron's work list is "not sent yet", so index exactly that.
create index if not exists campaign_recipients_pending_idx
  on public.campaign_recipients (campaign_id)
  where sent_at is null;

-- ---------------------------------------------------------------------------
-- 5. campaigns: room to record why a send did not happen.
-- ---------------------------------------------------------------------------
-- A simulated send is a success that delivers nothing. The app now refuses to
-- stamp status='sent' for one, and needs somewhere to say so — otherwise the
-- only evidence is an HTTP response nobody kept.
alter table public.campaigns add column if not exists last_error text;
alter table public.campaigns add column if not exists last_attempted_at timestamptz;

comment on column public.campaigns.last_error is
  'Why the most recent send attempt did not complete, in the words the admin screen shows. Null when the last attempt succeeded.';
comment on column public.campaigns.scheduled_at is
  'When the dispatcher should send this campaign. Only read for status = ''ready''; a draft is never sent automatically.';

-- The dispatcher's candidate set.
create index if not exists campaigns_due_idx
  on public.campaigns (scheduled_at)
  where status = 'ready';

-- ---------------------------------------------------------------------------
-- 6. Schedule the dispatcher from the database.
-- ---------------------------------------------------------------------------
-- WHY IN THE DATABASE. There is no cron in this repo and no scheduler of any
-- kind: campaigns.scheduled_at was written and never read by anything. A host
-- crontab would work today and vanish the moment this deployment moves to
-- Vercel, so the schedule lives next to the data it acts on.
--
-- WHY EVERY 15 MINUTES. pg_net is fire-and-forget: it queues the request and
-- cannot retry on error, and the response lands in net._http_response rather
-- than anywhere the job can branch on. A single daily tick that failed would
-- simply skip that day's birthdays. Twelve ticks across the 07:00-09:59 window
-- means eleven more chances, which only works because the endpoint is
-- idempotent (campaign_recipients.sent_at is null is the work list) and
-- batched (it returns {sent, remaining} and the next tick picks up the rest).
--
-- Ghana is UTC+0 all year and Postgres cron expressions are evaluated in the
-- server's timezone, so 7-9 here is 7-9 in Accra with no conversion.
--
-- WHY VAULT. cron.job.command is readable by anyone who can read the cron
-- schema, so an inline bearer token would be a shared secret sitting in a
-- table. Vault keeps it encrypted and the job body only names it.
do $do$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable (%). Enable it from the Supabase dashboard, then re-run this file.', sqlerrm;
end
$do$;

do $do$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net unavailable (%). Enable it from the Supabase dashboard, then re-run this file.', sqlerrm;
end
$do$;

-- Store these once, by hand, before the first tick:
--
--   select vault.create_secret(
--     'https://baebe-boo.jtechinnovations.tech', 'baebe_boo_site_url',
--     'Origin the campaign dispatcher calls. No trailing slash.');
--   select vault.create_secret(
--     '<the same value as CRON_SECRET in the app env>', 'baebe_boo_cron_secret',
--     'Bearer token for GET /api/cron/campaigns.');
--
-- To rotate: select vault.update_secret(id, new_value) — the job body does not change.
do $do$
begin
  perform cron.schedule(
    'baebe-boo-campaign-dispatch',
    '*/15 7-9 * * *',
    $job$
      select net.http_get(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'baebe_boo_site_url')
               || '/api/cron/campaigns',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'baebe_boo_cron_secret')
        ),
        timeout_milliseconds := 25000
      );
    $job$
  );
exception when others then
  raise notice 'Could not schedule baebe-boo-campaign-dispatch (%). Schedule it by hand once pg_cron and pg_net are enabled.', sqlerrm;
end
$do$;
