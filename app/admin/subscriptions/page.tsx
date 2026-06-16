import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, StatusPill, ui } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

interface SubRow {
  id: string;
  key_prefix: string;
  customer_email: string | null;
  customer_name: string | null;
  status: string;
  expires_at: string | null;
  grace_until: string | null;
  woo_order_id: string | null;
  woo_subscription_id: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  products: { slug: string; name: string } | null;
  plans: { slug: string; name: string } | null;
}

export default async function SubscriptionsPage({ searchParams }: { searchParams: { source?: 'woo' | 'stripe' | 'all' } }) {
  const { email } = await requireAdmin();
  const source = (searchParams.source ?? 'all');

  let q = db()
    .from('licenses')
    .select('id,key_prefix,customer_email,customer_name,status,expires_at,grace_until,woo_order_id,woo_subscription_id,stripe_subscription_id,stripe_customer_id,products(slug,name),plans(slug,name)')
    .order('created_at', { ascending: false })
    .limit(300);

  // Filter to only subscription-linked licenses
  if (source === 'woo') q = q.not('woo_subscription_id', 'is', null);
  else if (source === 'stripe') q = q.not('stripe_subscription_id', 'is', null);
  else {
    // "all" = at least one subscription identifier present (Woo order / Woo sub / Stripe sub)
    q = q.or('woo_subscription_id.not.is.null,stripe_subscription_id.not.is.null,woo_order_id.not.is.null');
  }

  const { data: rows } = await q;
  const list = (rows ?? []) as unknown as SubRow[];

  const tab = (label: string, value: 'all' | 'woo' | 'stripe') => {
    const active = source === value;
    return (
      <Link key={value} href={`/admin/subscriptions?source=${value}`} style={{
        ...ui.btnGhost,
        background: active ? '#1f2937' : 'transparent',
        color: active ? '#f1f5f9' : '#94a3b8',
        fontWeight: active ? 700 : 500,
      }}>{label}</Link>
    );
  };

  return (
    <AdminShell active="subscriptions" email={email}>
      <h1 style={ui.h1}>Subscriptions</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 18px' }}>
        Licenses linked to a recurring subscription (Woo or Stripe). Status here is driven by webhook events from the source of truth.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {tab('All', 'all')}
        {tab('WooCommerce', 'woo')}
        {tab('Stripe', 'stripe')}
      </div>

      <div style={ui.list}>
        {list.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No subscription-linked licenses.</div>}
        {list.map((l) => (
          <div key={l.id} style={ui.row}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{l.key_prefix}••••</div>
              <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 2 }}>
                {l.customer_email ?? 'no email'} · {l.products?.name ?? '—'} · {l.plans?.name ?? 'no plan'}
              </div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 2, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {l.woo_order_id ? `woo-order:${l.woo_order_id} ` : ''}
                {l.woo_subscription_id ? `woo-sub:${l.woo_subscription_id} ` : ''}
                {l.stripe_subscription_id ? `stripe:${l.stripe_subscription_id} ` : ''}
                {l.stripe_customer_id ? `cust:${l.stripe_customer_id}` : ''}
              </div>
            </div>
            <StatusPill status={l.status} />
            <div style={{ color: '#94a3b8', fontSize: 11, minWidth: 100, textAlign: 'right' }}>
              {l.expires_at ? `exp ${new Date(l.expires_at).toLocaleDateString()}` : 'no expiry'}
              {l.grace_until && <div style={{ fontSize: 10, color: '#fcd34d' }}>grace {new Date(l.grace_until).toLocaleDateString()}</div>}
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
