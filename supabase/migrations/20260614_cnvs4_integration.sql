-- CNVS 4 integration — additive only. Does NOT drop or alter Benny's columns.
-- Adds Woo wiring, per-plan feature flags, and customer/order metadata on licenses.

-- 1. products: wire to Woo + GitHub release feed metadata
alter table public.products
  add column if not exists woo_product_id text,
  add column if not exists allowed_domains text[] not null default '{}',
  add column if not exists active boolean not null default true;
create index if not exists products_woo_idx on public.products (woo_product_id) where woo_product_id is not null;

-- 2. plans: feature flags + WC product mapping + tier alias
alter table public.plans
  add column if not exists feature_flags jsonb not null default '[]'::jsonb,
  add column if not exists woo_product_id text,
  add column if not exists billing_interval text check (billing_interval in ('monthly','annual','one_time','custom')),
  add column if not exists trial_days int not null default 0;
create index if not exists plans_woo_idx on public.plans (woo_product_id) where woo_product_id is not null;

-- 3. licenses: customer + order context
alter table public.licenses
  add column if not exists customer_name text,
  add column if not exists woo_order_id text,
  add column if not exists woo_subscription_id text,
  add column if not exists domains_used text[] not null default '{}';
create index if not exists licenses_woo_order_idx on public.licenses (woo_order_id) where woo_order_id is not null;
create index if not exists licenses_woo_sub_idx   on public.licenses (woo_subscription_id) where woo_subscription_id is not null;
create index if not exists licenses_email_idx     on public.licenses (lower(customer_email));

-- 4. validation_log: per-call audit for analytics + abuse detection.
-- Kept SEPARATE from public.events (which is general-purpose JSONB) for query speed.
create table if not exists public.validation_log (
  id          uuid primary key default gen_random_uuid(),
  license_id  uuid references public.licenses(id) on delete set null,
  product_id  uuid references public.products(id) on delete set null,
  ts          timestamptz not null default now(),
  domain      text,
  ip          text,
  fingerprint text,
  result      text not null check (result in ('valid','expired','revoked','suspended','unknown_key','domain_not_authorized','product_mismatch','rate_limited')),
  source      text not null default 'api_v2' check (source in ('api_v1','api_v2','api_check'))
);
create index if not exists validation_log_license_idx on public.validation_log (license_id);
create index if not exists validation_log_ts_idx      on public.validation_log (ts desc);
create index if not exists validation_log_result_idx  on public.validation_log (result);

-- 5. Seed CNVS-4 product + plans. Idempotent — uses ON CONFLICT against unique (slug) and (product_id, slug).
insert into public.products (slug, name, github_repo, version, active)
values ('cnvs-runtime', 'CNVS 4 Runtime', 'GLOO-ooo/cnvs-4', null, true)
on conflict (slug) do update set name = excluded.name, github_repo = excluded.github_repo, active = excluded.active;

-- Plan feature flags reference lib/licenser/tiers.ts — keep the two in sync.
-- Pricing locked in by Omri 2026-06-14: $19 / $49 / $149 / Enterprise + 20% annual discount + 14-day trial on Starter+.
with p as (select id from public.products where slug = 'cnvs-runtime')
insert into public.plans (product_id, slug, name, max_activations, recurring, price_cents, billing_interval, trial_days, feature_flags)
values
  ((select id from p), 'starter_monthly', 'Starter (monthly)',      3,    true,  1900,  'monthly', 14, '["preset-library"]'::jsonb),
  ((select id from p), 'starter_annual',  'Starter (annual)',       3,    true,  18240, 'annual',  14, '["preset-library"]'::jsonb),
  ((select id from p), 'pro_monthly',     'Pro (monthly)',          10,   true,  4900,  'monthly', 14, '["preset-library","ai-relay","copilot"]'::jsonb),
  ((select id from p), 'pro_annual',      'Pro (annual)',           10,   true,  47040, 'annual',  14, '["preset-library","ai-relay","copilot"]'::jsonb),
  ((select id from p), 'studio_monthly',  'Studio Pro (monthly)',   25,   true,  14900, 'monthly', 14, '["preset-library","ai-relay","copilot","connector-*","white-label"]'::jsonb),
  ((select id from p), 'studio_annual',   'Studio Pro (annual)',    25,   true,  143040,'annual',  14, '["preset-library","ai-relay","copilot","connector-*","white-label"]'::jsonb),
  ((select id from p), 'enterprise',      'Enterprise (custom)',    999,  true,  0,     'custom',  0,  '["preset-library","ai-relay","copilot","connector-*","white-label","sso","dedicated-support"]'::jsonb)
on conflict (product_id, slug) do update set
  name           = excluded.name,
  max_activations= excluded.max_activations,
  recurring      = excluded.recurring,
  price_cents    = excluded.price_cents,
  billing_interval = excluded.billing_interval,
  trial_days     = excluded.trial_days,
  feature_flags  = excluded.feature_flags;
