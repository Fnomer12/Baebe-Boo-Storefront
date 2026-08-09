-- Align audit_logs.record_id with the application trigger, which writes text ids.
-- Existing uuid values are safely cast to text.

alter table public.audit_logs
  alter column record_id type text using record_id::text;
