-- Restore the account wishlist tables required by the storefront API.
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Wishlist',
  is_public boolean not null default false,
  public_token uuid unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wishlist_items (
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wishlist_id, product_id)
);

alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;

drop policy if exists wishlists_owner on public.wishlists;
create policy wishlists_owner on public.wishlists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists wishlist_items_owner on public.wishlist_items;
create policy wishlist_items_owner on public.wishlist_items
  for all to authenticated
  using (exists (
    select 1 from public.wishlists w
    where w.id = wishlist_id and w.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.wishlists w
    where w.id = wishlist_id and w.user_id = (select auth.uid())
  ));

grant select, insert, update, delete on public.wishlists to authenticated;
grant select, insert, update, delete on public.wishlist_items to authenticated;
