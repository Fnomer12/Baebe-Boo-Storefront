-- Objects that existed only in production, captured into the repo.
--
-- Both were created by hand in the SQL editor and appear in no migration, so a
-- database rebuilt from this directory silently lacked them. One of them is a
-- security control, which makes that gap worth closing rather than tidying.
--
-- Found by diffing the production project against a branch built purely from
-- these migrations.

-- ---------------------------------------------------------------------------
-- 1. Auto-enable RLS on every new table in `public`.
-- ---------------------------------------------------------------------------
-- A backstop, not a substitute for policies: a table created without an
-- explicit `alter table ... enable row level security` still ends up protected,
-- and because a table with RLS on and no policy denies everything, the failure
-- mode is "nobody can read it" rather than "anyone can".
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (system schema or not in enforced list: %.)',
        cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$function$;

do $$ begin
  create event trigger ensure_rls
    on ddl_command_end
    execute function public.rls_auto_enable();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Default a staff code when one is not supplied.
-- ---------------------------------------------------------------------------
-- Only fires when `staff_code` is null. The admin flow in
-- src/lib/admin/counter-credentials.ts always supplies its own code (BB + 6 hex)
-- because the counter login address is derived from it, so this covers rows
-- inserted directly against the database. Note the two formats differ: this
-- produces `YYYY-YYBBxxxxxx`, the application produces `BBxxxxxx`.
create or replace function public.generate_staff_code()
returns trigger
language plpgsql
as $function$
begin
  if new.staff_code is null then
    new.staff_code :=
      to_char(now(), 'YYYY') ||
      '-' ||
      to_char(now(), 'YY') ||
      'BB' ||
      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  end if;

  return new;
end;
$function$;

drop trigger if exists set_staff_code on public.shop_staff;
create trigger set_staff_code
  before insert on public.shop_staff
  for each row execute function public.generate_staff_code();
