import { headers } from 'next/headers';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { getAllSettings, setManySettings } from '@/lib/licenser/settings';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function saveBehavior(formData: FormData) {
  'use server';
  const { email } = await requireAdmin();
  await setManySettings({
    woo_auto_issue: formData.get('woo_auto_issue') === 'on',
    woo_auto_revoke: formData.get('woo_auto_revoke') === 'on',
    woo_grace_days: Math.max(0, Math.min(60, parseInt(String(formData.get('woo_grace_days') ?? '7'), 10) || 7)),
  }, email);
  revalidatePath('/admin/integrations/woocommerce');
  redirect('/admin/integrations/woocommerce?ok=Behavior%20saved');
}

async function upsertMapping(formData: FormData) {
  'use server';
  const woo_product_id = String(formData.get('woo_product_id') ?? '').trim();
  const woo_variation_id = String(formData.get('woo_variation_id') ?? '').trim();
  const plan_id = String(formData.get('plan_id') ?? '');
  if (!woo_product_id || !plan_id) redirect('/admin/integrations/woocommerce?error=Woo%20product%20ID%20and%20plan%20required');
  await db().from('plan_woo_variations').upsert(
    { plan_id, woo_product_id, woo_variation_id },
    { onConflict: 'woo_product_id,woo_variation_id' }
  );
  revalidatePath('/admin/integrations/woocommerce');
  redirect('/admin/integrations/woocommerce?ok=Mapping%20saved');
}

async function deleteMapping(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await db().from('plan_woo_variations').delete().eq('id', id);
  revalidatePath('/admin/integrations/woocommerce');
}

async function syncOrder(formData: FormData) {
  'use server';
  const orderId = String(formData.get('order_id') ?? '').trim();
  if (!orderId) redirect('/admin/integrations/woocommerce?error=Order%20ID%20required');
  // Placeholder: the actual sync logic lives in the woocommerce webhook handler.
  // For now we just log the request — wiring this to the live REST API is a follow-up.
  await db().from('logs').insert({ level: 'info', channel: 'woocommerce', message: 'manual sync requested', context: { order_id: orderId } });
  redirect(`/admin/integrations/woocommerce?ok=Logged%20sync%20request%20for%20order%20${orderId}`);
}

