# Licenser-platform takeover — audit + CNVS 4 integration

Auditor: takeover agent, branch `feat/cnvs-4-integration` (off `main`).
Predecessor: Benny — shipped v0.1.0–v0.2.0.
Trigger: Omri 2026-06-14 "Benny finishe is work" + locked-in CNVS 4 pricing tiers.

## TL;DR

REST is **online** at https://licenser-platform.vercel.app/api/v1/health.
Schema is **applied**, **0 products seeded**, **0 licenses issued**, admin
UI gates correctly. Benny's scaffold is solid. Three CNVS-4-specific
gaps to close before LIC-207 cutover:

1. `/api/v1/validate` shape doesn't match `@gloo-ooo/cnvs-licenser`. Fixed
   by adding a sibling `/api/v2/validate` (cnvs-shaped) and teaching the
   existing route to accept both request shapes. Old SDK clients are not
   broken.
2. No WooCommerce webhook → no automated license issuance. Added.
3. No email sender → license keys never reach the customer. Added with
   pluggable Resend/Postmark/SendGrid adapter, no-op fallback in dev.

## Stack

- **Framework:** Next.js 14.2.5 (app router), `runtime = 'nodejs'` on every route.
- **DB:** Supabase project `iyseueyttklbcghtwohk` (eu-west-1, OTW Org).
  Service-role client on the server, anon+SSR on the admin UI for auth.
- **Auth (admin only):** Supabase magic link, gated against `public.admins.email`.
- **Crypto:** HMAC-SHA256 / base64url tokens via `lib/licenser/signer.ts`,
  used for signed `download_token` on updates. Keyed off `LICENSER_SDK_HMAC_SECRET`.
- **WP-compat:** `next.config.mjs` rewrites `/wp-json/licenser/v1/*` →
  `/api/v1/*` so legacy SDK builds keep working unmodified.
- **Vercel:** project `prj_bydb2KivuiLZ1FrFUvlXRfVRloK7`, team
  `team_R4vYUVawA1B8qCitPPEmniD2` (otwdesign). Aliases:
  `licenser-platform.vercel.app`, `licenser-platform-otwdesign.vercel.app`.

## DB schema (applied — additive only from here)

```
admins             id, email, created_at                              [1 row: otw.srl@gmail.com]
products           id, slug, name, version, github_repo               [0]
plans              id, product_id, slug, name, max_activations,       [0]
                   recurring, price_cents
licenses           id, product_id, plan_id, customer_email, key,      [0]
                   key_prefix, status, max_activations, expires_at,
                   grace_until
activations        id, license_id, site_url, ip, ua, instance_token,  [0]
                   status, activated_at, last_seen_at
product_releases   id, product_id, version, download_url, changelog,  [0]
                   release_notes, is_latest
events             id, license_id, product_id, type, data jsonb       [0]
```

Benny modelled tiers as `plans` rows scoped per product, which is more
flexible than a per-license `tier text` would be. I kept his shape and
added `plans.feature_flags` JSONB + `plans.woo_product_id` + extra license
columns (`woo_order_id`, `woo_subscription_id`, `domains_used[]`,
`customer_name`) via additive migration. See
`supabase/migrations/20260614_cnvs4_integration.sql`.

**Security advisory (P1):** RLS is disabled on all 7 tables. Since every
write/read goes through the service-role client, no anon-key exposure
exists *today*, but adding the anon RLS layer would be belt-and-suspenders.
Surfaced for Omri — not enabled because doing so without policies locks
every read and the existing `/api/v1/check` anon-stub would break.

## REST surface inventory

| Method | Path | Purpose | Contract source |
|---|---|---|---|
| GET | `/api/v1/health` | Liveness | LIC-204 |
| POST | `/api/v1/activate` | Bind license to domain, return activation | WP licenser-sdk |
| POST | `/api/v1/validate` | Verify license+domain pair | WP licenser-sdk |
| POST | `/api/v1/check` | Compact validate alias + reachability stub | LIC-204 |
| POST | `/api/v1/deactivate` | Release activation slot | WP licenser-sdk |
| GET/POST | `/api/v1/update-check` | Update query + signed download token | WP licenser-sdk |
| GET | `/api/v1/update` | Update query by product_slug | LIC-204 |
| POST | `/api/v1/feedback` | Log deactivation reason | WP licenser-sdk |

