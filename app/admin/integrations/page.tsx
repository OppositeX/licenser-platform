import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, StatusPill, ui } from '@/components/AdminShell';
import { getAllSettings } from '@/lib/licenser/settings';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const { email } = await requireAdmin();
  const supa = db();
  const settings = await getAllSettings();

  const [{ count: wooLicenses }, { count: stripeLicenses }, { count: githubDeliveries }] = await Promise.all([
    supa.from('licenses').select('*', { count: 'exact', head: true }).not('woo_order_id', 'is', null),
    supa.from('licenses').select('*', { count: 'exact', head: true }).not('stripe_subscription_id', 'is', null),
    supa.from('webhook_deliveries').select('*', { count: 'exact', head: true }).eq('source', 'github'),
  ]);

  const wooStatus = settings.woo_auto_issue || (wooLicenses ?? 0) > 0 ? 'connected' : 'not-configured';
  const githubStatus = settings.github_webhook_secret ? 'configured' : 'not-configured';
  const stripeStatus = settings.stripe_secret_key ? `configured (${settings.stripe_mode})` : 'not-configured';

  const card = (opts: {
    name: string; href: string; status: string; description: string;
    meta: Array<string>; ctaLabel?: string;
  }) => (
    <div style={{ ...ui.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{opts.name}</h3>
        <StatusPill status={opts.status} />
      </div>
      <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13 }}>{opts.description}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', color: '#94a3b8', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {opts.meta.map((m, i) => <li key={i}>· {m}</li>)}
      </ul>
      <div style={{ marginTop: 'auto' }}>
        <Link href={opts.href} style={ui.btn}>{opts.ctaLabel ?? 'Settings'}</Link>
      </div>
    </div>
  );

  return (
    <AdminShell active="integrations" email={email}>
      <h1 style={ui.h1}>Integrations</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 18px' }}>Connectors that drive license issuance and updates. Each card links to its own settings page.</p>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {card({
          name: 'WooCommerce',
          href: '/admin/integrations/woocommerce',
          status: wooStatus,
          description: 'Issue and revoke licenses on Woo order events. Map Woo products/variations to plans.',
          meta: [
            settings.woo_auto_issue ? 'Auto-issue: on' : 'Auto-issue: off',
            settings.woo_auto_revoke ? 'Auto-revoke: on' : 'Auto-revoke: off',
            `${wooLicenses ?? 0} linked licenses`,
            `Grace period: ${settings.woo_grace_days} days`,
          ],
        })}
        {card({
          name: 'GitHub',
          href: '/admin/integrations/github',
          status: githubStatus,
          description: 'Receive release webhooks from GitHub and serve signed plugin updates to customers.',
          meta: [
            settings.github_webhook_secret ? 'Webhook secret set' : 'No webhook secret',
            settings.github_pat ? 'PAT configured (private repo access)' : 'No PAT (public repos only)',
            `${githubDeliveries ?? 0} recorded deliveries`,
          ],
        })}
        {card({
          name: 'Stripe',
          href: '/admin/integrations/stripe',
          status: stripeStatus,
          description: 'Sell licenses via Stripe Checkout. Map Stripe prices to plans and listen for subscription events.',
          meta: [
            `Mode: ${settings.stripe_mode}`,
            settings.stripe_secret_key ? 'Secret key set' : 'No secret key',
            settings.stripe_webhook_secret ? 'Webhook secret set' : 'No webhook secret',
            `${stripeLicenses ?? 0} linked licenses`,
          ],
        })}
      </div>
    </AdminShell>
  );
}
