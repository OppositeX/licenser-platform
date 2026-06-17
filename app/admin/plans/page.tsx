import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Drawer, FlashFromQuery, ui } from '@/components/AdminShell';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PlanFull {
  id: string;
  product_id: string;
  slug: string;
  name: string;
  max_activations: number;
  recurring: boolean;
  price_cents: number;
  period: 'lifetime' | 'day' | 'week' | 'month' | 'year';
  period_count: number;
  billing_interval: 'monthly' | 'annual' | 'one_time' | 'custom' | null;
  trial_days: number;
  feature_flags: string[];
  woo_product_id: string | null;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
}

async function upsertPlan(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const product_id = String(formData.get('product_id') ?? '');
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  if (!product_id || !slug || !name) redirect('/admin/plans?error=Product%2C%20slug%20and%20name%20required');
  const featureFlagsRaw = String(formData.get('feature_flags') ?? '').trim();
  const feature_flags = featureFlagsRaw ? featureFlagsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const row = {
    product_id,
    slug,
    name,
    max_activations: Math.max(1, parseInt(String(formData.get('max_activations') ?? '1'), 10) || 1),
    recurring: formData.get('recurring') === 'on',
    price_cents: Math.max(0, parseInt(String(formData.get('price_cents') ?? '0'), 10) || 0),
    period: String(formData.get('period') ?? 'lifetime'),
    period_count: Math.max(0, parseInt(String(formData.get('period_count') ?? '0'), 10) || 0),
    billing_interval: String(formData.get('billing_interval') ?? '') || null,
    trial_days: Math.max(0, parseInt(String(formData.get('trial_days') ?? '0'), 10) || 0),
    feature_flags,
    woo_product_id: String(formData.get('woo_product_id') ?? '').trim() || null,
    stripe_price_id: String(formData.get('stripe_price_id') ?? '').trim() || null,
    stripe_product_id: String(formData.get('stripe_product_id') ?? '').trim() || null,
  };
  if (id) {
    await db().from('plans').update(row).eq('id', id);
  } else {
    await db().from('plans').insert(row);
  }
  revalidatePath('/admin/plans');
  redirect('/admin/plans?ok=Plan%20saved');
}

async function deletePlan(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await db().from('plans').delete().eq('id', id);
  revalidatePath('/admin/plans');
  redirect('/admin/plans?ok=Plan%20deleted');
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free / custom';
  return '$' + (cents / 100).toFixed(2);
}

function formatPeriod(p: PlanFull): string {
  if (p.period === 'lifetime' || p.period_count === 0) return 'lifetime';
  return `${p.period_count} ${p.period}${p.period_count === 1 ? '' : 's'}`;
}

