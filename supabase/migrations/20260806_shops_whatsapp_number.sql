-- Per-store WhatsApp contact, managed from the admin Stores workspace and
-- shown on the storefront /stores page (falls back to the global number).
alter table public.shops add column if not exists whatsapp_number text;
