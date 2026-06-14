# Licenser Platform

Self-hosted license + update delivery for the Gloo plugin ecosystem and
the CNVS 4 SDK. Replaces the legacy WP install at `licenser.d3v.co.il`.

- **Live:** https://licenser-platform.vercel.app
- **Stack:** Next.js 14 (app router) · Supabase (Postgres + Auth) · Vercel
- **Status:** v0.3.0 — CNVS 4 pipeline wired: v2 validate endpoint, Woo
  webhook, email adapter, tier feature flags, products seeded.

## REST surface

Mounted under `/api/v1/*` (legacy WP-SDK shape) and `/api/v2/*` (cnvs-licenser
shape). A back-compat rewrite also accepts `/wp-json/licenser/v1/*` →
`/api/v1/*` so existing WP SDK builds keep working.

### v1 (WP licenser-sdk — Jepeto, LinkShop, pbn-hub-child)

| Method | Path                            | Body / query                                              |
|--------|---------------------------------|-----------------------------------------------------------|
| GET    | `/api/v1/health`                | —                                                         |
| POST   | `/api/v1/activate`              | `{ license_key, domain, product?, version?, wp_version?, php_version? }` |
| POST   | `/api/v1/validate`              | `{ license_key, domain }`                                 |
| POST   | `/api/v1/check`                 | alias of `/validate` with a compact response              |
| POST   | `/api/v1/deactivate`            | `{ license_key, domain, reason?, message? }`              |
| GET/POST | `/api/v1/update-check`        | `{ license_key, domain, version? }`                       |
| GET    | `/api/v1/update`                | `?product_slug=...&version=...&license_key=...`           |
| POST   | `/api/v1/feedback`              | `{ license_key?, domain?, reason, message? }`             |

### v2 (cnvs-licenser — `@gloo-ooo/cnvs-licenser` for CNVS 4)

| Method | Path                            | Body / query                                              |
|--------|---------------------------------|-----------------------------------------------------------|
| OPTIONS+POST | `/api/v2/validate`        | `{ key, slug?, domain?, fingerprint? }` → `{ active, tier, expires_at, features[], customer_email, plan_slug, product_slug }` or `{ active:false, reason, expires_at }` |

`reason` is one of `UNKNOWN_KEY` / `EXPIRED` / `REVOKED` / `SUSPENDED` /
`DOMAIN_NOT_AUTHORIZED` / `PRODUCT_MISMATCH`. CORS is open (`*`); rate-limited
to 60 req/min per (ip + key). cnvs-licenser handles 24h offline caching
client-side.

### Webhooks

| Method | Path                                | Notes |
|--------|-------------------------------------|-------|
| POST   | `/api/webhooks/woocommerce`         | HMAC-SHA256 signed via `X-WC-Webhook-Signature`. Topics: `order.completed`, `order.refunded`, `subscription.created/updated/cancelled`. Maps `line_items[].product_id` against `plans.woo_product_id`. |
| GET    | `/api/internal/test-email`          | Admin-gated. Reports which email provider is wired. |
| POST   | `/api/internal/test-email` `{ to? }` | Admin-gated. Sends a sample license-issued email. |

Download URLs returned by `/update-check` and `/update` carry a signed
`download_token` (HMAC-SHA256, base64url) keyed off `LICENSER_SDK_HMAC_SECRET`.

## Admin UI

`/admin` requires a Supabase magic-link sign-in and gates on
`public.admins.email`. Pages:

- `/admin/products` — list + create + delete products
- `/admin/licenses` — list (filter by product), issue, set status, reveal key
- `/admin/activations` — list + revoke

`otw.srl@gmail.com` is seeded into `public.admins` by the initial migration.

## Tier → feature flag map (CNVS 4)

Locked by Omri 2026-06-14. Source of truth is `lib/licenser/tiers.ts` —
mirrored by `plans.feature_flags` jsonb in the database (per-plan overrides
win when non-empty).

| Tier        | Price (monthly) | Features |
|-------------|-----------------|----------|
| Starter     | $19             | `preset-library` |
| Pro         | $49             | `preset-library`, `ai-relay`, `copilot` |
| Studio Pro  | $149            | `preset-library`, `ai-relay`, `copilot`, `connector-*`, `white-label` |
| Enterprise  | custom          | all + `sso`, `dedicated-support` |

20% annual discount. 14-day trial on Starter+.

## Local dev

```
npm install
cp .env.example .env.local
# Fill in Supabase, HMAC, WC, and email env vars
npm run dev
```

See `DEPLOY.md` for Vercel env var setup and the consumer-plugin cutover plan.
See `TAKEOVER.md` for the full audit + LIC-207 cutover blockers.
