/**
 * /admin/cnvs/status — the rows behind GET /api/v2/status and
 * GET /api/v2/incidents/unresolved. Both are public and cached for 60 s, so a
 * change here shows on the CNVS status surface within a minute.
 */
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell, Card, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import {
  COMPONENT_STATUSES,
  INCIDENT_IMPACTS,
  INCIDENT_STATUSES,
  readAllIncidents,
  readComponents,
  readUnresolvedIncidents,
  rollUpStatus,
} from '@/lib/cnvs/status';
import { saveComponents, createIncident, updateIncident } from './actions';

export const dynamic = 'force-dynamic';

/** Reuse the admin pills where the names line up; fall back to a neutral chip. */
function statusChip(status: string) {
  const map: Record<string, string> = {
    operational: 'ok',
    maintenance: 'info',
    degraded: 'warn',
    partial_outage: 'warn',
    major_outage: 'error',
    investigating: 'warn',
    identified: 'warn',
    monitoring: 'info',
    resolved: 'ok',
  };
  return <StatusPill status={map[status] ?? status} />;
}

export default async function CnvsStatusPage(props: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();

  const [components, unresolved, allIncidents] = await Promise.all([
    readComponents(true),
    readUnresolvedIncidents(),
    readAllIncidents(25),
  ]);
  const headline = rollUpStatus(components.filter((c) => c.enabled), unresolved);

  return (
    <AdminShell active="cnvs" email={email}>
      <h1 style={ui.h1}>Status &amp; incidents</h1>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <Link href="/admin/cnvs" style={ui.btnGhost}>← CNVS pricing</Link>
        <Link href="/admin/cnvs/beacons" style={ui.btnGhost}>Deployment beacons</Link>
        <a href="/api/v2/status" target="_blank" rel="noreferrer" style={ui.btnGhost}>View live status</a>
        <a href="/api/v2/incidents/unresolved" target="_blank" rel="noreferrer" style={ui.btnGhost}>View open incidents</a>
      </div>

      <Card title="Headline" subtitle="The worst of the enabled component statuses and the floor implied by any open incident.">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {statusChip(headline)}
          <code style={{ color: '#cbd5e1', fontSize: 13 }}>{headline}</code>
          <span style={{ color: '#64748b', fontSize: 12 }}>
            {unresolved.length} open incident{unresolved.length === 1 ? '' : 's'}
          </span>
        </div>
      </Card>

      {components.length === 0 && (
        <Card title="No components">
          <p style={{ color: '#fda4af', fontSize: 13, margin: 0 }}>
            No rows in <code>service_components</code>. Apply
            <code> supabase/migrations/20260914_cnvs_phase_a.sql</code> to seed them.
          </p>
        </Card>
      )}

      {components.length > 0 && (
        <form action={saveComponents}>
          <Card title="Components" subtitle="Untick Enabled to hide a component from the public endpoint without deleting it.">
            <div style={{ display: 'grid', gap: 12 }}>
              {components.map((c) => (
                <div key={c.key} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(140px,1fr) minmax(160px,1.4fr) 160px 90px', alignItems: 'end', borderTop: '1px solid #1f2937', paddingTop: 12 }}>
                  <input type="hidden" name="component_key" value={c.key} />
                  <div>
                    <label style={ui.label}>{c.key}</label>
                    <input name={`name_${c.key}`} defaultValue={c.name} style={{ ...ui.inpSm, width: '100%' }} />
                  </div>
                  <div>
                    <label style={ui.label}>Description</label>
                    <input name={`description_${c.key}`} defaultValue={c.description ?? ''} style={{ ...ui.inpSm, width: '100%' }} />
                  </div>
                  <div>
                    <label style={ui.label}>Status</label>
                    <select name={`status_${c.key}`} defaultValue={c.status} style={{ ...ui.inpSm, width: '100%' }}>
                      {COMPONENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={ui.label}>Enabled</label>
                    <input name={`enabled_${c.key}`} type="checkbox" defaultChecked={c.enabled} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" style={ui.btn}>Save components</button>
            </div>
          </Card>
        </form>
      )}

      <form action={createIncident}>
        <Card title="Open an incident" subtitle="Appears on /api/v2/incidents/unresolved until its status is set to resolved.">
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={ui.label}>Title</label>
              <input name="title" required placeholder="Image generation is failing for some projects" style={{ ...ui.inp, width: '100%' }} />
            </div>
            <div>
              <label style={ui.label}>Detail</label>
              <textarea name="body" rows={3} placeholder="What is happening, and what customers should expect." style={{ ...ui.inp, width: '100%', fontFamily: 'inherit' }} />
            </div>
            <div style={ui.inlineFormGrid}>
              <div>
                <label style={ui.label}>Status</label>
                <select name="status" defaultValue="investigating" style={{ ...ui.inp, width: '100%' }}>
                  {INCIDENT_STATUSES.filter((s) => s !== 'resolved').map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={ui.label}>Impact</label>
                <select name="impact" defaultValue="minor" style={{ ...ui.inp, width: '100%' }}>
                  {INCIDENT_IMPACTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {components.length > 0 && (
              <div>
                <label style={ui.label}>Affected components</label>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {components.map((c) => (
                    <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 12 }}>
                      <input type="checkbox" name="components" value={c.key} /> {c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div><button type="submit" style={ui.btn}>Open incident</button></div>
          </div>
        </Card>
      </form>

      <Card title="Incidents" subtitle="Set status to resolved to clear an incident from the public endpoint.">
        {allIncidents.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>No incidents recorded.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {allIncidents.map((i) => (
              <details key={i.id} open={!i.resolved_at} style={{ background: '#0a0a0f', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#cbd5e1', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {statusChip(i.status)}
                  <strong style={{ color: '#f1f5f9' }}>{i.title}</strong>
                  <span style={{ color: '#64748b', fontSize: 12 }}>{new Date(i.started_at).toLocaleString()}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>impact: {i.impact}</span>
                </summary>
                <form action={updateIncident} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  <input type="hidden" name="id" value={i.id} />
                  <div>
                    <label style={ui.label}>Title</label>
                    <input name="title" defaultValue={i.title} style={{ ...ui.inpSm, width: '100%' }} />
                  </div>
                  <div>
                    <label style={ui.label}>Detail</label>
                    <textarea name="body" rows={3} defaultValue={i.body ?? ''} style={{ ...ui.inpSm, width: '100%', fontFamily: 'inherit' }} />
                  </div>
                  <div style={ui.inlineFormGrid}>
                    <div>
                      <label style={ui.label}>Status</label>
                      <select name="status" defaultValue={i.status} style={{ ...ui.inpSm, width: '100%' }}>
                        {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={ui.label}>Impact</label>
                      <select name="impact" defaultValue={i.impact} style={{ ...ui.inpSm, width: '100%' }}>
                        {INCIDENT_IMPACTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><button type="submit" style={ui.btn}>Update</button></div>
                  </div>
                  {i.components?.length > 0 && (
                    <div style={{ color: '#64748b', fontSize: 12 }}>Components: {i.components.join(', ')}</div>
                  )}
                  {i.resolved_at && (
                    <div style={{ color: '#64748b', fontSize: 12 }}>Resolved {new Date(i.resolved_at).toLocaleString()}</div>
                  )}
                </form>
              </details>
            ))}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
