import Link from 'next/link';
import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell, Card, ui } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

export default async function SdkDocsPage() {
  const { email } = await requireAdmin();
  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('host') ?? 'localhost:3000';
  const base = `${proto}://${host}`;

  const code = (s: string) => <pre style={ui.pre}>{s}</pre>;

  return (
    <AdminShell active="sdk" email={email}>
      <h1 style={ui.h1}>SDK documentation</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 18px' }}>
        Two official SDKs. Pick the one that matches your stack — both call the same REST surface and respect the same license rules.
      </p>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 24 }}>
        <Link href="#js" style={{ ...ui.card, textDecoration: 'none', color: '#f1f5f9' }}>
          <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>npm · TypeScript</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>@gloo/licenser-client</div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Isomorphic Node + browser client, optional React hook.</div>
        </Link>
        <Link href="#wp" style={{ ...ui.card, textDecoration: 'none', color: '#f1f5f9' }}>
          <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>WordPress · PHP</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>licenser-sdk-php</div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Drop-in SDK with namespace isolation, updater, feedback modal.</div>
        </Link>
        <Link href="#rest" style={{ ...ui.card, textDecoration: 'none', color: '#f1f5f9' }}>
          <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Anything else</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Raw REST</div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Plain JSON over HTTPS. CORS-open on /v2/validate.</div>
        </Link>
      </div>

      <Card title="Endpoint base URL">
        {code(base)}
      </Card>

      <h2 id="js" style={{ ...ui.h2, marginTop: 32, color: '#f1f5f9', fontSize: 22 }}>React / Node / TypeScript — @gloo/licenser-client</h2>

      <Card title="Install">
        {code('npm i @gloo/licenser-client')}
      </Card>

      <Card title="Server-side (recommended)" subtitle="Keep the license key on your server; expose only the validation result to the browser.">
        {code(`import { LicenserClient } from '@gloo/licenser-client';

const lic = new LicenserClient({
  endpoint: '${base}',
  productSlug: 'your-product-slug',
});

// Next.js route handler / Express middleware
const result = await lic.validate({
  key: process.env.LICENSE_KEY!,
  domain: req.headers.host,
});

if (!result.active) throw new Error('License: ' + result.reason);`)}
      </Card>

      <Card title="React hook" subtitle="useLicense() caches + dedupes across components, revalidates on focus.">
        {code(`import { LicenseProvider, useLicense } from '@gloo/licenser-client/react';

function Root() {
  return (
    <LicenseProvider endpoint="${base}" productSlug="your-product-slug">
      <App />
    </LicenseProvider>
  );
}

function App() {
  const { license, loading, error, refresh } = useLicense({ key });
  if (loading) return <Spinner />;
  if (!license?.active) return <Unlicensed reason={license?.reason} />;
  if (license.features.includes('ai-relay')) return <ProFeature />;
  return <BasicFeature />;
}`)}
      </Card>

      <Card title="Browser-direct (CORS-open)" subtitle="Works, but keys embedded in client JS are copyable. Use for dev / sample apps, not production.">
        {code(`const r = await fetch('${base}/api/v2/validate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ key, domain: location.hostname, slug: 'your-product-slug' }),
}).then((r) => r.json());`)}
      </Card>

      <h2 id="wp" style={{ ...ui.h2, marginTop: 32, color: '#f1f5f9', fontSize: 22 }}>WordPress — licenser-sdk-php</h2>

      <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 18px', lineHeight: 1.6 }}>
        Four steps. The examples below use a fictional plugin: directory{' '}
        <code style={{ color: '#a78bfa' }}>acme-awesome-plugin/</code>, namespace{' '}
        <code style={{ color: '#a78bfa' }}>Acme\AwesomePlugin</code>, product slug{' '}
        <code style={{ color: '#a78bfa' }}>awesome-plugin</code>. Substitute your own values in the same positions.
      </p>

      <Card title="What you'll get" subtitle="One $sdk->boot() call wires every WP hook the SDK needs.">
        <ul style={{ margin: 0, padding: '0 0 0 18px', color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
          <li><strong>Settings page</strong> — License entry / status under Settings → License (configurable parent menu).</li>
          <li><strong>Updater</strong> — WP "Update" button fetches from this platform via <code style={{ color: '#a78bfa' }}>pre_set_site_transient_update_plugins</code> + <code style={{ color: '#a78bfa' }}>plugins_api</code>.</li>
          <li><strong>Twice-daily cron</strong> — Refreshes validation in the background so <code style={{ color: '#a78bfa' }}>SDK::is_valid()</code> is fast.</li>
          <li><strong>Pre-deactivation modal</strong> — Asks for a reason when the plugin is deactivated; posts to <code style={{ color: '#a78bfa' }}>/api/v1/feedback</code>.</li>
          <li><strong>Grace period</strong> — If the platform is unreachable, <code style={{ color: '#a78bfa' }}>is_valid()</code> stays true for N days (default 7) so customer sites don't break during an outage.</li>
        </ul>
      </Card>

      <Card title="Before you start" subtitle="Check these three things first — the rest is mechanical.">
        <ol style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, margin: '0 0 0 18px', padding: 0 }}>
          <li>You've cloned this repo locally (the SDK source lives at <code style={{ color: '#a78bfa' }}>packages/licenser-sdk-php/</code>). No public release exists yet — clone is currently the only way to get it.</li>
          <li>You've decided your plugin's PHP namespace prefix. Use vendor-prefixed (e.g. <code style={{ color: '#a78bfa' }}>Acme\AwesomePlugin</code>) so it can't collide with anyone else's SDK copy on the same WP site.</li>
          <li>You've created the product on <Link href="/admin/products" style={{ color: '#a78bfa' }}>/admin/products</Link> and know its slug — that's the <code style={{ color: '#a78bfa' }}>product_slug</code> the SDK will send.</li>
        </ol>
      </Card>

      <Card title="Step 1 — Get the SDK files into your plugin" subtitle="Easiest: download the zip below and unpack it inside your plugin. Works on every OS.">
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
          Download the zip and extract it into <code style={{ color: '#a78bfa' }}>your-plugin/includes/</code>. The zip already contains a top-level <code style={{ color: '#a78bfa' }}>licenser-sdk/</code> folder with the correct internal layout, so after extracting you'll have <code style={{ color: '#a78bfa' }}>your-plugin/includes/licenser-sdk/</code> with everything in place.
        </p>
        <p style={{ margin: '0 0 12px' }}>
          <a
            href="/admin/sdk/download"
            style={{
              display: 'inline-block',
              background: '#7c3aed',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            ⬇ Download licenser-sdk-php.zip
          </a>
          <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 10 }}>
            Built on demand from the current <code style={{ color: '#a78bfa' }}>packages/licenser-sdk-php/</code> source.
          </span>
        </p>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px', lineHeight: 1.6 }}>
          After extracting, your plugin tree should look like this:
        </p>
        {code(`acme-awesome-plugin/
├── awesome-plugin.php       ← you'll edit this in Step 3
└── includes/
    └── licenser-sdk/
        ├── SDK.php
        ├── Client.php
        ├── Cache.php
        ├── Config.php
        ├── Cron.php
        ├── Updater.php
        ├── AdminUI.php
        ├── FeedbackModal.php
        └── scripts/
            └── setup.php`)}
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          If you'd rather copy manually from <code style={{ color: '#a78bfa' }}>packages/licenser-sdk-php/</code> on disk: take the 8 <code style={{ color: '#a78bfa' }}>*.php</code> files plus <code style={{ color: '#a78bfa' }}>README.md</code> plus <code style={{ color: '#a78bfa' }}>scripts/setup.php</code>. Skip <code style={{ color: '#a78bfa' }}>composer.json</code>, <code style={{ color: '#a78bfa' }}>LICENSE</code>, <code style={{ color: '#a78bfa' }}>scripts/build-release.php</code>, and <code style={{ color: '#a78bfa' }}>scripts/install-sdk.sh</code> — those are SDK-repo metadata.
        </p>
      </Card>

      <Card title="Step 2 — Rewrite the namespace" subtitle="One command. Replaces __LICENSER_NAMESPACE__ everywhere so this copy of the SDK is isolated from any other plugin's copy.">
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px', lineHeight: 1.6 }}>
          From your plugin's root (the dir containing <code style={{ color: '#a78bfa' }}>awesome-plugin.php</code>):
        </p>
        {code('php includes/licenser-sdk/scripts/setup.php --namespace="Acme\\\\AwesomePlugin"')}
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          The script appends <code style={{ color: '#a78bfa' }}>\Licenser</code> automatically, so the SDK ends up as <code style={{ color: '#a78bfa' }}>Acme\AwesomePlugin\Licenser\SDK</code>, <code style={{ color: '#a78bfa' }}>Acme\AwesomePlugin\Licenser\Client</code>, etc. Pass the parent only. Backslashes need to be doubled (<code style={{ color: '#a78bfa' }}>\\</code>) so the shell doesn't eat them. The script is idempotent — safe to re-run.
        </p>
      </Card>

      <Card title="Step 3 — Wire it up in your main plugin file" subtitle="Paste these 9 lines near the top of awesome-plugin.php (after the plugin header comment).">
        {code(`<?php
/**
 * Plugin Name: Awesome Plugin
 * Version: 1.0.0
 */

require_once __DIR__ . '/includes/licenser-sdk/SDK.php';

$sdk = new \\Acme\\AwesomePlugin\\Licenser\\SDK([
    'endpoint'     => '${base}',
    'product_slug' => 'awesome-plugin',           // matches the slug on /admin/products
    'plugin_file'  => __FILE__,                   // used for the WP updater hooks
    'option_key'   => 'awesome_plugin_license',   // unique per plugin — avoids option collisions
]);
$sdk->boot();

// ... rest of your plugin code ...`)}
      </Card>

      <Card title="Step 4 — Activate and verify" subtitle="Sanity-check the install end-to-end.">
        <ol style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, margin: '0 0 0 18px', padding: 0 }}>
          <li>Activate the plugin in WordPress (Plugins → Activate).</li>
          <li>Go to Settings → License (or whatever <code style={{ color: '#a78bfa' }}>menu_parent</code> you configured). You should see the SDK's license entry UI.</li>
          <li>Paste a key from <Link href="/admin/licenses" style={{ color: '#a78bfa' }}>/admin/licenses</Link> (or generate one for this product) and click Activate.</li>
          <li>You should see a green "Active" badge. Confirm an activation row appeared on <Link href="/admin/activations" style={{ color: '#a78bfa' }}>/admin/activations</Link> for this site's domain.</li>
        </ol>
      </Card>

      <Card title="Optional — one-shot install on macOS/Linux" subtitle="Equivalent to Steps 1 + 2 in a single command. Skip this if you used the steps above.">
        {code(`# from packages/licenser-sdk-php/
./scripts/install-sdk.sh \\
  ../../../acme-awesome-plugin/includes/licenser-sdk \\
  'Acme\\\\AwesomePlugin'`)}
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          Output is byte-identical to the manual steps. Requires <code style={{ color: '#a78bfa' }}>bash</code> + <code style={{ color: '#a78bfa' }}>perl</code> (standard on macOS/Linux, available via Git Bash on Windows). Then jump to Step 3.
        </p>
      </Card>

      <Card title="Why the namespace rewrite matters" subtitle="The biggest WP-multi-plugin footgun this SDK avoids.">
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          If two plugins ship the SDK under the same namespace, WordPress autoloads the first one and silently ignores the second — a "stale SDK" bug that's nearly impossible to trace. By rewriting to <code style={{ color: '#a78bfa' }}>Acme\AwesomePlugin\Licenser\SDK</code>, every plugin gets its own isolated copy.
        </p>
      </Card>

      <Card title="Distributing as a release zip" subtitle="For the SDK maintainer (not plugin authors). Once published, consumers download-and-unzip instead of cloning.">
        {code(`# from packages/licenser-sdk-php/
php scripts/build-release.php --version=1.0.0
# → packages/licenser-sdk-php/dist/licenser-sdk-1.0.0.zip

gh release create wp-sdk-v1.0.0 \\
  packages/licenser-sdk-php/dist/licenser-sdk-1.0.0.zip \\
  --title "WP SDK v1.0.0" \\
  --notes "Drop-in licenser-sdk-php for WordPress plugins."`)}
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          The zip contents are byte-identical to what Step 1 above produces — same whitelist, same layout. Once a release exists, Step 1 becomes a download instead of a clone.
        </p>
      </Card>

      <h2 id="rest" style={{ ...ui.h2, marginTop: 32, color: '#f1f5f9', fontSize: 22 }}>Raw REST endpoints</h2>

      <Card>
        {code(`POST ${base}/api/v1/activate          Activate a site
POST ${base}/api/v1/deactivate        Deactivate a site
POST ${base}/api/v1/validate          Legacy validation (WP-SDK shape)
POST ${base}/api/v2/validate          CNVS-4 validation (features + tier) — CORS-open
POST ${base}/api/v1/check             Heartbeat
POST ${base}/api/v1/feedback          Deactivation feedback
GET  ${base}/api/v1/update-check      Plugin update probe
GET  ${base}/api/v1/update            Signed download URL
GET  ${base}/api/v1/health            Service health`)}
      </Card>

      <h2 id="faq" style={{ ...ui.h2, marginTop: 32, color: '#f1f5f9', fontSize: 22 }}>FAQ</h2>
      <Card>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px' }}><strong>Can the JS SDK be used outside React?</strong> Yes — <code style={{ color: '#a78bfa' }}>LicenserClient</code> is the core. The React hook is an optional subpath import.</p>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px' }}><strong>What's the cache TTL?</strong> JS hook: 1-hour revalidate + on focus. PHP SDK: 12 hours, refreshed by twice-daily cron.</p>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px' }}><strong>How are rate limits enforced?</strong> Per-IP on the platform, configurable on the Settings page. Default 60 req/min.</p>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px' }}><strong>Where do I get the SDK?</strong> Clone this repo — the SDK source is at <code style={{ color: '#a78bfa' }}>packages/licenser-sdk-php/</code>. No public release zip yet (see "Distributing as a release zip" above to cut one).</p>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px' }}><strong>Can I run setup.php more than once?</strong> Yes — it's idempotent. If you change your mind about the namespace, re-run it with the new value and every file gets re-rewritten in place.</p>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0 }}><strong>Composer support?</strong> Not yet. The drop-in copy + namespace-rewrite flow is the only supported path. Composer + Strauss is a planned phase-2 add.</p>
      </Card>
    </AdminShell>
  );
}