**Added in this branch:**

| Method | Path | Purpose |
|---|---|---|
| OPTIONS+POST | `/api/v2/validate` | cnvs-licenser-shaped validate (key/slug/domain/fingerprint → active/tier/expires_at/features) |
| POST | `/api/webhooks/woocommerce` | HMAC-verified WC webhook → issue / revoke licenses |
| POST | `/api/internal/test-email` | Admin-only smoke test for the email adapter |

## Admin UI capabilities (today)

- `/admin` overview cards + last 10 events feed
- `/admin/products` — list + create + delete
- `/admin/licenses` — list filtered by product, issue license, set status, reveal key once
- `/admin/activations` — list, revoke

Dark mode by default (matches Omri's standing preference). Accent is
`linear-gradient(135deg,#a78bfa,#8b5cf6)` — Benny picked violet/indigo
rather than the Gloo `#9336B3` magenta. Left as-is in this PR;
flagged as polish-pass below.

## What Benny did well

- Clean separation: `lib/licenser/db.ts` is the only SQL surface; routes are thin.
- HMAC signer is a real port of the WP plugin's `Signer.php`, not a re-roll.
- WP-compat rewrite means we can flip DNS at `licenser.d3v.co.il` without
  rebuilding any consumer plugin — meaningful time-saver for the cutover.
- Service-role client is correctly server-only; SSR client is browser-safe.
- Admin auth pipeline is correct: SSR → cookie → user email → admins allowlist → redirect on miss.
- Dark mode default, magic-link auth — matches feedback rules without being asked.

## What was missing or broken vs CNVS 4 pipeline

| Gap | Severity | Fix in this PR |
|---|---|---|
| `/api/v1/validate` request shape uses `license_key` not `key`, no `slug`, no `fingerprint`. | Hard blocker for cnvs-licenser | New `/api/v2/validate`. Legacy `/api/v1/validate` keeps working unchanged. |
| `/api/v1/validate` response uses `valid` bool + nested `license.expires_at` + nested `plan.slug` — cnvs-licenser expects flat `active` / `tier` / `expires_at` / `features`. | Hard blocker | `/api/v2/validate` returns flat cnvs shape with `reason` enum on inactive. |
| No `features` per tier — cnvs-licenser maps `preset-library` / `ai-relay` / `copilot` / `connector-<id>` to tiers. | Hard blocker | `lib/licenser/tiers.ts` carries the canonical CNVS-4 tier-feature map. `plans.feature_flags` JSONB lets per-product overrides. |
| WooCommerce webhook absent. License creation is admin-only manual click. | Hard blocker for buy flow | `POST /api/webhooks/woocommerce` shipped. WC product → plan mapping via `plans.woo_product_id`. |
| No email sender. License key never reaches buyer. | Hard blocker | `lib/email/*` adapter (Resend primary, Postmark/SendGrid optional, no-op fallback). Templates in `lib/email/templates/`. |
| No products seeded. | Blocker | `supabase/migrations/20260614_cnvs4_integration.sql` upserts the CNVS-4 product + 6 plans matching Omri's pricing. |
| No CORS. cnvs-licenser is called from `*.vercel.app` previews and custom domains. | Soft blocker | `/api/v2/validate` ships `Access-Control-Allow-Origin: *` with `OPTIONS` preflight handler. |
| No rate limiting. | Medium | `lib/licenser/ratelimit.ts` — 60 rpm per IP+key, in-memory LRU bucket. Survives single-instance lambda for the validate path; needs Upstash later. |
| RLS disabled. | Surfaced, not fixed. | See "Security advisory" — needs Omri sign-off on policies. |

## Contract reconciliation — `cnvs-licenser` POV

The CNVS 4 SDK ships pointing at `https://licenser-platform.vercel.app`.
Default route was implied as `POST /api/validate`; I've added the cnvs-shape
endpoint at **`POST /api/v2/validate`** — semver bump, clearer mental model
than overloading v1. Cnvs-licenser consumers should set their endpoint:

```ts
new CnvsLicenser({ endpoint: 'https://licenser-platform.vercel.app/api/v2/validate' })
```

Alternatively the SDK can keep its default — once Omri approves, I'll open
a one-line PR on `cnvs-4` flipping the default URL.

### Why not just mutate `/api/v1/validate`?

Because the WP SDK (Jepeto, LinkShop, pbn-hub-child) already calls
`/wp-json/licenser/v1/validate` and depends on the `valid` + nested
`license.*` response shape. Two consumers, two contracts. Cleanest path
is v2 alongside v1.

## What's blocking the LIC-207 cutover

Hard:
1. **Customer cutover.** WC product IDs and existing customer license
   records have to be imported from the WP licenser. Stub script at
   `scripts/import-from-wp.ts` not in this PR — Benny's DEPLOY.md flagged it.
2. **`SUPABASE_SERVICE_ROLE_KEY` is unset on Vercel** (per Benny's DEPLOY.md
   — the Supabase MCP doesn't expose it). Until it's pasted in Vercel env,
   every write to Supabase from prod will 500.
3. **`LICENSER_SDK_HMAC_SECRET` is unset on Vercel.** Update tokens will
   throw — confirmed from Benny's signer code.
4. **Email provider key.** Need `RESEND_API_KEY` (or Postmark/SendGrid
   equivalent) in Vercel env. Without it, license issuance "succeeds" but
   emails are no-op'd (logged to events table for visibility).
5. **WooCommerce webhook secret.** Need `WC_WEBHOOK_SECRET` in Vercel env
   *and* configured in the WooCommerce side at gloo.ooo. The webhook
   rejects all calls until the shared secret matches.

Soft:
6. CORS allowlist instead of `*` — tighten once we know which domains.
7. Rate limit needs Upstash / Vercel KV for fleet-wide enforcement.
8. RLS policies need design.
9. Gloo brand palette polish pass on admin UI.

## Open questions for Omri

- **WC product IDs.** What WooCommerce product IDs map to Starter / Pro /
  Studio Pro monthly/annual? Schema accepts empty `woo_product_id`; seeded
  with `null`. Webhook routes by `woo_product_id` lookup, so until
  populated it rejects with `UNMAPPED_PRODUCT`.
- **Email provider.** Resend is cheapest + ships fastest. Confirm or pick
  one. I added Resend as the default; the adapter pattern means swap is cheap.
- **`cnvs-licenser` default URL.** Want me to open the PR on `cnvs-4`
  flipping default endpoint to `/api/v2/validate`? Or hold for review first.
- **Trial logic.** "14-day trial on Starter+" — should trials be issued as
  `expires_at = now() + 14d` on WC trial-start, or pre-issue at first
  purchase and grace? Currently issuance respects `subscription.created`
  with `trial_end` field if WC includes it.
- **Enterprise tier.** Custom pricing → custom seat counts. Seeded with
  `max_activations = 999` placeholder. Confirm sane.
- **RLS policy design.** Surface for Omri — see Security advisory above.

## Follow-up list (second pass, not in this PR)

- [ ] `scripts/import-from-wp.ts` — migrate existing licenser.d3v.co.il
      customers (license keys + activations + products).
- [ ] Switch CORS from `*` to an allowlist derived from `products.allowed_domains[]`.
- [ ] Move rate-limit to Upstash / Vercel KV.
- [ ] RLS policies for `licenses`, `activations`, `events`.
- [ ] Gloo brand palette pass on admin UI (`#9336B3` swap, Gloo logo).
- [ ] Validation analytics dashboard at `/admin/analytics`.
- [ ] Stripe webhook receiver (if gloo.ooo ever moves off WC).
- [ ] Postmark/SendGrid adapter parity tests.
- [ ] Verify Supabase Auth Site URL + Redirect URLs are configured
      (Benny's DEPLOY.md flagged this as manual).
