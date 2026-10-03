# Multi-tenant (Model B) — cutover runbook

This branch (`feat/multi-tenant-foundation`, PR #22) makes Licenser multi-tenant
**without touching the live system**. Everything is additive and backward-compatible:
an implicit **OTW tenant** is the default, so until the migration is applied and the
branch merged, production behaves exactly as the single-tenant version — the live
CNVS integration is untouched throughout.

This document is the **gated handoff**: the one step that actually affects the live,
shared database is applying the migration, and that is a human decision (it touches
the DB another app shares, and the DB that serves CNVS in production).

## What was built (all on the branch, nothing live)

- **Schema** (`supabase/migrations/20261003_multitenant_foundation.sql`): new
  `licenser_tenants` (own table — the other app's `tenants` is untouched) + `branding`
  JSON for white-label; `tenant_members` (roles owner/admin/viewer); nullable
  `tenant_id` across the ownership chain, backfilled to OTW; indexes. `NOT NULL` + RLS
  deferred (see Phase 3).
- **Isolation model**: the service-role client bypasses RLS, so isolation is enforced
  in the **query layer** (`lib/licenser/tenant-db.ts` + per-page `.eq('tenant_id', …)`).
  `admins` stays the **platform superadmin** list (act on any tenant); `tenant_members`
  are per-client users. Public key-addressed endpoints (`/api/v*/validate`,
  `/api/v1/activate`, update delivery) are **deliberately not scoped** — a key/token is
  globally unique, so the live CNVS path needed no change.
- **Admin**: `requireAdminTenant` + header tenant switcher + `/admin/switch-tenant`;
  every data page scoped to the acting tenant with cross-tenant write guards; platform-
  config pages (settings, integrations/*, logs) gated to superadmin.
- **Onboarding**: `/admin/tenants` (superadmin) — create a white-labelled client tenant
  and manage its admins.
- **Tenant-aware AppSero import** (stamps `tenant_id`, no null-tenant rows).

## Cutover — do these in order, with a go/no-go at each

### Phase 0 — verify on a branch DB (no prod impact)
1. Create a Supabase branch (or a staging project) and run the migration there.
2. Run the app against it; confirm: OTW data all shows under the OTW tenant, create a
   test tenant, confirm its data is isolated from OTW in every admin page.
3. Confirm the live CNVS contract still works (validate/activate/vending unchanged).

### Phase 1 — apply the additive migration to prod (REVERSIBLE-ish)
> This is the first step that touches the live, shared DB. Additive only — adds a
> table + nullable columns + backfill; changes **no** existing row's meaning.
1. Back up (Supabase PITR snapshot).
2. Apply `20261003_multitenant_foundation.sql` to prod.
3. Verify: `select count(*) from products where tenant_id is null;` → **0** (and the
   same for every backfilled table). Every existing row should now be OTW.
4. The live app (old code) ignores `tenant_id` entirely, so nothing changes yet.

### Phase 2 — merge the branch (activates tenant-aware admin)
1. Merge PR #22. Vercel deploys.
2. Smoke-test as a superadmin: dashboard/products/licenses default to OTW and match
   pre-cutover numbers; the tenant switcher appears once a 2nd tenant exists.
3. Re-verify the CNVS path in prod (validate returns active; a vending issue works).
4. **Rollback if needed**: revert the merge (the Phase-1 columns are harmless to the
   old code), redeploy.

### Phase 3 — tighten (after a soak period, optional but recommended)
1. Once confident no null-tenant rows are being created, a follow-up migration sets
   `tenant_id NOT NULL` on the core tables.
2. Consider per-tenant RLS **only** if/when a non-service-role access path is added
   (today the service role is the only DB client, so app-layer scoping is the boundary;
   RLS would be defence-in-depth and needs tenant context passed to the DB session).

## Guardrails that held during the build
- No migration applied to prod by the agent.
- The other app's `tenants` table never touched (we use `licenser_tenants`).
- Live CNVS path unchanged (public key endpoints unscoped by design).
- Branch never merged autonomously.

## Known follow-ups (not blocking a first sale)
- Per-tenant GitHub/billing config (today GitHub/Woo/Stripe settings are platform-global,
  superadmin-gated). `licenser_tenants.github_org` + `branding.fromEmail` are the hooks.
- Apply `branding` to the public customer portal + outbound emails (fields exist).
- `sdk` page is static docs (left on the shared admin gate).
