-- Vending credits.grant idempotency ledger.
--
-- Each real credit-pack grant dispatched by the vending API lands one row here,
-- keyed by a stable idempotency key (license_id : woo_order_id : sku) so a repeat
-- call with the same order never re-dispatches. This is OUR side of idempotency;
-- the CNVS receiver dedupes independently on the same sourceRef granularity.
-- Dry-runs never write here.
create table if not exists public.vending_credit_grants (
  id                uuid primary key default gen_random_uuid(),
  idempotency_key   text unique not null,
  license_id        text not null,
  woo_order_id      text not null,
  sku               text not null,
  credits           integer not null check (credits >= 0),
  quantity          integer not null default 1 check (quantity >= 1),
  event_payload     jsonb,
  targets           integer not null default 0,
  delivered_ok      boolean not null default false,
  delivery_results  jsonb,
  token_prefix      text,
  created_by        text,
  created_at        timestamptz not null default now()
);

create index if not exists vending_credit_grants_license_idx
  on public.vending_credit_grants (license_id, created_at desc);

alter table public.vending_credit_grants enable row level security;
alter table public.vending_credit_grants force row level security;
-- No policies: reachable only via the service-role client (bearer-scoped API).
