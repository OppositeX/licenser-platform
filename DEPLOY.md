# Deploying licenser-platform

## Supabase project (already provisioned)

- **Org:** OTW Org (`bzhshrtpnsiiqqjtqmdz`)
- **Project name:** `licenser`
- **Ref / project_id:** `iyseueyttklbcghtwohk`
- **URL:** `https://iyseueyttklbcghtwohk.supabase.co`
- **Region:** `eu-west-1`
- **Initial migration `20260518_init.sql`:** applied. Tables: `admins`,
  `products`, `plans`, `licenses`, `activations`, `product_releases`,
  `events`. `otw.srl@gmail.com` is seeded into `admins`.

## Vercel env vars

The Vercel MCP we have access to is on a different team. These need to be
pasted manually in **Vercel → licenser-platform → Settings → Environment
Variables**, scoped to **Production + Preview + Development**.

| Name                              | Value                                                                                                  |
|-----------------------------------|--------------------------------------------------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | `https://iyseueyttklbcghtwohk.supabase.co`                                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5c2V1ZXl0dGtsYmNnaHR3b2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjc0NDEsImV4cCI6MjA5NDY0MzQ0MX0.JD8agifmTvEQ8oY8U4Wbu8MGmqhoKidOJzPAiYRvaic` |
| `SUPABASE_SERVICE_ROLE_KEY`       | Copy from **Supabase → licenser → Project settings → API → service_role secret** (the Supabase MCP does not expose it for security reasons) |
| `LICENSER_SDK_HMAC_SECRET`        | Generate fresh: `openssl rand -hex 32`. Save in 1Password as **"licenser HMAC"**. Used to sign download tokens. |

After saving the env vars, redeploy via **Deployments → ... → Redeploy** so
the new values take effect.

## Supabase Auth setup

For admin magic-link sign-in to work, in **Supabase → licenser → Authentication
→ URL Configuration**, set the **Site URL** to `https://licenser.gloo.ooo`
and add `https://licenser.gloo.ooo/admin/auth/callback` to the
**Redirect URLs** allowlist.

## Local dev

```
npm install
cp .env.example .env.local
# Paste the same four values you set in Vercel above
npm run dev
```

## First-time admin run

1. Open `https://licenser.gloo.ooo/admin/login`.
2. Sign in with `otw.srl@gmail.com` (already seeded into `public.admins`).
3. Add products in `/admin/products`, issue licenses in `/admin/licenses`.

## Cutover plan for consumer plugins (Jepeto, LinkShop, pbn-hub-child)

The new server mirrors the WP plugin's REST contract at `/api/v1/*`. To keep
existing SDK builds working without rebuilding every consumer plugin,
`next.config.mjs` carries a rewrite that maps `/wp-json/licenser/v1/:path*` →
`/api/v1/:path*`. So the cutover is just a `Config::$server_url` change in
each consumer:

1. In each consumer plugin's `sdk/Config.php` (or wherever it sets
   `$server_url`), change `https://licenser.d3v.co.il` →
   `https://licenser.gloo.ooo`. Tag and release.
2. Or, when ready, move the `licenser.d3v.co.il` DNS record to point at
   Vercel (CNAME `cname.vercel-dns.com`). Then **no** consumer-plugin rebuild
   is needed — old SDK builds hit `/wp-json/licenser/v1/*` on the new
   server, which the rewrite forwards.
3. Pre-populate `products`, `plans`, `licenses` for each existing customer.
   The schema is similar to the WP plugin's; a migration script can be
   added under `scripts/import-from-wp.ts` later.

Do **not** touch the WP install at `licenser.d3v.co.il` or the
`OppositeX/licenser` repo — they're deprecated, not patched.

## Endpoints (quick smoke tests)

```bash
# Health (always public)
curl https://licenser.gloo.ooo/api/v1/health

# Reachability + signing-aware stub (no license needed)
curl -X POST https://licenser.gloo.ooo/api/v1/check \
  -H 'content-type: application/json' \
  -d '{}'

# Real validate
curl -X POST https://licenser.gloo.ooo/api/v1/validate \
  -H 'content-type: application/json' \
  -d '{"license_key":"LIC-XXXX-XXXX","domain":"example.com"}'
```