export default async function WooCommerceSettings(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const supa = db();
  const settings = await getAllSettings();

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('host') ?? 'localhost:3000';
  const webhookUrl = `${proto}://${host}/api/webhooks/woocommerce`;

  const [{ data: plans }, { data: mappings }, { data: recentDeliveries }] = await Promise.all([
    supa.from('plans').select('id,name,product_id,products(name)').order('name'),
    supa.from('plan_woo_variations').select('id,plan_id,woo_product_id,woo_variation_id,created_at,plans(name,products(name))').order('created_at', { ascending: false }),
    supa.from('webhook_deliveries').select('*').eq('source', 'woocommerce').order('received_at', { ascending: false }).limit(10),
  ]);

  const planList = (plans ?? []) as unknown as Array<{ id: string; name: string; products: { name: string } | null }>;
  const mapList = (mappings ?? []) as unknown as Array<{ id: string; plan_id: string; woo_product_id: string; woo_variation_id: string; created_at: string; plans: { name: string; products: { name: string } | null } | null }>;
  const deliveries = (recentDeliveries ?? []) as Array<{ id: string; event: string | null; status: string; message: string | null; received_at: string }>;

  const SUB_STATE: Array<{ state: string; effect: string; pill: string }> = [
    { state: 'active',           effect: 'License active',                pill: 'active' },
    { state: 'pending-cancel',   effect: 'License stays active until period end', pill: 'active' },
    { state: 'on-hold',          effect: 'License suspended',             pill: 'suspended' },
    { state: 'cancelled',        effect: 'License revoked at next renewal failure', pill: 'revoked' },
    { state: 'expired',          effect: 'License expired',               pill: 'expired' },
    { state: 'switched',         effect: 'Plan upgrade / downgrade applied', pill: 'info' },
  ];

  return (
    <AdminShell active="integrations" email={email}>
      <h1 style={ui.h1}><Link href="/admin/integrations" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Integrations</Link> · WooCommerce</h1>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <Card title="Webhook URL" subtitle="Configure this URL in WooCommerce → Settings → Advanced → Webhooks.">
        <div style={ui.pre}>{webhookUrl}</div>
      </Card>

      <Card title="Behavior" subtitle="Defaults applied on inbound Woo events.">
        <form action={saveBehavior} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 13 }}>
            <input type="checkbox" name="woo_auto_issue" defaultChecked={settings.woo_auto_issue} /> Auto-issue licenses on order completion
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 13 }}>
            <input type="checkbox" name="woo_auto_revoke" defaultChecked={settings.woo_auto_revoke} /> Auto-revoke licenses on refund / cancellation
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#cbd5e1', minWidth: 220 }}>Grace period (days, 0–60)</label>
            <input name="woo_grace_days" type="number" min="0" max="60" defaultValue={settings.woo_grace_days} style={{ ...ui.inp, width: 100 }} />
          </div>
          <div><button type="submit" style={ui.btn}>Save behavior</button></div>
        </form>
      </Card>

      <Card title="Subscription state machine" subtitle="How Woo Subscription statuses map onto license status.">
        <div style={ui.list}>
          {SUB_STATE.map((s) => (
            <div key={s.state} style={{ ...ui.row, display: 'grid', gridTemplateColumns: '180px 120px 1fr', gap: 14 }}>
              <code style={{ color: '#cbd5e1', fontSize: 12 }}>{s.state}</code>
              <StatusPill status={s.pill} />
              <span style={{ color: '#94a3b8', fontSize: 13 }}>{s.effect}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Variation → plan mapping" subtitle="Map a Woo product (and optionally variation) to a Licenser plan so orders auto-issue the right license.">
        <form action={upsertMapping} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
          <input name="woo_product_id" placeholder="Woo product ID *" required style={ui.inp} />
          <input name="woo_variation_id" placeholder="Variation ID (optional)" style={ui.inp} />
          <select name="plan_id" required style={ui.inp}>
            <option value="">Plan…</option>
            {planList.map((p) => <option key={p.id} value={p.id}>{p.products?.name ?? '—'} · {p.name}</option>)}
          </select>
          <button type="submit" style={ui.btn}>Save mapping</button>
        </form>
        <div style={ui.list}>
          {mapList.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No mappings yet.</div>}
          {mapList.map((m) => (
            <div key={m.id} style={ui.row}>
              <div style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: '#cbd5e1' }}>
                product:{m.woo_product_id}{m.woo_variation_id ? ` · variation:${m.woo_variation_id}` : ''}
              </div>
              <div style={{ fontSize: 13, color: '#f1f5f9' }}>
                {m.plans?.products?.name ?? '—'} · {m.plans?.name ?? '—'}
              </div>
              <form action={deleteMapping}>
                <input type="hidden" name="id" value={m.id} />
                <button style={ui.btnDanger}>Remove</button>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Test: sync an order" subtitle="Re-issue / re-sync licenses for an existing Woo order. Useful for backfill.">
        <form action={syncOrder} style={{ display: 'flex', gap: 10 }}>
          <input name="order_id" placeholder="Woo order ID" required style={{ ...ui.inp, flex: 1 }} />
          <button type="submit" style={ui.btn}>Sync licenses</button>
        </form>
      </Card>

      <Card title="Recent webhook deliveries">
        <div style={ui.list}>
          {deliveries.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No deliveries recorded.</div>}
          {deliveries.map((d) => (
            <div key={d.id} style={{ ...ui.row, display: 'grid', gridTemplateColumns: '170px 100px 110px 1fr', gap: 12 }}>
              <span style={{ fontSize: 11, color: '#475569' }}>{new Date(d.received_at).toLocaleString()}</span>
              <StatusPill status={d.status} />
              <code style={{ fontSize: 11, color: '#cbd5e1' }}>{d.event ?? '—'}</code>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{d.message ?? ''}</span>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
