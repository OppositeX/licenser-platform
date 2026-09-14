/**
 * /admin/cnvs — the editor behind GET /api/v2/cnvs/settings.
 *
 * This page is the reason the endpoint is worth having: Omri changes a price
 * here and CNVS picks it up within its five-minute cache window, with no CNVS
 * code deploy. Every save is validated against the cnvs-4 contract before it
 * is stored and recorded in settings_audit.
 */
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell, Card, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { readCnvsAudit, readCnvsSettings } from '@/lib/cnvs/store';
import { CNVS_ACTIONS, MAX_ACTION_CREDITS } from '@/lib/cnvs/settings';
import { savePlans, saveRateCard, savePacks, saveLimits, resetSection } from './actions';

export const dynamic = 'force-dynamic';

const numInput: React.CSSProperties = { ...ui.inp, width: '100%' };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label style={ui.label}>{label}</label>
      {children}
      {hint && <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ResetButton({ section }: { section: string }) {
  return (
    <form action={resetSection} style={{ display: 'inline' }}>
      <input type="hidden" name="section" value={section} />
      <button type="submit" style={ui.btnWarn}>Reset to defaults</button>
    </form>
  );
}

export default async function CnvsSettingsPage(props: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const [snapshot, audit] = await Promise.all([readCnvsSettings(), readCnvsAudit(15)]);
  const s = snapshot.settings;

  const sourceLabel = snapshot.source === 'store'
    ? 'settings store'
    : snapshot.source === 'defaults'
      ? 'defaults (no cnvs.* rows stored yet — run the 20260914 migration)'
      : 'compiled fallback (the settings store could not be read)';

  return (
    <AdminShell active="cnvs" email={email}>
      <h1 style={ui.h1}>CNVS pricing</h1>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <Link href="/admin/cnvs/beacons" style={ui.btnGhost}>Deployment beacons</Link>
        <Link href="/admin/cnvs/status" style={ui.btnGhost}>Status &amp; incidents</Link>
        <a href="/api/v2/cnvs/settings" target="_blank" rel="noreferrer" style={ui.btnGhost}>View live payload</a>
      </div>

      <Card
        title="How this reaches CNVS"
        subtitle="cnvs-4 polls GET /api/v2/cnvs/settings every five minutes and caches it for 300 s. A save here is live in the product within that window — no CNVS deploy."
      >
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: '#cbd5e1' }}>
          <div><span style={ui.label}>Serving from</span>{sourceLabel}</div>
          <div><span style={ui.label}>Last change</span>{snapshot.updated_at ? new Date(snapshot.updated_at).toLocaleString() : '—'}</div>
        </div>
        {snapshot.degraded.length > 0 && (
          <div style={{ marginTop: 14, background: '#3b0f1a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', color: '#fda4af', fontSize: 12 }}>
            <strong>Stored rows failing validation — serving defaults for these sections.</strong>
            <ul style={{ margin: '8px 0 0 18px' }}>
              {snapshot.degraded.map((d) => (
                <li key={d.section}><code>{d.section}</code>: {d.errors.join('; ')}</li>
              ))}
            </ul>
          </div>
        )}
        <p style={{ color: '#64748b', fontSize: 12, margin: '14px 0 0' }}>
          A save that breaks the contract is rejected here rather than stored. cnvs-4 discards the
          <em> entire </em> payload over a single bad value and silently falls back to its own prices,
          so a bad row would look healthy from this side and change nothing in the product.
        </p>
      </Card>

      {/* ---------------- Plans + credits ---------------- */}
      <form action={savePlans}>
        <Card title="Plans & credits" subtitle="Seat pricing in USD, and the credit allowance each seat carries.">
          <div style={{ ...ui.formGrid, marginBottom: 18 }}>
            <Field label="Pro — monthly USD/seat"><input name="pro_monthlyUsd" type="number" step="0.01" min="0.01" defaultValue={s.plans.pro.monthlyUsd} style={numInput} /></Field>
            <Field label="Pro — annual USD/seat/mo"><input name="pro_annualUsd" type="number" step="0.01" min="0.01" defaultValue={s.plans.pro.annualUsd} style={numInput} /></Field>
            <Field label="Pro — minimum seats"><input name="pro_minSeats" type="number" step="1" min="0" defaultValue={s.plans.pro.minSeats} style={numInput} /></Field>
          </div>
          <div style={{ ...ui.formGrid, marginBottom: 18 }}>
            <Field label="Studio — monthly USD/seat"><input name="studio_monthlyUsd" type="number" step="0.01" min="0.01" defaultValue={s.plans.studio.monthlyUsd} style={numInput} /></Field>
            <Field label="Studio — annual USD/seat/mo"><input name="studio_annualUsd" type="number" step="0.01" min="0.01" defaultValue={s.plans.studio.annualUsd} style={numInput} /></Field>
            <Field label="Studio — minimum seats"><input name="studio_minSeats" type="number" step="1" min="0" defaultValue={s.plans.studio.minSeats} style={numInput} /></Field>
          </div>
          <div style={ui.formGrid}>
            <Field label="Credits per Pro seat"><input name="perSeat_pro" type="number" step="1" min="0" defaultValue={s.credits.perSeat.pro} style={numInput} /></Field>
            <Field label="Credits per Studio seat"><input name="perSeat_studio" type="number" step="1" min="0" defaultValue={s.credits.perSeat.studio} style={numInput} /></Field>
            <Field label="Free credits per day"><input name="freeDaily" type="number" step="1" min="0" defaultValue={s.credits.freeDaily} style={numInput} /></Field>
            <Field label="Rollover months"><input name="rolloverMonths" type="number" step="1" min="0" defaultValue={s.credits.rolloverMonths} style={numInput} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="submit" style={ui.btn}>Save plans &amp; credits</button>
          </div>
        </Card>
      </form>
      <div style={{ display: 'flex', gap: 10, margin: '-8px 0 18px' }}>
        <ResetButton section="plans" />
        <ResetButton section="credits" />
      </div>

      {/* ---------------- Rate card ---------------- */}
      <form action={saveRateCard}>
        <Card
          title="Rate card"
          subtitle={`What each generation costs, in credits (1 credit = 1 cent). All twelve actions must be priced — cnvs-4 rejects a partial card. Ceiling: ${MAX_ACTION_CREDITS.toLocaleString()} credits per action.`}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
              <thead>
                <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Action</th>
                  <th style={{ padding: '6px 8px' }}>Label</th>
                  <th style={{ padding: '6px 8px' }}>Route</th>
                  <th style={{ padding: '6px 8px', width: 110 }}>Credits</th>
                  <th style={{ padding: '6px 8px', width: 130 }}>Paid credits</th>
                </tr>
              </thead>
              <tbody>
                {CNVS_ACTIONS.map((action) => {
                  const row = s.rateCard.find((r) => r.action === action)!;
                  return (
                    <tr key={action} style={{ borderTop: '1px solid #1f2937' }}>
                      <td style={{ padding: '8px', fontFamily: 'ui-monospace, Menlo, monospace', color: '#cbd5e1', whiteSpace: 'nowrap' }}>{action}</td>
                      <td style={{ padding: '8px' }}><input name={`rate_${action}_label`} defaultValue={row.label} style={{ ...ui.inpSm, width: '100%' }} /></td>
                      <td style={{ padding: '8px' }}><input name={`rate_${action}_route`} defaultValue={row.route} style={{ ...ui.inpSm, width: '100%' }} /></td>
                      <td style={{ padding: '8px' }}><input name={`rate_${action}_credits`} type="number" step="1" min="0" max={MAX_ACTION_CREDITS} defaultValue={row.credits} style={{ ...ui.inpSm, width: '100%' }} /></td>
                      <td style={{ padding: '8px' }}>
                        <input
                          name={`rate_${action}_paid`}
                          type="number" step="1" min="0" max={MAX_ACTION_CREDITS}
                          defaultValue={row.paidCredits ?? ''}
                          placeholder="—"
                          style={{ ...ui.inpSm, width: '100%' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#64748b', fontSize: 11, margin: '12px 0 0' }}>
            Leave “Paid credits” empty to omit the field entirely. When set it must be a whole number ≥ 0 —
            it is what a paid seat is charged, where that differs from the free-tier cost.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" style={ui.btn}>Save rate card</button>
          </div>
        </Card>
      </form>
      <div style={{ display: 'flex', gap: 10, margin: '-8px 0 18px' }}>
        <ResetButton section="rateCard" />
      </div>

      {/* ---------------- Credit packs ---------------- */}
      <form action={savePacks}>
        <Card title="Credit packs" subtitle="One-off and recurring credit bundles. Tick Remove to drop a pack; fill the blank row to add one.">
          <input type="hidden" name="pack_count" value={s.packs.length + 1} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 620 }}>
              <thead>
                <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>SKU</th>
                  <th style={{ padding: '6px 8px', width: 130 }}>Credits</th>
                  <th style={{ padding: '6px 8px', width: 120 }}>USD</th>
                  <th style={{ padding: '6px 8px', width: 100 }}>Recurring</th>
                  <th style={{ padding: '6px 8px', width: 90 }}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {[...s.packs, null].map((pack, i) => (
                  <tr key={pack?.sku ?? `new-${i}`} style={{ borderTop: '1px solid #1f2937' }}>
                    <td style={{ padding: '8px' }}><input name={`pack_${i}_sku`} defaultValue={pack?.sku ?? ''} placeholder={pack ? '' : 'cnvs-credits-…'} style={{ ...ui.inpSm, width: '100%' }} /></td>
                    <td style={{ padding: '8px' }}><input name={`pack_${i}_credits`} type="number" step="1" min="1" defaultValue={pack?.credits ?? ''} style={{ ...ui.inpSm, width: '100%' }} /></td>
                    <td style={{ padding: '8px' }}><input name={`pack_${i}_usd`} type="number" step="0.01" min="0.01" defaultValue={pack?.usd ?? ''} style={{ ...ui.inpSm, width: '100%' }} /></td>
                    <td style={{ padding: '8px', textAlign: 'center' }}><input name={`pack_${i}_recurring`} type="checkbox" defaultChecked={pack?.recurring ?? false} /></td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{pack ? <input name={`pack_${i}_remove`} type="checkbox" /> : <span style={{ color: '#475569' }}>new</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" style={ui.btn}>Save packs</button>
          </div>
        </Card>
      </form>
      <div style={{ display: 'flex', gap: 10, margin: '-8px 0 18px' }}>
        <ResetButton section="packs" />
      </div>

      {/* ---------------- Limits ---------------- */}
      <form action={saveLimits}>
        <Card title="Dev keys, grace & fair use" subtitle="Everything that bounds usage rather than prices it.">
          <div style={{ ...ui.formGrid, marginBottom: 18 }}>
            <Field label="Dev key lifetime (days)"><input name="dev_lifetimeDays" type="number" step="1" min="0" defaultValue={s.dev.lifetimeDays} style={numInput} /></Field>
            <Field label="Dev boots per day"><input name="dev_bootsPerDay" type="number" step="1" min="0" defaultValue={s.dev.bootsPerDay} style={numInput} /></Field>
            <Field label="Dev IPs per day"><input name="dev_ipsPerDay" type="number" step="1" min="0" defaultValue={s.dev.ipsPerDay} style={numInput} /></Field>
          </div>
          <div style={ui.formGrid}>
            <Field label="Grace period (days)" hint="After a subscription lapses."><input name="graceDays" type="number" step="1" min="0" defaultValue={s.graceDays} style={numInput} /></Field>
            <Field label="Fair use — fast edits/day"><input name="fastEditsPerDay" type="number" step="1" min="0" defaultValue={s.fairUse.fastEditsPerDay} style={numInput} /></Field>
            <Field label="Entitlement TTL (hours)" hint="How long a production entitlement stays valid."><input name="prodTtlHours" type="number" step="1" min="0" defaultValue={s.entitlement.prodTtlHours} style={numInput} /></Field>
            <Field label="Entitlement grace (hours)"><input name="graceHours" type="number" step="1" min="0" defaultValue={s.entitlement.graceHours} style={numInput} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="submit" style={ui.btn}>Save limits</button>
          </div>
        </Card>
      </form>
      <div style={{ display: 'flex', gap: 10, margin: '-8px 0 18px', flexWrap: 'wrap' }}>
        <ResetButton section="dev" />
        <ResetButton section="graceDays" />
        <ResetButton section="fairUse" />
        <ResetButton section="entitlement" />
      </div>

      {/* ---------------- Audit ---------------- */}
      <Card title="Change history" subtitle="Every pricing change, with who made it and what it replaced.">
        {audit.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>No changes recorded yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {audit.map((a) => (
              <details key={a.id} style={{ background: '#0a0a0f', border: '1px solid #1f2937', borderRadius: 8, padding: '10px 14px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#cbd5e1', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusPill status="info" />
                  <code style={{ color: '#a78bfa' }}>{a.key}</code>
                  <span style={{ color: '#94a3b8' }}>{a.changed_by ?? 'unknown'}</span>
                  <span style={{ color: '#64748b' }}>{new Date(a.changed_at).toLocaleString()}</span>
                </summary>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 12 }}>
                  <div>
                    <span style={ui.label}>Before</span>
                    <pre style={{ ...ui.pre, maxHeight: 220 }}>{JSON.stringify(a.old_value ?? null, null, 2)}</pre>
                  </div>
                  <div>
                    <span style={ui.label}>After</span>
                    <pre style={{ ...ui.pre, maxHeight: 220 }}>{JSON.stringify(a.new_value ?? null, null, 2)}</pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
