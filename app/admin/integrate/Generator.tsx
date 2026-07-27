'use client';
import { useMemo, useState } from 'react';

export interface GenProduct { slug: string; name: string; plans: Array<{ slug: string; name: string }> }
type Stack = 'react-next' | 'wordpress' | 'rest';
type Format = 'agent' | 'human';

interface Params { productSlug: string; planSlugs: string[]; seat: boolean; baseUrl: string }

const union = (slugs: string[]) => slugs.map((s) => `"${s}"`).join(' | ') || '"<plan_slug>"';
const hasLifetime = (slugs: string[]) => slugs.some((s) => /lifetime|life/i.test(s));

/* ---------------- React / Next.js ---------------- */

function reactAgent(p: Params): string {
  const life = hasLifetime(p.planSlugs)
    ? `\n- LIFETIME PLANS: a lifetime license returns active:true with expires_at:null. expires_at:null means NO EXPIRY — treat it as valid forever, NEVER as expired. Only time-limited plans return reason "EXPIRED".`
    : '';
  const domain = p.seat
    ? `\n\n## Seat enforcement (requested)
Enforce the per-plan site limit:
1. On first run for a site, POST ${p.baseUrl}/api/v1/activate  { "license_key": "<key>", "domain": "<host>" }.
   - 200 -> activated (returns an instance_token you can store).
   - 403 licenser_max_activations -> the plan's seat limit is reached; block and tell the user to free a seat at ${p.baseUrl}/portal.
2. Then validate WITH the domain: POST /api/v2/validate { "key", "slug": "${p.productSlug}", "domain": "<host>" }.
   DOMAIN_NOT_AUTHORIZED means that site was never activated (call /activate first).
3. To release a seat: POST ${p.baseUrl}/api/v1/deactivate { "license_key", "domain" }.`
    : `\n- Do NOT send "domain" — this app runs on *.vercel.app which is NOT auto-authorized, so a domain with no activation returns DOMAIN_NOT_AUTHORIZED. (Seat enforcement is intentionally off.)`;

  return `Add license gating to this app using our self-hosted "Licenser" platform. Customers buy a plan and get a license key; this app must validate the key and unlock features accordingly.

## Licenser API (already live)
Base URL: ${p.baseUrl}  (env: LICENSER_URL)

Validate — POST {LICENSER_URL}/api/v2/validate
  Request:  { "key": "<license key>", "slug": "${p.productSlug}" }
  Valid:    { "active": true, "plan_slug": ${union(p.planSlugs)},
              "tier": "...", "features": [...], "expires_at": "ISO | null",
              "customer_email": "...", "product_slug": "${p.productSlug}" }
  Invalid:  { "active": false, "reason": "UNKNOWN_KEY"|"EXPIRED"|"REVOKED"|"SUSPENDED"|"DOMAIN_NOT_AUTHORIZED"|"PRODUCT_MISMATCH"|"RATE_LIMITED", "expires_at": null }
  CORS is open, but DO NOT call this from the browser (see security).

Design around these current realities:
- Gate on \`active\` (boolean) and \`plan_slug\`. Map plan_slug -> capabilities in THIS app behind ONE config object.
- \`tier\` and \`features\` may be null/empty right now (being finalized on the Licenser side) — do NOT hard-gate on them yet.
- Always send "slug": "${p.productSlug}" so a key for another product returns PRODUCT_MISMATCH.${life}${domain}

## Build
1. Server-side validation only — Next.js Route Handler POST /api/license/validate that: reads the key from an httpOnly cookie (or POST body on first submit); calls /api/v2/validate server-side with slug "${p.productSlug}"; caches per-key ~5 min; on active sets an httpOnly+secure+sameSite=lax cookie; returns a SAFE shape { active, plan_slug, expires_at, reason? } (NEVER expose customer_email to the browser); never throws on network/RATE_LIMITED — fall back to the last cached good result (fail-open briefly) and surface reason.
2. License entry UI: paste key -> POST validate -> unlock on success, friendly message per reason (UNKNOWN_KEY / EXPIRED->renew / REVOKED|SUSPENDED->support / RATE_LIMITED|network->retry, don't lock out). Add "Lost your key?" -> ${p.baseUrl}/portal/recover and a renew link -> ${p.baseUrl}/portal.
3. React context/hook useLicense() -> { active, planSlug, capabilities, expiresAt } + a <LicenseGate> component that renders children only when active.
4. Capability map keyed by plan_slug, in one config file, so it can later be swapped for the server \`features\` array without touching components.
5. HARD ENFORCEMENT: re-check the license on the SERVER for anything paid/premium — never trust the client gate alone (client UI is always bypassable).

## Env
LICENSER_URL=${p.baseUrl}

## Acceptance
- Valid key unlocks; invalid/expired shows the right message and stays locked.${hasLifetime(p.planSlugs) ? '\n- Lifetime licenses (expires_at:null) are NEVER treated as expired.' : ''}
- No license key or customer email is ever exposed to the browser.
- Validation is server-side + cached; transient errors don't lock out a valid user.
- plan_slug drives which capabilities are available.`;
}

