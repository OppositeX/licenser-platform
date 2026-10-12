-- Multi-tenant foundation (Model B), step 1 of N — ADDITIVE AND BACKWARD-COMPATIBLE.
--
-- Design constraints (see goal "finish Model B without disturbing anyone else"):
--   * The licensing core is single-tenant today. This adds tenancy WITHOUT
--     changing any current behaviour: every existing row is backfilled to a
--     fixed "OTW" tenant, and columns are left NULLABLE here. NOT NULL + RLS
--     policies land in a later migration once the backfill is verified and the
--     query layer is tenant-aware.
--   * The shared Supabase project already contains a `tenants` table owned by a
--     DIFFERENT app. We do NOT touch it. Licenser's tenancy lives in its own
--     `licenser_tenants` table to avoid any collision.
--   * `admins` is intentionally left untouched — it stays the PLATFORM
--     superadmin list (OTW operators who can act on any tenant). Per-client
--     users live in the new `tenant_members` table. So current admin auth keeps
--     working exactly as before.
--
-- This file is authored but NOT auto-applied to production: applying it to the
-- live DB (shared, serving CNVS) is a gated cutover step.

-- ── Tenants ──────────────────────────────────────────────────────────────────
create table if not exists public.licenser_tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  status      text not null default 'active' check (status in ('active','suspended')),
  github_org  text,
  -- White-label surface (productization): display name, logo URL, support/from
  -- email, custom portal domain, accent colour. Empty = fall back to platform
  -- defaults, so an un-branded tenant renders exactly like today.
  branding    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The fixed OTW tenant. Its id is a well-known constant referenced from code
-- (lib/licenser/tenant.ts OTW_TENANT_ID) so the default-tenant fallback is
-- stable across environments.
insert into public.licenser_tenants (id, name, slug, github_org)
values ('00000000-0000-0000-0000-000000000001', 'OTW', 'otw', 'OppositeX')
on conflict (id) do nothing;

-- ── Per-client membership + roles (admins stays = platform superadmins) ──────
create table if not exists public.tenant_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.licenser_tenants(id) on delete cascade,
  email       text not null,
  role        text not null default 'admin' check (role in ('owner','admin','viewer')),
  created_at  timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists tenant_members_tenant_idx on public.tenant_members (tenant_id);
create index if not exists tenant_members_email_idx  on public.tenant_members (lower(email));

-- ── Add nullable tenant_id across the ownership chain ────────────────────────
alter table public.products          add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.plans             add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.licenses          add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.activations       add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.product_releases  add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.events            add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.validation_log    add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.feedback          add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.license_overrides add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.outbound_webhooks add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.api_tokens        add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.incidents         add column if not exists tenant_id uuid references public.licenser_tenants(id);
alter table public.service_components add column if not exists tenant_id uuid references public.licenser_tenants(id);

-- ── Backfill everything to OTW ───────────────────────────────────────────────
-- Top-level tables default straight to OTW.
update public.products          set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.outbound_webhooks set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.api_tokens        set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.incidents         set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update public.service_components set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

-- Children inherit from their parent where one exists, else fall back to OTW.
update public.plans p
  set tenant_id = coalesce(pr.tenant_id, '00000000-0000-0000-0000-000000000001')
  from public.products pr where p.product_id = pr.id and p.tenant_id is null;
update public.plans set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

update public.licenses l
  set tenant_id = coalesce(pr.tenant_id, '00000000-0000-0000-0000-000000000001')
  from public.products pr where l.product_id = pr.id and l.tenant_id is null;
update public.licenses set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

update public.activations a
  set tenant_id = coalesce(l.tenant_id, '00000000-0000-0000-0000-000000000001')
  from public.licenses l where a.license_id = l.id and a.tenant_id is null;
update public.activations set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

update public.product_releases r
  set tenant_id = coalesce(pr.tenant_id, '00000000-0000-0000-0000-000000000001')
  from public.products pr where r.product_id = pr.id and r.tenant_id is null;
update public.product_releases set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

update public.events e
  set tenant_id = coalesce(pr.tenant_id, '00000000-0000-0000-0000-000000000001')
  from public.products pr where e.product_id = pr.id and e.tenant_id is null;
update public.events set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

update public.validation_log v
  set tenant_id = coalesce(pr.tenant_id, '00000000-0000-0000-0000-000000000001')
  from public.products pr where v.product_id = pr.id and v.tenant_id is null;
update public.validation_log set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

update public.feedback f
  set tenant_id = coalesce(pr.tenant_id, '00000000-0000-0000-0000-000000000001')
  from public.products pr where f.product_id = pr.id and f.tenant_id is null;
update public.feedback set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

update public.license_overrides o
  set tenant_id = coalesce(l.tenant_id, '00000000-0000-0000-0000-000000000001')
  from public.licenses l where o.license_id = l.id and o.tenant_id is null;
update public.license_overrides set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

-- ── Indexes for the scoping the query layer will do ──────────────────────────
create index if not exists products_tenant_idx          on public.products (tenant_id);
create index if not exists plans_tenant_idx             on public.plans (tenant_id);
create index if not exists licenses_tenant_idx          on public.licenses (tenant_id);
create index if not exists activations_tenant_idx       on public.activations (tenant_id);
create index if not exists product_releases_tenant_idx  on public.product_releases (tenant_id);
create index if not exists events_tenant_idx            on public.events (tenant_id);
create index if not exists validation_log_tenant_idx    on public.validation_log (tenant_id);
create index if not exists feedback_tenant_idx          on public.feedback (tenant_id);
create index if not exists license_overrides_tenant_idx on public.license_overrides (tenant_id);
create index if not exists outbound_webhooks_tenant_idx on public.outbound_webhooks (tenant_id);
create index if not exists api_tokens_tenant_idx        on public.api_tokens (tenant_id);

-- RLS: licenser_tenants + tenant_members are reached only via the service-role
-- client (same posture as the rest of the app), so force RLS with no policy.
alter table public.licenser_tenants enable row level security;
alter table public.licenser_tenants force row level security;
alter table public.tenant_members  enable row level security;
alter table public.tenant_members  force row level security;
