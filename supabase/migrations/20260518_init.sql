-- Licenser Platform initial schema
create extension if not exists "pgcrypto";

create table if not exists public.admins (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  created_at  timestamptz not null default now()
);
insert into public.admins (email) values ('otw.srl@gmail.com') on conflict do nothing;

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  version     text,
  github_repo text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.plans (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  slug             text not null,
  name             text not null,
  max_activations  int  not null default 1,
  recurring        boolean not null default false,
  price_cents      int  not null default 0,
  created_at       timestamptz not null default now(),
  unique (product_id, slug)
);

create table if not exists public.licenses (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete restrict,
  plan_id          uuid references public.plans(id) on delete set null,
  customer_email   text,
  key              text not null unique,
  key_prefix       text generated always as (substr(key, 1, 8)) stored,
  status           text not null default 'active' check (status in ('active','suspended','revoked','expired')),
  max_activations  int  not null default 1,
  expires_at       timestamptz,
  grace_until      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists licenses_product_idx on public.licenses (product_id);
create index if not exists licenses_status_idx  on public.licenses (status);

create table if not exists public.activations (
  id             uuid primary key default gen_random_uuid(),
  license_id     uuid not null references public.licenses(id) on delete cascade,
  site_url       text not null,
  ip             text,
  user_agent     text,
  plugin_version text,
  wp_version     text,
  php_version    text,
  instance_token text not null default replace(gen_random_uuid()::text, '-', ''),
  status         text not null default 'active' check (status in ('active','deactivated')),
  activated_at   timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (license_id, site_url)
);
create index if not exists activations_license_idx on public.activations (license_id);
create index if not exists activations_status_idx  on public.activations (status);

create table if not exists public.product_releases (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  version       text not null,
  download_url  text,
  changelog     text,
  release_notes text,
  is_latest     boolean not null default false,
  released_at   timestamptz not null default now(),
  unique (product_id, version)
);
create index if not exists releases_product_idx on public.product_releases (product_id);

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  license_id   uuid references public.licenses(id) on delete set null,
  product_id   uuid references public.products(id) on delete set null,
  type         text not null,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists events_license_idx  on public.events (license_id);
create index if not exists events_type_idx     on public.events (type);
create index if not exists events_created_idx  on public.events (created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute procedure public.touch_updated_at();

drop trigger if exists licenses_touch on public.licenses;
create trigger licenses_touch before update on public.licenses
  for each row execute procedure public.touch_updated_at();