function reactHuman(p: Params): string {
  return `# Wiring "${p.productSlug}" license checks into a React/Next.js app

## The endpoint
POST ${p.baseUrl}/api/v2/validate   (call it SERVER-SIDE, never from the browser)

Request body:
  { "key": "<the customer's license key>", "slug": "${p.productSlug}" }

Response (valid):
  { "active": true, "plan_slug": ${union(p.planSlugs)}, "expires_at": "ISO or null", ... }
Response (invalid):
  { "active": false, "reason": "UNKNOWN_KEY | EXPIRED | REVOKED | SUSPENDED | RATE_LIMITED | ...", "expires_at": null }

## How to wire it (4 steps)
1) Add a Next.js Route Handler at app/api/license/validate/route.ts that POSTs to the endpoint above
   server-side (keep the key out of the browser), caches the result ~5 min, and on success stores it in an
   httpOnly cookie. Return only { active, plan_slug, expires_at } to the client.
2) Read that from the client with a small useLicense() hook / context.
3) Wrap your paid feature UI in a <LicenseGate> that only renders when active === true.
4) For anything that costs money (AI, server generation), re-check the license IN the server route that does
   the work — don't rely on the UI gate alone.

## Rules that matter
- Gate on \`active\` + \`plan_slug\`. (tier/features are being finalized — map plan_slug to capabilities in your app for now.)${hasLifetime(p.planSlugs) ? `\n- LIFETIME plans return expires_at: null = valid forever. Never treat a null expiry as "expired".` : ''}
- On RATE_LIMITED or a network blip, keep the last good result — don't lock out a paying customer.
- Customers who lose a key: ${p.baseUrl}/portal/recover . Manage/renew: ${p.baseUrl}/portal .

## Env
LICENSER_URL=${p.baseUrl}${p.seat ? `

## Seat enforcement (per-plan site limits)
Before validating a site, activate it once: POST ${p.baseUrl}/api/v1/activate { "license_key", "domain" }.
A 403 "licenser_max_activations" means the plan's seat limit is reached. Release a seat with
POST ${p.baseUrl}/api/v1/deactivate { "license_key", "domain" }. Then validate WITH "domain" set.` : ''}`;
}

/* ---------------- WordPress / PHP SDK ---------------- */

