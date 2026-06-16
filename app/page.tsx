import Link from 'next/link';
import { headers } from 'next/headers';
import { db } from '@/lib/licenser/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadStatus() {
  try {
    const supa = db();
    const [p, l, a] = await Promise.all([
      supa.from('products').select('*', { count: 'exact', head: true }),
      supa.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supa.from('activations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ]);
    return { ok: true, products: p.count ?? 0, licenses: l.count ?? 0, activations: a.count ?? 0 };
  } catch {
    return { ok: false, products: 0, licenses: 0, activations: 0 };
  }
}

export default async function Page() {
  const status = await loadStatus();
  const h = headers();
  const host = h.get('host') ?? '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '80px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 999,
          background: status.ok ? 'linear-gradient(135deg,#34d399,#10b981)' : 'linear-gradient(135deg,#f87171,#dc2626)',
          color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />
          {status.ok ? 'REST online' : 'REST offline'}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999,
          background: isLocal ? '#1e3a8a' : '#3f3f46', color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
          fontFamily: 'ui-monospace, Menlo, monospace',
        }}>{isLocal ? 'LOCAL' : 'PROD'} · {host}</div>
      </div>
      <h1 style={{ fontSize: 44, margin: '20px 0 12px', letterSpacing: '-0.02em' }}>Licenser</h1>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', margin: '28px 0' }}>
        <Stat label="Products" value={status.products} />
        <Stat label="Active licenses" value={status.licenses} />
        <Stat label="Active activations" value={status.activations} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin" style={{
          display: 'inline-block', background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff',
          padding: '12px 22px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none',
        }}>Open admin</Link>
        <Link href="/api/v1/health" style={{
          display: 'inline-block', background: 'transparent', color: '#cbd5e1', border: '1px solid #1f2937',
          padding: '12px 22px', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none',
        }}>/api/v1/health</Link>
      </div>

      <section style={{ marginTop: 56 }}>
        <h2 style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>REST surface</h2>
        <div style={{ background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, padding: 18, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, lineHeight: 1.8, color: '#cbd5e1' }}>
          <div><span style={{ color: '#86efac' }}>POST</span> /api/v1/activate</div>
          <div><span style={{ color: '#86efac' }}>POST</span> /api/v1/validate &nbsp;<span style={{ color: '#64748b' }}>(alias: /check)</span></div>
          <div><span style={{ color: '#86efac' }}>POST</span> /api/v1/deactivate</div>
          <div><span style={{ color: '#fcd34d' }}>GET</span>&nbsp; /api/v1/update-check &nbsp;<span style={{ color: '#64748b' }}>(alias: /update)</span></div>
          <div><span style={{ color: '#86efac' }}>POST</span> /api/v1/feedback</div>
          <div><span style={{ color: '#fcd34d' }}>GET</span>&nbsp; /api/v1/health</div>
          <div style={{ marginTop: 10, color: '#64748b' }}>{'—'} v2 (cnvs-licenser) {'—'}</div>
          <div><span style={{ color: '#86efac' }}>POST</span> /api/v2/validate &nbsp;<span style={{ color: '#64748b' }}>(CORS open · returns active/tier/features)</span></div>
          <div><span style={{ color: '#86efac' }}>POST</span> /api/webhooks/woocommerce &nbsp;<span style={{ color: '#64748b' }}>(HMAC-SHA256 verified)</span></div>
        </div>
      </section>

      <footer style={{ marginTop: 64, color: '#475569', fontSize: 12 }}>
        v0.3.0 · build {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'} · built by Gloo Software
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}
