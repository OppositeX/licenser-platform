import Link from 'next/link';
import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell, Card, ui } from '@/components/AdminShell';
import WpInstallForm from './WpInstallForm';

export const dynamic = 'force-dynamic';

export default async function SdkDocsPage() {
  const { email } = await requireAdmin();
  const h = await headers();
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
        Three steps. The form below pre-rewrites the SDK with your namespace and generates a copy-paste-ready snippet — no terminal commands needed.
      </p>

      <Card title="What you'll get" subtitle="One SDK::init() call wires every WP hook the SDK needs.">
        <ul style={{ margin: 0, padding: '0 0 0 18px', color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
          <li><strong>License page</strong> — Activate / deactivate / refresh UI. Defaults to Settings → &lt;your label&gt;; pass <code style={{ color: '#a78bfa' }}>menu_parent</code> to nest it under your plugin's own top-level menu.</li>
          <li><strong>Updater</strong> — WP "Update" button fetches from this platform via <code style={{ color: '#a78bfa' }}>pre_set_site_transient_update_plugins</code> + <code style={{ color: '#a78bfa' }}>plugins_api</code>.</li>
          <li><strong>Twice-daily cron</strong> — Refreshes validation in the background so <code style={{ color: '#a78bfa' }}>SDK::is_valid()</code> is fast.</li>
          <li><strong>Pre-deactivation modal</strong> — Asks for a reason when the plugin is deactivated; posts to <code style={{ color: '#a78bfa' }}>/api/v1/feedback</code>.</li>
          <li><strong>Grace period</strong> — If the platform is unreachable, <code style={{ color: '#a78bfa' }}>is_valid()</code> stays true for N days (default 7) so customer sites don't break during an outage.</li>
        </ul>
      </Card>

      <Card title="Before you start" subtitle="One prerequisite.">
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          Create your product on <Link href="/admin/products" style={{ color: '#a78bfa' }}>/admin/products</Link> and note its slug — that's the <code style={{ color: '#a78bfa' }}>product_slug</code> you'll enter below.
        </p>
      </Card>

      <Card title="Configure & install" subtitle="Fill in the four fields, then follow the two numbered actions inside.">
        <WpInstallForm base={base} />
      </Card>

      <Card title="Activate &amp; verify" subtitle="Sanity-check end-to-end.">
        <ol style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, margin: '0 0 0 18px', padding: 0 }}>
          <li>Activate the plugin in WordPress (Plugins → Activate).</li>
          <li>Find the License page — it's under Settings by default, or under your plugin's top-level menu if you set <code style={{ color: '#a78bfa' }}>menu_parent</code>.</li>
          <li>Paste a key from <Link href="/admin/licenses" style={{ color: '#a78bfa' }}>/admin/licenses</Link> (or generate one for this product) and click Activate.</li>
          <li>You should see a green "Active" badge. Confirm an activation row appeared on <Link href="/admin/activations" style={{ color: '#a78bfa' }}>/admin/activations</Link> for this site's domain.</li>
        </ol>
      </Card>

      <Card title="Nesting License under your plugin's own menu" subtitle="Two ways, depending on whether your plugin already has a top-level menu.">
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px', lineHeight: 1.6 }}>
          <strong>If your plugin already calls <code style={{ color: '#a78bfa' }}>add_menu_page()</code></strong> to register a top-level menu (e.g. with slug <code style={{ color: '#a78bfa' }}>my-plugin</code>), just set <code style={{ color: '#a78bfa' }}>menu_parent</code> in the form above to that slug. The License page will appear as a submenu.
        </p>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px', lineHeight: 1.6 }}>
          <strong>If your plugin doesn't have a top-level menu yet</strong>, add one — minimal example:
        </p>
        {code(`add_action('admin_menu', function () {
    add_menu_page(
        'My Plugin',                    // page title
        'My Plugin',                    // menu label
        'manage_options',               // capability
        'my-plugin',                    // menu slug ← pass this as 'menu_parent'
        '__return_null',                // top-level page renderer (or your own)
        'dashicons-admin-generic',      // icon
        65                              // position
    );
}, 9);  // priority 9 so this runs before the SDK's admin_menu hook (default 10)`)}
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          The priority &lt; 10 matters: the SDK's <code style={{ color: '#a78bfa' }}>AdminUI</code> calls <code style={{ color: '#a78bfa' }}>add_submenu_page()</code> at the default priority 10, so the parent menu needs to exist first.
        </p>
      </Card>

      <Card title="Power-user CLI path" subtitle="For when you can't open /admin/sdk (offline / CI / scripted installs).">
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '0 0 8px', lineHeight: 1.6 }}>
          The download endpoint still works without the <code style={{ color: '#a78bfa' }}>?namespace=</code> param — you get the un-rewritten zip with <code style={{ color: '#a78bfa' }}>__LICENSER_NAMESPACE__</code> placeholders, plus the original <code style={{ color: '#a78bfa' }}>scripts/setup.php</code>. Extract, then run:
        </p>
        {code('php includes/licenser-sdk/scripts/setup.php --namespace="Acme\\\\AwesomePlugin"')}
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
          Bash users double the backslash (<code style={{ color: '#a78bfa' }}>\\</code>); PowerShell users use a single backslash. Or — on macOS/Linux — use the one-shot helper inside the repo at <code style={{ color: '#a78bfa' }}>packages/licenser-sdk-php/scripts/install-sdk.sh</code>.
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
