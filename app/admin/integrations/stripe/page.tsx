import { headers } from 'next/headers';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { getAllSettings, mask, setManySettings } from '@/lib/licenser/settings';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function saveStripe(formData: FormData) {
  'use server';
  const { email } = await requireAdmin();
  const pk = String(formData.get('stripe_publishable_key') ?? '');
  const sk = String(formData.get('stripe_secret_key') ?? '');
  const wh = String(formData.get('stripe_webhook_secret') ?? '');
  const mode = String(formData.get('stripe_mode') ?? 'test') as 'test' | 'live';
  const updates: Record<string, string> = { stripe_mode: mode };
  if (pk) updates.stripe_publishable_key = pk;
  if (sk) updates.stripe_secret_key = sk;
  if (wh) updates.stripe_webhook_secret = wh;
  await setManySettings(updates as never, email);
  revalidatePath('/admin/integrations/stripe');
  redirect('/admin/integrations/stripe?ok=Stripe%20settings%20saved');
}

export default async function StripeSettings(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const supa = db();
  const settings = await getAllSettings();

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('host') ?? 'localhost:3000';
  const webhookUrl = `${proto}://${host}/api/webhooks/stripe`;
  const checkoutUrl = `${proto}://${host}/checkout`;

  const [{ data: plans }, { data: linkedLicenses }, { data: recentDeliveries }] = await Promise.all([
    supa.from('plans').select('id,name,price_cents,stripe_price_id,stripe_product_id,products(name)').order('name'),
    supa.from('licenses').select('id,key_prefix,customer_email,stripe_subscription_id,status,created_at').not('stripe_subscription_id', 'is', null).order('created_at', { ascending: false }).limit(10),
    supa.from('webhook_deliveries').select('*').eq('source', 'stripe').order('received_at', { ascending: false }).limit(10),
  ]);

  const planList = (plans ?? []) as unknown as Array<{ id: string; name: string; price_cents: number; stripe_price_id: string | null; stripe_product_id: string | null; products: { name: string } | null }>;
  const linked = (linkedLicenses ?? []) as Array<{ id: string; key_prefix: string; customer_email: string | null; stripe_subscription_id: string | null; status: string; created_at: string }>;
  const deliveries = (recentDeliveries ?? []) as Array<{ id: string; event: string | null; status: string; message: string | null; received_at: string }>;

  const mappedCount = planList.filter((p) => p.stripe_price_id).length;

  return (
    <AdminShell active="integrations" email={email}>
      <h1 style={ui.h1}><Link href="/admin/integrations" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Integrations</Link> · Stripe</h1>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <Card title="Status" subtitle="Stripe is the planned primary checkout. This page wires up keys + price mapping; the shop UI is next.">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div style={{ ...ui.card, padding: 12 }}><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Mode</div><div style={{ fontSize: 18, marginTop: 4 }}>{settings.stripe_mode}</div></div>
          <div style={{ ...ui.card, padding: 12 }}><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Secret key</div><div style={{ fontSize: 14, marginTop: 4 }}>{settings.stripe_secret_key ? mask(settings.stripe_secret_key) : <span style={{ color: '#94a3b8' }}>not set</span>}</div></div>
          <div style={{ ...ui.card, padding: 12 }}><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Webhook</div><div style={{ fontSize: 14, marginTop: 4 }}>{settings.stripe_webhook_secret ? mask(settings.stripe_webhook_secret) : <span style={{ color: '#94a3b8' }}>not set</span>}</div></div>
          <div style={{ ...ui.card, padding: 12 }}><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Plans with stripe_price_id</div><div style={{ fontSize: 18, marginTop: 4 }}>{mappedCount} / {planList.length}</div></div>
        </div>
      </Card>

      <Card title="Webhook URL" subtitle="Add this endpoint in Stripe Dashboard → Developers → Webhooks. Subscribe to checkout.session.completed, customer.subscription.* and invoice.* events.">
        <div style={ui.pre}>{webhookUrl}</div>
      </Card>

      <Card title="Checkout URL" subtitle="The customer-facing checkout page (coming soon).">
        <div style={ui.pre}>{checkoutUrl}</div>
      </Card>

      <Card title="API keys & webhook secret">
        <form action={saveStripe} style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={ui.label}>Mode</label>
            <select name="stripe_mode" defaultValue={settings.stripe_mode} style={{ ...ui.inp, width: 200 }}>
              <option value="test">test</option>
              <option value="live">live</option>
            </select>
          </div>
          <div>
            <label style={ui.label}>Publishable key</label>
            <input name="stripe_publishable_key" placeholder={settings.stripe_publishable_key ? `current: ${mask(settings.stripe_publishable_key)}` : 'pk_test_…'} style={{ ...ui.inp, width: '100%' }} />
          </div>
          <div>
            <label style={ui.label}>Secret key</label>
            <input name="stripe_secret_key" type="password" placeholder={settings.stripe_secret_key ? `current: ${mask(settings.stripe_secret_key)}` : 'sk_test_…'} style={{ ...ui.inp, width: '100%' }} />
          </div>
          <div>
            <label style={ui.label}>Webhook signing secret</label>
            <input name="stripe_webhook_secret" type="password" placeholder={settings.stripe_webhook_secret ? `current: ${mask(settings.stripe_webhook_secret)}` : 'whsec_…'} style={{ ...ui.inp, width: '100%' }} />
          </div>
          <div><button type="submit" style={ui.btn}>Save Stripe settings</button></div>
        </form>
      </Card>

      <Card title="Price mapping" subtitle="Plans must carry a stripe_price_id before Checkout can sell them. Edit each plan on the Plans page.">
        <div style={ui.list}>
          {planList.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No plans yet.</div>}
          {planList.map((p) => (
            <div key={p.id} style={{ ...ui.row, display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p.products?.name ?? '—'} · {p.name}</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>${(p.price_cents / 100).toFixed(2)}</div>
              </div>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
                {p.stripe_price_id ? <span style={{ color: '#cbd5e1' }}>{p.stripe_price_id}</span> : <span style={{ color: '#475569' }}>—</span>}
              </div>
              <Link href={`/admin/plans?edit=${p.id}`} style={ui.btnGhost}>Edit</Link>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Recent webhook deliveries">
        <div style={ui.list}>
          {deliveries.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No Stripe deliveries yet.</div>}
          {deliveries.map((d) => (
            <div key={d.id} style={{ ...ui.row, display: 'grid', gridTemplateColumns: '170px 100px 200px 1fr', gap: 12 }}>
              <span style={{ fontSize: 11, color: '#475569' }}>{new Date(d.received_at).toLocaleString()}</span>
              <StatusPill status={d.status} />
              <code style={{ fontSize: 11, color: '#cbd5e1' }}>{d.event ?? '—'}</code>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{d.message ?? ''}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Linked licenses">
        <div style={ui.list}>
          {linked.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No Stripe-linked licenses yet.</div>}
          {linked.map((l) => (
            <div key={l.id} style={ui.row}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{l.key_prefix}••••</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{l.customer_email ?? '—'} · {l.stripe_subscription_id}</div>
              </div>
              <StatusPill status={l.status} />
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
