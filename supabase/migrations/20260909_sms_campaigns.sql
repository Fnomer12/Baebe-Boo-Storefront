-- SMS delivery tracking for CRM campaigns sent through FROG by Wigal.
-- Email delivery continues to use campaign_recipients.sent_at.
alter table public.campaign_recipients
  add column if not exists sms_sent_at timestamptz;

create index if not exists campaign_recipients_sms_pending_idx
  on public.campaign_recipients (campaign_id)
  where sms_sent_at is null;
