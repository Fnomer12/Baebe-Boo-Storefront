-- Add Parenting Hub metadata columns to content_posts for admin management.

alter table public.content_posts
  add column if not exists category text not null default 'Parenting',
  add column if not exists minutes integer not null default 5 check (minutes > 0 and minutes <= 120),
  add column if not exists cta_label text,
  add column if not exists cta_href text,
  add column if not exists image_alt text;

-- Allow public read of the new columns through the existing content_posts_public_read policy.
-- The policy already filters to published posts with published_at <= now().
