import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminIndex() {
  const { email } = await requireAdmin();
  const supa = db();
  const [products, licenses, activations, events] = await Promise.all([
    supa.from('products').select('*', { count: 'exact', head: true }),
    supa.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supa.from('activations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supa.from('events').select('id,type,created_at,data').order('created_at', { ascending: false }).limit(10),
  ]);

  const stat = (label: string, value: number | string, href: string) => (
    <Link href={href} style={{ display: 'block', background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, padding: '20px 22px', textDecoration: 'none', color: '#f1f5f9' }}>
      <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </Link>
  );

  return (
    <AdminShell active="products" email={email}>
      <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 18px' }}>Overview</h1>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 28 }}>
        {stat('Products', products.count ?? 0, '/admin/products')}
        {stat('Active licenses', licenses.count ?? 0, '/admin/licenses')}
        {stat('Active activations', activations.count ?? 0, '/admin/activations')}
      </div>

      <section>
        <h2 style={{ fontSize: 16, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>Recent events</h2>
        <div style={{ background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
          {(events.data ?? []).length === 0 && <div style={{ padding: '18px 22px', color: '#94a3b8', fontSize: 13 }}>No events yet.</div>}
          {(events.data ?? []).map((e: { id: string; type: string; created_at: string; data: Record<string, unknown> }) => (
            <div key={e.id} style={{ padding: '12px 22px', borderBottom: '1px solid #1f2937', fontSize: 13, display: 'flex', gap: 14 }}>
              <span style={{ color: '#a78bfa', fontWeight: 700, minWidth: 90 }}>{e.type}</span>
              <span style={{ color: '#cbd5e1', flex: 1, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{JSON.stringify(e.data)}</span>
              <span style={{ color: '#475569' }}>{new Date(e.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
