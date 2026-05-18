import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, StatusPill } from '@/components/AdminShell';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

function genKey(): string {
  const seg = () => Math.random().toString(36).slice(2, 10).toUpperCase();
  return `LIC-${seg()}-${seg()}-${seg()}-${seg()}`;
}

async function createLicense(formData: FormData) {
  'use server';
  const product_id = String(formData.get('product_id') ?? '');
  const plan_id = String(formData.get('plan_id') ?? '') || null;
  const customer_email = String(formData.get('customer_email') ?? '').trim() || null;
  const max_activations = Math.max(1, parseInt(String(formData.get('max_activations') ?? '1'), 10) || 1);
  const expires_at = String(formData.get('expires_at') ?? '').trim() || null;
  if (!product_id) return;
  await db().from('licenses').insert({
    product_id, plan_id, customer_email, max_activations, expires_at,
    key: genKey(),
  });
  revalidatePath('/admin/licenses');
}

async function setLicenseStatus(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !['active', 'suspended', 'revoked', 'expired'].includes(status)) return;
  await db().from('licenses').update({ status }).eq('id', id);
  revalidatePath('/admin/licenses');
}

const inp: React.CSSProperties = { background: '#0a0a0f', border: '1px solid #1f2937', color: '#f1f5f9', borderRadius: 8, padding: '10px 12px', fontSize: 13 };
const btn: React.CSSProperties = { background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };

export default async function LicensesPage({ searchParams }: { searchParams: { product?: string; reveal?: string } }) {
  const { email } = await requireAdmin();
  const supa = db();
  const { data: products } = await supa.from('products').select('id,slug,name').order('name');
  let q = supa.from('licenses').select('*').order('created_at', { ascending: false }).limit(200);
  if (searchParams.product) q = q.eq('product_id', searchParams.product);
  const { data: licenses } = await q;
  const revealId = searchParams.reveal ?? null;

  return (
    <AdminShell active="licenses" email={email}>
      <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 18px' }}>Licenses</h1>

      <form action={createLicense} style={{ background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, padding: 18, marginBottom: 18, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <select name="product_id" required style={inp}>
          <option value="">Select product...</option>
          {(products ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input name="customer_email" type="email" placeholder="Customer email" style={inp} />
        <input name="max_activations" type="number" min="1" defaultValue="1" placeholder="Max activations" style={inp} />
        <input name="expires_at" type="date" placeholder="Expires (optional)" style={inp} />
        <button type="submit" style={btn}>Issue license</button>
      </form>

      <form method="get" style={{ marginBottom: 18 }}>
        <select name="product" defaultValue={searchParams.product ?? ''} onChange={(e) => e.currentTarget.form?.submit()} style={inp}>
          <option value="">All products</option>
          {(products ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </form>

      <div style={{ background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
        {(licenses ?? []).length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No licenses yet.</div>}
        {(licenses ?? []).map((l: { id: string; key: string; key_prefix: string; status: string; customer_email: string | null; max_activations: number; expires_at: string | null }) => (
          <div key={l.id} style={{ padding: '14px 22px', borderBottom: '1px solid #1f2937', display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: '#f1f5f9' }}>
                {revealId === l.id ? l.key : (l.key_prefix + '••••••••••••••••••')}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                {l.customer_email ?? 'no email'} · {l.max_activations} seats {l.expires_at ? '· exp ' + new Date(l.expires_at).toLocaleDateString() : ''}
              </div>
            </div>
            <StatusPill status={l.status} />
            <a href={`?reveal=${l.id}${searchParams.product ? '&product=' + searchParams.product : ''}`} style={{ color: '#a78bfa', fontSize: 12, textDecoration: 'none' }}>Reveal</a>
            <form action={setLicenseStatus} style={{ display: 'flex', gap: 4 }}>
              <input type="hidden" name="id" value={l.id} />
              <select name="status" defaultValue={l.status} style={{ ...inp, padding: '6px 8px', fontSize: 12 }}>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
                <option value="revoked">revoked</option>
                <option value="expired">expired</option>
              </select>
              <button style={{ background: 'transparent', color: '#cbd5e1', border: '1px solid #1f2937', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>Save</button>
            </form>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
