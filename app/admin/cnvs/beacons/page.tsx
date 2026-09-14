/**
 * /admin/cnvs/beacons — deployment beacons posted to POST /api/v2/beacons (DET-001).
 *
 * The columns are a best-effort projection of an unconfirmed body shape (see
 * lib/cnvs/beacons.ts), so every row also exposes the raw payload — that, not
 * the columns, is the record of what a runtime actually sent.
 */
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell, Card, StatusPill, ui } from '@/components/AdminShell';
import { db } from '@/lib/licenser/db';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface BeaconRow {
  id: string;
  received_at: string;
  deployment_id: string | null;
  project: string | null;
  environment: string | null;
  runtime: string | null;
  version: string | null;
  commit_sha: string | null;
  url: string | null;
  region: string | null;
  event: string | null;
  status: string | null;
  license_key_prefix: string | null;
  ip: string | null;
  user_agent: string | null;
  payload: unknown;
}

export default async function BeaconsPage(props: {
  searchParams: Promise<{ env?: string; project?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();

  let query = db()
    .from('cnvs_beacons')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (searchParams.env) query = query.eq('environment', searchParams.env);
  if (searchParams.project) query = query.eq('project', searchParams.project);

  const { data, error } = await query;
  const rows = (data ?? []) as BeaconRow[];

  // Facets come from the page of rows we already have — cheap, and enough to
  // navigate with. A full distinct-value scan is not worth a second round trip.
  const environments = [...new Set(rows.map((r) => r.environment).filter(Boolean))] as string[];

  return (
    <AdminShell active="cnvs" email={email}>
      <h1 style={ui.h1}>Deployment beacons</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <Link href="/admin/cnvs" style={ui.btnGhost}>← CNVS pricing</Link>
        <Link href="/admin/cnvs/status" style={ui.btnGhost}>Status &amp; incidents</Link>
      </div>

      {error && (
        <Card title="Could not read beacons">
          <p style={{ color: '#fda4af', fontSize: 13, margin: 0 }}>
            {error.message} — if this says the relation does not exist, apply
            <code> supabase/migrations/20260914_cnvs_phase_a.sql</code>.
          </p>
        </Card>
      )}

      {environments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...ui.label, marginBottom: 0 }}>Environment</span>
          <Link href="/admin/cnvs/beacons" style={ui.btnGhost}>All</Link>
          {environments.map((env) => (
            <Link key={env} href={`/admin/cnvs/beacons?env=${encodeURIComponent(env)}`} style={ui.btnGhost}>{env}</Link>
          ))}
        </div>
      )}

      <Card
        title={`Latest ${rows.length} beacon${rows.length === 1 ? '' : 's'}`}
        subtitle="POST /api/v2/beacons — public, no auth, rate limited per IP. License keys are reduced to their 8-character prefix before storage."
      >
        {rows.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            No beacons received yet. Once a CNVS runtime posts to <code>/api/v2/beacons</code> it appears here.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((b) => (
              <details key={b.id} style={{ background: '#0a0a0f', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#cbd5e1', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{new Date(b.received_at).toLocaleString()}</span>
                  {b.environment && <StatusPill status={b.environment === 'production' ? 'active' : 'info'} />}
                  {b.project && <strong style={{ color: '#f1f5f9' }}>{b.project}</strong>}
                  {b.version && <code style={{ color: '#a78bfa' }}>{b.version}</code>}
                  {b.commit_sha && <code style={{ color: '#64748b' }}>{b.commit_sha.slice(0, 7)}</code>}
                  {b.event && <span style={{ color: '#94a3b8' }}>{b.event}</span>}
                  {b.url && <span style={{ color: '#64748b' }}>{b.url}</span>}
                </summary>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 12, fontSize: 12, color: '#cbd5e1' }}>
                  <div><span style={ui.label}>Deployment</span>{b.deployment_id ?? '—'}</div>
                  <div><span style={ui.label}>Runtime</span>{b.runtime ?? '—'}</div>
                  <div><span style={ui.label}>Region</span>{b.region ?? '—'}</div>
                  <div><span style={ui.label}>Status</span>{b.status ?? '—'}</div>
                  <div><span style={ui.label}>License</span>{b.license_key_prefix ?? '—'}</div>
                  <div><span style={ui.label}>IP</span>{b.ip ?? '—'}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <span style={ui.label}>Raw payload</span>
                  <pre style={{ ...ui.pre, maxHeight: 300 }}>{JSON.stringify(b.payload ?? {}, null, 2)}</pre>
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
