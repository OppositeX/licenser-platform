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

      <Card title="Install (drop-in zip)" subtitle="Recommended for plugin authors who don't use Composer.">
        <ol style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, margin: '0 0 0 18px', padding: 0 }}>
          <li>Download <code style={{ color: '#a78bfa' }}>licenser-sdk-&lt;version&gt;.zip</code> from GitHub releases.</li>
          <li>Unzip into <code style={{ color: '#a78bfa' }}>your-plugin/includes/licenser-sdk/</code>.</li>
          <li>Run the namespace rewriter once (replaces <code style={{ color: '#a78bfa' }}>__LICENSER_NAMESPACE__</code> with your plugin's prefix):</li>
        </ol>
        {code('php includes/licenser-sdk/scripts/setup.php --namespace=MyPlugin')}
      </Card>

      <Card title="Wire it up">
        {code(`require_once __DIR__ . '/includes/licenser-sdk/SDK.php';

$sdk = new \\MyPlugin\\Licenser\\SDK([
  'endpoint'     => '${base}',
  'product_slug' => 'your-plugin-slug',
  'plugin_file'  => __FILE__,
  'option_key'   => 'my_plugin_license',  // unique per plugin — avoids option collisions
]);
$sdk->boot();`)}
      </Card>

      <Card title="What boot() registers" subtitle="One call wires every WP hook the SDK needs.">
        <ul style={{ margin: 0, padding: '0 0 0 18px', color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
          <li><strong>Settings page</strong> — License entry / status under Settings → License (configurable parent menu).</li>
          <li><strong>Updater</strong> — Hooks <code style={{ color: '#a78bfa' }}>pre_set_site_transient_update_plugins</code> + <code style={{ color: '#a78bfa' }}>plugins_api</code> so WP "Update" buttons fetch from the platform.</li>
          <li><strong>Twice-daily cron</strong> — Refreshes validation in the background so <code style={{ color: '#a78bfa' }}>SDK::is_valid()</code> is fast.</li>
          <li><strong>Pre-deactivation modal</strong> — Asks for a reason when the plugin is deactivated; posts to <code style={{ color: '#a78bfa' }}>/api/v1/feedback</code>.</li>
          <li><strong>Grace period</strong> — If the platform is unreachable, <code style={{ color: '#a78bfa' }}>is_valid()</code> stays true for N days (default 7) so customer sites don't break during an outage.</li>
        </ul>
      </Card>

      <Card title="Why namespace rewriting?" subtitle="Multi-plugin WordPress sites are a minefield without this.">
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          If two plugins ship the SDK under <code style={{ color: '#a78bfa' }}>Licenser\SDK</code>, WordPress autoloads the first one and silently
          ignores the second — leading to "stale SDK" bugs that are nearly impossible to trace. By rewriting to
          <code style={{ color: '#a78bfa' }}>MyPlugin\Licenser\SDK</code>, every plugin gets its own isolated copy.
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
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0 }}><strong>Composer support?</strong> Not yet — the drop-in zip works for ~95% of WP plugin devs. Composer + Strauss is a planned phase-2 add.</p>
      </Card>
    </AdminShell>
  );
}
