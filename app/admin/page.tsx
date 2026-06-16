import Link from 'next/link';
import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, ui } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

const ENDPOINTS: Array<{ method: string; path: string; desc: string }> = [
  { method: 'POST', path: '/api/v1/activate',     desc: 'Activate a license on a site' },
  { method: 'POST', path: '/api/v1/deactivate',   desc: 'Deactivate a site (with optional feedback)' },
  { method: 'POST', path: '/api/v1/validate',     desc: 'Legacy validation (WP-SDK shape)' },
  { method: 'POST', path: '/api/v2/validate',     desc: 'CNVS-4 validation (features + tier)' },
  { method: 'POST', path: '/api/v1/check',        desc: 'Quick heartbeat / status check' },
  { method: 'POST', path: '/api/v1/feedback',     desc: 'Submit deactivation feedback' },
  { method: 'GET',  path: '/api/v1/update-check', desc: 'Plugin update probe' },
  { method: 'GET',  path: '/api/v1/update',       desc: 'Signed download URL' },
  { method: 'GET',  path: '/api/v1/health',       desc: 'Service health check' },
  { method: 'POST', path: '/api/webhooks/woocommerce', desc: 'WooCommerce inbound webhook' },
];

export default async function AdminIndex() {
  const { email } = await requireAdmin();
  const supa = db();
  const [products, plansC, licActive, licGrace, licExpired, licSuspended, actActive, releases, feedback, events] = await Promise.all([
    supa.from('products').select('*', { count: 'exact', head: true }),
    supa.from('plans').select('*', { count: 'exact', head: true }),
    supa.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supa.from('licenses').select('*', { count: 'exact', head: true }).not('grace_until', 'is', null),
    supa.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'expired'),
    supa.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'suspended'),
    supa.from('activations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supa.from('product_releases').select('*', { count: 'exact', head: true }),
    supa.from('feedback').select('*', { count: 'exact', head: true }),
    supa.from('events').select('id,type,created_at,data').order('created_at', { ascending: false }).limit(10),
  ]);

  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  const stat = (label: string, value: number | string, href?: string) => {
    const inner = (
      <>
        <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{value}</div>
      </>
    );
    const style: React.CSSProperties = { ...ui.card, display: 'block', textDecoration: 'none', color: '#f1f5f9' };
    return href ? <Link href={href} style={style}>{inner}</Link> : <div style={style}>{inner}</div>;
  };

  return (
    <AdminShell active="dashboard" email={email}>
      <h1 style={ui.h1}>Overview</h1>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 24 }}>
        {stat('Products',           products.count ?? 0,   '/admin/products')}
        {stat('Plans',              plansC.count ?? 0,     '/admin/plans')}
        {stat('Active licenses',    licActive.count ?? 0,  '/admin/licenses')}
        {stat('In grace',           licGrace.count ?? 0,   '/admin/licenses')}
        {stat('Expired',            licExpired.count ?? 0, '/admin/licenses')}
        {stat('Suspended',          licSuspended.count ?? 0, '/admin/licenses')}
        {stat('Active activations', actActive.count ?? 0,  '/admin/activations')}
        {stat('Releases',           releases.count ?? 0,   '/admin/releases')}
        {stat('Feedback',           feedback.count ?? 0,   '/admin/feedback')}
      </div>

      <Card title="API endpoints" subtitle="Base URL for the SDK and webhooks below — copy as needed.">
        <div style={{ ...ui.pre, marginBottom: 12 }}>{origin}</div>
        <div style={{ display: 'grid', gap: 0 }}>
          {ENDPOINTS.map((e) => (
            <div key={e.path} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid #1f2937', fontSize: 13 }}>
              <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 11 }}>{e.method}</span>
              <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: '#cbd5e1' }}>{e.path}</span>
              <span style={{ color: '#94a3b8' }}>{e.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Recent events">
        <div style={ui.list}>
          {(events.data ?? []).length === 0 && <div style={{ padding: '18px 22px', color: '#94a3b8', fontSize: 13 }}>No events yet.</div>}
          {(events.data ?? []).map((e: { id: string; type: string; created_at: string; data: Record<string, unknown> }) => (
            <div key={e.id} style={{ padding: '10px 22px', borderBottom: '1px solid #1f2937', fontSize: 12, display: 'flex', gap: 14 }}>
              <span style={{ color: '#a78bfa', fontWeight: 700, minWidth: 130 }}>{e.type}</span>
              <span style={{ color: '#cbd5e1', flex: 1, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{JSON.stringify(e.data)}</span>
              <span style={{ color: '#475569' }}>{new Date(e.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
