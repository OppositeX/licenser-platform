import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, StatusPill, ui } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

const REASONS = ['bug', 'alternative', 'no-longer-needed', 'temporary', 'other'] as const;

interface FeedbackRow {
  id: string;
  license_id: string | null;
  product_id: string | null;
  domain: string | null;
  reason: typeof REASONS[number];
  message: string | null;
  created_at: string;
  products: { slug: string; name: string } | null;
}

export default async function FeedbackPage(props: { searchParams: Promise<{ reason?: string; product?: string }> }) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const supa = db();
  const { data: products } = await supa.from('products').select('id,name').order('name');
  const productList = (products ?? []) as Array<{ id: string; name: string }>;

  let q = supa.from('feedback').select('*,products(slug,name)').order('created_at', { ascending: false }).limit(300);
  if (searchParams.reason && (REASONS as readonly string[]).includes(searchParams.reason)) q = q.eq('reason', searchParams.reason);
  if (searchParams.product) q = q.eq('product_id', searchParams.product);
  const { data: rows } = await q;
  const list = (rows ?? []) as unknown as FeedbackRow[];

  // Breakdown for analytics
  const totalCounts: Record<string, number> = {};
  for (const r of REASONS) totalCounts[r] = 0;
  const { data: allFb } = await supa.from('feedback').select('reason');
  for (const r of (allFb ?? []) as Array<{ reason: string }>) {
    totalCounts[r.reason] = (totalCounts[r.reason] ?? 0) + 1;
  }

  const tab = (label: string, value: string | null) => {
    const active = (searchParams.reason ?? '') === (value ?? '');
    const params = new URLSearchParams();
    if (searchParams.product) params.set('product', searchParams.product);
    if (value) params.set('reason', value);
    const href = '/admin/feedback' + (params.toString() ? '?' + params.toString() : '');
    return (
      <Link key={label} href={href} style={{
        ...ui.btnGhost,
        background: active ? '#1f2937' : 'transparent',
        color: active ? '#f1f5f9' : '#94a3b8',
        fontWeight: active ? 700 : 500,
      }}>{label}</Link>
    );
  };

  return (
    <AdminShell active="feedback" email={email}>
      <h1 style={ui.h1}>Deactivation feedback</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 18px' }}>Submitted by the SDK when a customer deactivates a site.</p>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 18 }}>
        {REASONS.map((r) => (
          <div key={r} style={{ ...ui.card, padding: 12 }}>
            <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{r}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{totalCounts[r] ?? 0}</div>
          </div>
        ))}
      </div>

      <form method="get" style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <select name="product" defaultValue={searchParams.product ?? ''} style={ui.inp}>
          <option value="">All products</option>
          {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {searchParams.reason && <input type="hidden" name="reason" value={searchParams.reason} />}
        <button type="submit" style={ui.btn}>Filter</button>
        {(searchParams.reason || searchParams.product) && <Link href="/admin/feedback" style={ui.btnGhost}>Clear</Link>}
      </form>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {tab('All', null)}
        {REASONS.map((r) => tab(r, r))}
      </div>

      <div style={ui.list}>
        {list.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No feedback yet.</div>}
        {list.map((f) => (
          <div key={f.id} style={{ ...ui.row, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 110, fontSize: 11, color: '#475569' }}>{new Date(f.created_at).toLocaleString()}</div>
            <StatusPill status={f.reason} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, color: '#f1f5f9' }}>{f.message ?? <span style={{ color: '#475569' }}>(no message)</span>}</div>
              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {f.products?.name ?? '—'}{f.domain ? ` · ${f.domain}` : ''}{f.license_id ? ` · lic ${f.license_id.slice(0, 8)}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
