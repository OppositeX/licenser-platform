# Licenser Platform

Self-hosted license + update delivery for the Gloo plugin ecosystem.
Replaces the WP install at `licenser.d3v.co.il`.

- **Live:** https://licenser-platform.vercel.app
- **Stack:** Next.js 14 (app router) · Supabase (Postgres + Auth) · Vercel
- **Status:** v0.2.0 — REST surface + admin UI + schema applied.

## REST surface

All routes are mounted under `/api/v1/*`. A back-compat rewrite also accepts
`/wp-json/licenser/v1/*` so existing licenser-sdk clients (Jepeto, LinkShop,
pbn-hub-child) keep working.

| Method | Path                            | Body / query                                              |
|--------|---------------------------------|-----------------------------------------------------------|
| GET    | `/api/v1/health`                | —                                                         |
| POST   | `/api/v1/activate`              | `{ license_key, domain, product?, version?, wp_version?, php_version? }` |
| POST   | `/api/v1/validate`              | `{ license_key, domain }`                                 |
| POST   | `/api/v1/check`                 | alias of `/validate` with a compact response              |
| POST   | `/api/v1/deactivate`            | `{ license_key, domain, reason?, message? }`              |
| GET/POST | `/api/v1/update-check`        | `{ license_key, domain, version? }`                       |
| GET    | `/api/v1/update`                | `?product_slug=…&version=…&license_key=…`                 |
| POST   | `/api/v1/feedback`              | `{ license_key?, domain?, reason, message? }`             |

Download URLs returned by `/update-check` and `/update` carry a signed
`download_token` (HMAC-SHA256, base64url) keyed off `LICENSER_SDK_HMAC_SECRET`.

## Admin UI

`/admin` requires a Supabase magic-link sign-in and gates on
`public.admins.email`. Pages:

- `/admin/products` — list + create + delete products
- `/admin/licenses` — list (filter by product), issue, set status, reveal key
- `/admin/activations` — list + revoke

`otw.srl@gmail.com` is seeded into `public.admins` by the initial migration.

## Local dev

```
npm install
cp .env.example .env.local
# Fill in the four Supabase env vars + the HMAC secret
npm run dev
```

See `DEPLOY.md` for Vercel env var setup and the consumer-plugin cutover plan.
