-- Outbound webhooks: fire signed license-lifecycle events to customer-configured
-- endpoints. Additive + idempotent. RLS enabled to match the platform pattern
-- (all access is via the service role).

create table if not exists public.outbound_webhooks (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  secret      text not null,
  events      text[] not null default '{*}',   -- event types, or '*' for all
  active      boolean not null default true,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.outbound_webhooks enable row level security;
alter table public.outbound_webhooks force row level security;

create table if not exists public.outbound_webhook_deliveries (
  id          uuid primary key default gen_random_uuid(),
  webhook_id  uuid references public.outbound_webhooks(id) on delete cascade,
  event       text not null,
  license_id  uuid,
  status      text not null default 'pending' check (status in ('ok','error','pending')),
  status_code int,
  attempts    int not null default 1,
  duration_ms int,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists outbound_deliveries_webhook_idx on public.outbound_webhook_deliveries (webhook_id, created_at desc);
create index if not exists outbound_deliveries_created_idx on public.outbound_webhook_deliveries (created_at desc);
alter table public.outbound_webhook_deliveries enable row level security;
alter table public.outbound_webhook_deliveries force row level security;