export default async function PlansPage(
  props: { searchParams: Promise<{ new?: string; edit?: string; ok?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const supa = db();
  const [{ data: products }, { data: plans }] = await Promise.all([
    supa.from('products').select('id,slug,name').order('name'),
    supa.from('plans').select('*').order('product_id').order('price_cents'),
  ]);
  const productList = (products ?? []) as Array<{ id: string; slug: string; name: string }>;
  const list = (plans ?? []) as PlanFull[];
  const editing = searchParams.edit ? list.find((p) => p.id === searchParams.edit) : null;
  const productById = Object.fromEntries(productList.map((p) => [p.id, p]));
  const drawerOpen = !!editing || searchParams.new === '1';

  return (
    <AdminShell active="plans" email={email}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ ...ui.h1, margin: 0 }}>Plans</h1>
        <Link href="/admin/plans?new=1" style={ui.btn}>+ Add plan</Link>
      </header>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <div style={ui.list}>
        {list.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No plans yet. Click <Link href="/admin/plans?new=1" style={{ color: '#a78bfa' }}>+ Add plan</Link>.</div>}
        {list.map((p) => (
          <div key={p.id} style={ui.row}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {p.name} <span style={{ color: '#475569', fontWeight: 400 }}>· {productById[p.product_id]?.name ?? '—'}</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {p.slug} · {p.max_activations} seats · {formatPeriod(p)} · {formatPrice(p.price_cents)}{p.trial_days > 0 ? ` · ${p.trial_days}d trial` : ''}{p.recurring ? ' · recurring' : ''}
              </div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                {p.feature_flags?.length ? 'flags: ' + p.feature_flags.join(', ') : 'no flags'}
                {p.woo_product_id ? ` · woo:${p.woo_product_id}` : ''}
                {p.stripe_price_id ? ` · ${p.stripe_price_id}` : ''}
              </div>
            </div>
            <Link href={`/admin/plans?edit=${p.id}`} style={ui.btnGhost}>Edit</Link>
            <form action={deletePlan}>
              <input type="hidden" name="id" value={p.id} />
              <button style={ui.btnDanger}>Delete</button>
            </form>
          </div>
        ))}
      </div>

      <Drawer
        open={drawerOpen}
        title={editing ? `Edit: ${editing.name}` : 'Add plan'}
        subtitle="Plans define seats, pricing, and feature flags. Link to WooCommerce / Stripe for paid purchases."
        closeHref="/admin/plans"
      >
        <form action={upsertPlan} style={ui.formGrid}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div style={{ gridColumn: '1 / -1' }}><label style={ui.label}>Product *</label>
            <select name="product_id" required defaultValue={editing?.product_id ?? ''} style={ui.inp}>
              <option value="">Select…</option>
              {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label style={ui.label}>Plan slug *</label><input name="slug" required defaultValue={editing?.slug ?? ''} placeholder="pro_monthly" style={ui.inp} /></div>
          <div><label style={ui.label}>Display name *</label><input name="name" required defaultValue={editing?.name ?? ''} placeholder="Pro (monthly)" style={ui.inp} /></div>
          <div><label style={ui.label}>Max activations</label><input name="max_activations" type="number" min="1" defaultValue={editing?.max_activations ?? 1} style={ui.inp} /></div>
          <div><label style={ui.label}>Price (cents)</label><input name="price_cents" type="number" min="0" defaultValue={editing?.price_cents ?? 0} style={ui.inp} /></div>
          <div><label style={ui.label}>Trial days</label><input name="trial_days" type="number" min="0" defaultValue={editing?.trial_days ?? 0} style={ui.inp} /></div>
          <div><label style={ui.label}>Period</label>
            <select name="period" defaultValue={editing?.period ?? 'lifetime'} style={ui.inp}>
              <option value="lifetime">lifetime</option>
              <option value="day">day</option>
              <option value="week">week</option>
              <option value="month">month</option>
              <option value="year">year</option>
            </select>
          </div>
          <div><label style={ui.label}>Period count (0 = lifetime)</label><input name="period_count" type="number" min="0" defaultValue={editing?.period_count ?? 0} style={ui.inp} /></div>
          <div><label style={ui.label}>Billing interval (Stripe-compat)</label>
            <select name="billing_interval" defaultValue={editing?.billing_interval ?? ''} style={ui.inp}>
              <option value="">—</option>
              <option value="monthly">monthly</option>
              <option value="annual">annual</option>
              <option value="one_time">one_time</option>
              <option value="custom">custom</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 13, alignSelf: 'end', paddingBottom: 10 }}>
            <input type="checkbox" name="recurring" defaultChecked={editing?.recurring ?? false} /> Recurring
          </label>
          <div><label style={ui.label}>WooCommerce product ID</label><input name="woo_product_id" defaultValue={editing?.woo_product_id ?? ''} style={ui.inp} /></div>
          <div><label style={ui.label}>Stripe price ID</label><input name="stripe_price_id" defaultValue={editing?.stripe_price_id ?? ''} placeholder="price_…" style={ui.inp} /></div>
          <div><label style={ui.label}>Stripe product ID</label><input name="stripe_product_id" defaultValue={editing?.stripe_product_id ?? ''} placeholder="prod_…" style={ui.inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={ui.label}>Feature flags (comma-separated)</label>
            <input name="feature_flags" defaultValue={editing?.feature_flags?.join(', ') ?? ''} placeholder="preset-library, ai-relay, copilot" style={ui.inp} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" style={ui.btn}>{editing ? 'Save changes' : 'Add plan'}</button>
            <Link href="/admin/plans" style={ui.btnGhost}>Cancel</Link>
          </div>
        </form>
      </Drawer>
    </AdminShell>
  );
}
