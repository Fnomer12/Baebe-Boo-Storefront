-- SMS delivery markers for transactional notifications sent through FROG.
-- Campaign SMS uses campaign_recipients.sms_sent_at separately.
alter table public.orders
  add column if not exists confirmation_sms_sent_at timestamptz;

create index if not exists orders_confirmation_sms_pending_idx
  on public.orders (id)
  where confirmation_sms_sent_at is null;