function wpAgent(p: Params): string {
  return `Integrate the "Licenser" PHP SDK into this WordPress plugin so premium features + auto-updates are license-gated.

## Get the SDK
Copy our SDK into the plugin at includes/licenser-sdk/ (the SDK lives in the Licenser repo under packages/licenser-sdk-php),
then run scripts/install-sdk.sh to rewrite its namespace to the plugin's own (prevents class collisions across plugins).

## Wire it up (in the main plugin file, on plugins_loaded)
  require_once __DIR__ . '/includes/licenser-sdk/SDK.php';
  \\<YourNamespace>\\Licenser\\SDK::init([
    'server_url'   => '${p.baseUrl}',
    'product_slug' => '${p.productSlug}',
    'plugin_file'  => __FILE__,
    'plugin_slug'  => 'your-plugin/your-plugin.php',
    'version'      => '1.0.0',
  ]);

This gives you, out of the box:
- A license settings screen (activate / deactivate the key).
- License-gated auto-updates via the WP update system (only valid, activated sites get premium updates).
- Feature gating: check SDK::is_valid() before running premium code; SDK::license()->plan_slug is one of ${union(p.planSlugs)}.

## Rules
- Gate premium code on SDK::is_valid(). Map plan_slug -> capabilities in the plugin for now (tier/features are being finalized on the Licenser side).
- The SDK handles activation, so per-site seat limits are enforced automatically by the server.
- server_url must be exactly ${p.baseUrl} (the production URL).

## Acceptance
- Entering a valid key on the settings screen activates the site and unlocks premium features.
- Premium plugin updates only appear for valid, activated licenses.
- plan_slug correctly drives which features are available.`;
}

function wpHuman(p: Params): string {
  return `# Licensing a WordPress plugin with the Licenser PHP SDK  (product: ${p.productSlug})

## 1. Add the SDK
Copy the SDK folder into your plugin at:  includes/licenser-sdk/
Then namespace it to your plugin so it can't collide with other SDK-using plugins:
  ./scripts/install-sdk.sh ./includes/licenser-sdk 'YourVendor\\YourPlugin'

## 2. Initialise it (main plugin file, on plugins_loaded)
  require_once __DIR__ . '/includes/licenser-sdk/SDK.php';
  YourVendor\\YourPlugin\\Licenser\\SDK::init([
    'server_url'   => '${p.baseUrl}',
    'product_slug' => '${p.productSlug}',
    'plugin_file'  => __FILE__,
    'plugin_slug'  => 'your-plugin/your-plugin.php',
    'version'      => '1.0.0',
  ]);

## 3. Gate your premium code
  if ( YourVendor\\YourPlugin\\Licenser\\SDK::is_valid() ) {
      // premium feature
  }
The customer's plan is SDK::license()->plan_slug — one of: ${union(p.planSlugs)}.

## What you get for free
- License settings screen (activate/deactivate the key) in wp-admin.
- Auto-updates through WordPress: only valid + activated sites receive premium updates.
- Server-side seat enforcement (the SDK activates each site).

## Notes
- server_url is the production URL: ${p.baseUrl}
- tier/features are being finalized on the Licenser side — gate on is_valid() + plan_slug for now.`;
}

/* ---------------- Raw REST ---------------- */

function restHuman(p: Params): string {
  return `# Licenser REST — validating "${p.productSlug}" from any backend

## Validate a key
POST ${p.baseUrl}/api/v2/validate
  headers: content-type: application/json
  body:    { "key": "<license key>", "slug": "${p.productSlug}" }

Valid   -> { "active": true, "plan_slug": ${union(p.planSlugs)}, "expires_at": "ISO|null", "customer_email": "...", "product_slug": "${p.productSlug}" }
Invalid -> { "active": false, "reason": "UNKNOWN_KEY|EXPIRED|REVOKED|SUSPENDED|DOMAIN_NOT_AUTHORIZED|PRODUCT_MISMATCH|RATE_LIMITED", "expires_at": null }

## Do
- Call from your server, cache ~5 min per key, gate on \`active\` + \`plan_slug\`.
- On RATE_LIMITED / network error, reuse the last good result (fail-open briefly).${hasLifetime(p.planSlugs) ? `\n- expires_at:null = LIFETIME (valid forever). Never treat null as expired.` : ''}
${p.seat ? `
## Seat enforcement
Activate a site:   POST ${p.baseUrl}/api/v1/activate    { "license_key", "domain" }   (403 licenser_max_activations = limit reached)
Deactivate a site: POST ${p.baseUrl}/api/v1/deactivate  { "license_key", "domain" }
Then validate WITH "domain" set to enforce the per-plan limit.` : `
## Note
Only send "domain" if you want per-plan seat enforcement (requires activating each site first).`}

## Self-service for customers
Portal (view/renew/free a seat): ${p.baseUrl}/portal      Recover a lost key: ${p.baseUrl}/portal/recover`;
}

