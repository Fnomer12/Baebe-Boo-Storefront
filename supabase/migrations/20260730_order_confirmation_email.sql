-- Exactly-once order confirmation email.
--
-- `finalizeVerifiedOrder` is reached from two directions for the same payment:
-- the browser calling /api/paystack/verify, and Paystack calling
-- /api/paystack/webhook. Both guard on `payment_status = 'paid'`, but that is a
-- check-then-act: when they land together neither has committed yet, both pass,
-- and the customer gets two receipts.
--
-- This column is claimed with a conditional UPDATE whose row count decides who
-- sends, so the race resolves in Postgres instead of in application code.

alter table public.orders
  add column if not exists confirmation_email_sent_at timestamptz;

-- Finds the small set of paid orders still awaiting a receipt, e.g. after an
-- outage at the email provider. Partial, so it stays tiny.
create index if not exists orders_confirmation_pending_idx
  on public.orders(created_at)
  where confirmation_email_sent_at is null;

notify pgrst, 'reload schema';
