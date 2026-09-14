# Licenser Platform

Self-hosted license + update delivery for the Gloo plugin ecosystem and
the CNVS 4 SDK. Replaces the legacy WP install at `licenser.d3v.co.il`.

- **Live:** https://licenser.gloo.ooo
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

### v2 — CNVS Phase A (public, unauthenticated)

| Method | Path | Cache | Notes |
|--------|------|-------|-------|
| GET | `/api/v2/cnvs/settings` | `public, max-age=300` | CNVS pricing. PRC-007 / PRC-008. |
| POST | `/api/v2/beacons` | `no-store` | Deployment beacons from CNVS runtimes. DET-001. |
| GET | `/api/v2/status` | `public, max-age=60` | Service status roll-up. |
| GET | `/api/v2/incidents/unresolved` | `public, max-age=60` | Open incidents. |

#### `/api/v2/cnvs/settings` — the pricing contract

cnvs-4 polls this every five minutes to price every AI generation. It returns
`{ ok: true, settings: { plans, credits, rateCard, packs, dev, graceDays,
fairUse, entitlement }, updated_at, source }`.

**The values come from the `cnvs.*` rows in `public.settings`, not from
constants.** That is the whole point: Omri changes a price at `/admin/cnvs`
and CNVS picks it up within the cache window, with no CNVS code deploy. The
constants in `lib/cnvs/settings.ts` are the fallback for a missing or
malformed row only.

cnvs-4 validates the payload before any of it can price a click and discards
it **entirely** on any violation — falling back to its own defaults and
reporting `degraded: true, reason: "invalid-payload"`. A response that trips a
rule therefore looks healthy from this side and changes nothing in the
product. The rules, enforced here by `validateCnvsSettings`:

1. A 200 must carry prices — `{ ok: true }` alone is rejected as `empty-payload`.
2. `rateCard` must price all twelve actions in `CNVS_ACTIONS`, by those exact
   strings. A partial card, or an action cnvs-4 does not know, fails the whole card.
3. `credits` / `paidCredits` must be non-negative integers — not strings, floats or null.
4. No action may exceed 100000 credits (1 credit = 1 cent → a $1,000 ceiling per click).
5. `plans.*.monthlyUsd` / `annualUsd` and `packs[].usd` / `credits` must be
   positive; `minSeats`, `credits.perSeat.*` and `credits.freeDaily` non-negative.
6. Omitting a key is safe (cnvs-4 falls back per key); malformed is not.

Writes are validated before they are stored, so a bad price is rejected at
`/admin/cnvs` rather than served. A stored row that is malformed anyway
degrades to that section's default rather than poisoning the response, and the
fault is logged. `tests/cnvs-settings.test.ts` covers all six rules.

Every change is recorded in `public.settings_audit` with the before value, the
after value, and the admin who made it.

#### `/api/v2/beacons`

Accepts any JSON object and answers `202 { ok: true, id }`. The full body is
stored in `cnvs_beacons.payload`; recognised fields are also projected into
columns for indexing. A license key in the body resolves the license and is
then reduced to its 8-character prefix — the full key is never stored.

> The exact body shape cnvs-4 posts is **unconfirmed** — `GLOO-ooo/cnvs-4` was
> outside the session's repo scope when this shipped, so the field names in
> `lib/cnvs/beacons.ts` are educated guesses over camel/snake/nested variants.
> The design makes that safe: a name guessed wrong costs a null column, never a
> dropped beacon, and is fixed in that one file with no migration. Confirm
> against the caller and tighten.

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
- `/admin/cnvs` — CNVS pricing: plans, credits, the twelve-action rate card,
  credit packs, dev-key limits, grace and entitlement TTLs, plus the change history
- `/admin/cnvs/beacons` — deployment beacons, with each raw payload
- `/admin/cnvs/status` — service components and incidents behind
  `/api/v2/status` and `/api/v2/incidents/unresolved`

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