function generate(stack: Stack, format: Format, p: Params): string {
  if (stack === 'react-next') return format === 'agent' ? reactAgent(p) : reactHuman(p);
  if (stack === 'wordpress') return format === 'agent' ? wpAgent(p) : wpHuman(p);
  return restHuman(p); // rest is docs-only
}

/* ---------------- UI ---------------- */

const lbl: React.CSSProperties = { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 6, display: 'block' };
const inp: React.CSSProperties = { background: '#0a0a0f', border: '1px solid #1f2937', color: '#f1f5f9', borderRadius: 8, padding: '10px 12px', fontSize: 13, width: '100%' };

export function Generator({ products, baseUrl }: { products: GenProduct[]; baseUrl: string }) {
  const [stack, setStack] = useState<Stack>('react-next');
  const [format, setFormat] = useState<Format>('agent');
  const [productSlug, setProductSlug] = useState(products[0]?.slug ?? '');
  const [seat, setSeat] = useState(false);
  const [copied, setCopied] = useState(false);

  const product = products.find((p) => p.slug === productSlug) ?? products[0];
  const planSlugs = product?.plans.map((pl) => pl.slug) ?? [];
  const restOnly = stack === 'rest';

  const output = useMemo(
    () => generate(stack, restOnly ? 'human' : format, { productSlug, planSlugs, seat, baseUrl }),
    [stack, format, productSlug, seat, baseUrl, planSlugs, restOnly],
  );

  async function copy() {
    try { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  }

  const seg = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: '1px solid ' + (active ? 'transparent' : '#1f2937'),
    background: active ? 'linear-gradient(135deg,#a78bfa,#8b5cf6)' : 'transparent',
    color: active ? '#fff' : '#cbd5e1',
  });

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, padding: 20 }}>
        <div>
          <label style={lbl}>Your stack</label>
          <select value={stack} onChange={(e) => setStack(e.target.value as Stack)} style={inp}>
            <option value="react-next">React / Next.js app (Vercel etc.)</option>
            <option value="wordpress">WordPress / Elementor plugin (PHP)</option>
            <option value="rest">Other backend (raw REST)</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Product</label>
          <select value={productSlug} onChange={(e) => setProductSlug(e.target.value)} style={inp}>
            {products.map((p) => <option key={p.slug} value={p.slug}>{p.name} ({p.slug})</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Output</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setFormat('agent')} disabled={restOnly} style={{ ...seg(format === 'agent' && !restOnly), opacity: restOnly ? 0.4 : 1 }}>Agent prompt</button>
            <button onClick={() => setFormat('human')} style={seg(format === 'human' || restOnly)}>Human docs</button>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 13, alignSelf: 'end', paddingBottom: 8 }}>
          <input type="checkbox" checked={seat} onChange={(e) => setSeat(e.target.checked)} /> Enforce per-plan seat limits
        </label>
      </div>

      <div style={{ position: 'relative' }}>
        <button onClick={copy} style={{ position: 'absolute', top: 12, right: 12, ...seg(false), background: copied ? '#0f2e1a' : '#1f2937', color: copied ? '#86efac' : '#cbd5e1', border: 'none' }}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <pre style={{ background: '#0a0a0f', border: '1px solid #1f2937', borderRadius: 12, padding: '20px 20px', fontSize: 12.5, lineHeight: 1.55, fontFamily: 'ui-monospace, Menlo, monospace', color: '#e2e8f0', overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0, maxHeight: 620 }}>{output}</pre>
      </div>

      <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>
        Plans pulled live for <strong style={{ color: '#94a3b8' }}>{product?.name}</strong>: {planSlugs.join(', ') || '—'}
      </p>
    </div>
  );
}
