-- Admin parity migration — additive only.
-- Brings the platform schema up to par with the WP plugin admin UI:
--   feedback, logs, key/value settings, license override audit trail,
--   webhook delivery log (GitHub/Woo/Stripe), product/plan extras,
--   plus the Stripe columns required for the upcoming checkout flow.

-- 1. products: marketing copy + Stripe linkage
alter table public.products
  add column if not exists homepage text,
  add column if not exists description text,
  add column if not exists stripe_product_id text;
create index if not exists products_stripe_idx on public.products (stripe_product_id) where stripe_product_id is not null;

-- 2. plans: period semantics used by the WP admin + Stripe linkage
alter table public.plans
  add column if not exists period text not null default 'lifetime'
    check (period in ('lifetime','day','week','month','year')),
  add column if not exists period_count int not null default 0,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_product_id text;
create index if not exists plans_stripe_price_idx on public.plans (stripe_price_id) where stripe_price_id is not null;

-- 3. licenses: Stripe linkage so the upcoming checkout can issue/track licenses
alter table public.licenses
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_checkout_id text;
create index if not exists licenses_stripe_sub_idx on public.licenses (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists licenses_stripe_cust_idx on public.licenses (stripe_customer_id) where stripe_customer_id is not null;

-- 4. license_overrides — audit trail for manual admin actions (preset/status/expiry tweaks).
create table if not exists public.license_overrides (
  id           uuid primary key default gen_random_uuid(),
  license_id   uuid not null references public.licenses(id) on delete cascade,
  admin_email  text not null,
  preset       text,
  status       text,
  expires_at   timestamptz,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists license_overrides_license_idx on public.license_overrides (license_id);
create index if not exists license_overrides_created_idx on public.license_overrides (created_at desc);

-- 5. feedback — deactivation reasons posted from the SDK.
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  license_id  uuid references public.licenses(id) on delete set null,
  product_id  uuid references public.products(id) on delete set null,
  domain      text,
  reason      text not null check (reason in ('bug','alternative','no-longer-needed','temporary','other')),
  message     text,
  created_at  timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_reason_idx  on public.feedback (reason);
create index if not exists feedback_product_idx on public.feedback (product_id);

-- 6. logs — generic system log surfaced on /admin/logs.
create table if not exists public.logs (
  id          bigserial primary key,
  level       text not null default 'info' check (level in ('info','warn','error')),
  channel     text not null default 'app',
  message     text not null,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists logs_created_idx on public.logs (created_at desc);
create index if not exists logs_level_idx   on public.logs (level);
create index if not exists logs_channel_idx on public.logs (channel);

-- 7. settings — key/value config store for mutable admin settings.
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default 'null'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
-- Defaults — only inserted if missing so re-running the migration is safe.
insert into public.settings (key, value) values
  ('rate_limit_per_minute',  '60'::jsonb),
  ('download_url_ttl',       '600'::jsonb),
  ('log_retention_days',     '30'::jsonb),
  ('signing_secret',         '""'::jsonb),
  ('github_webhook_secret',  '""'::jsonb),
  ('github_pat',             '""'::jsonb),
  ('woo_auto_issue',         'true'::jsonb),
  ('woo_auto_revoke',        'true'::jsonb),
  ('woo_grace_days',         '7'::jsonb),
  ('stripe_publishable_key', '""'::jsonb),
  ('stripe_secret_key',      '""'::jsonb),
  ('stripe_webhook_secret',  '""'::jsonb),
  ('stripe_mode',            '"test"'::jsonb)
on conflict (key) do nothing;

-- 8. webhook_deliveries — single log table for GitHub / Woo / Stripe inbound webhooks.
create table if not exists public.webhook_deliveries (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('github','woocommerce','stripe')),
  event       text,
  delivery_id text,
  product_id  uuid references public.products(id) on delete set null,
  status      text not null default 'received' check (status in ('received','ok','error','ignored')),
  message     text,
  payload     jsonb,
  received_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_source_idx   on public.webhook_deliveries (source, received_at desc);
create index if not exists webhook_deliveries_received_idx on public.webhook_deliveries (received_at desc);

-- 9. plan_woo_variations — variation-level mapping (a Woo product can have multiple variations,
--    each mapping to a different plan). Plan-level woo_product_id stays for one-to-one mappings.
create table if not exists public.plan_woo_variations (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references public.plans(id) on delete cascade,
  woo_product_id   text not null,
  woo_variation_id text not null default '',
  created_at       timestamptz not null default now(),
  unique (woo_product_id, woo_variation_id)
);
create index if not exists plan_woo_variations_plan_idx on public.plan_woo_variations (plan_id);
