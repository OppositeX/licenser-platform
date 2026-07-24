import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, ui } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

/** Count occurrences of a field across rows, bucketing null/empty as "unknown". */
function tally(rows: Array<Record<string, unknown>>, field: string): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const raw = r[field];
    const key = raw === null || raw === undefined || raw === '' ? 'unknown' : String(raw);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

const RESULT_COLORS: Record<string, string> = {
  valid: '#22c55e',
  expired: '#f59e0b',
  revoked: '#f43f5e',
  suspended: '#f59e0b',
  unknown_key: '#94a3b8',
  domain_not_authorized: '#a78bfa',
  product_mismatch: '#60a5fa',
  rate_limited: '#64748b',
};

function Bars({ items, total, accent }: { items: Array<{ label: string; count: number }>; total: number; accent?: (label: string) => string }) {
  if (items.length === 0) return <div style={{ color: '#94a3b8', fontSize: 13, padding: '4px 0' }}>No data in this window.</div>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((it) => {
        const pct = total > 0 ? Math.round((it.count / total) * 100) : 0;
        return (
          <div key={it.label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 82px', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#cbd5e1', fontFamily: 'ui-monospace, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            <div style={{ background: '#0a0a0f', border: '1px solid #1f2937', borderRadius: 6, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(2, Math.round((it.count / max) * 100))}%`, height: '100%', background: accent ? accent(it.label) : 'linear-gradient(135deg,#a78bfa,#8b5cf6)' }} />
            </div>
            <span style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>{it.count} · {pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ ...ui.card }}>
      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const { email } = await requireAdmin();
  const supa = db();

  const now = Date.now();
  const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const since24h = new Date(now - 86_400_000).toISOString();
  const since7d = new Date(now - 7 * 86_400_000).toISOString();

  const [
    activeInstalls, seen24h, seen7d,
    installRows, validationRows, feedbackRows, issuedCount,
  ] = await Promise.all([
    supa.from('activations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supa.from('activations').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('last_seen_at', since24h),
    supa.from('activations').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('last_seen_at', since7d),
    supa.from('activations').select('plugin_version,wp_version,php_version').eq('status', 'active').limit(5000),
    supa.from('validation_log').select('result,ts').gte('ts', since).limit(20000),
    supa.from('feedback').select('reason,created_at').gte('created_at', since).limit(5000),
    supa.from('licenses').select('*', { count: 'exact', head: true }).gte('created_at', since),
  ]);

  const installs = (installRows.data ?? []) as Array<Record<string, unknown>>;
  const validations = (validationRows.data ?? []) as Array<Record<string, unknown>>;
  const feedback = (feedbackRows.data ?? []) as Array<Record<string, unknown>>;

  const pluginVersions = tally(installs, 'plugin_version');
  const wpVersions = tally(installs, 'wp_version');
  const phpVersions = tally(installs, 'php_version');
  const resultMix = tally(validations, 'result');
  const reasons = tally(feedback, 'reason');

  const validTotal = validations.length;
  const validOk = validations.filter((v) => v.result === 'valid').length;
  const validRate = validTotal > 0 ? Math.round((validOk / validTotal) * 100) : 0;

  return (
    <AdminShell active="analytics" email={email}>
      <h1 style={ui.h1}>Analytics</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '-8px 0 22px' }}>Install base and last {WINDOW_DAYS} days of activity.</p>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 24 }}>
        <Stat label="Active installs" value={activeInstalls.count ?? 0} />
        <Stat label="Seen · 24h" value={seen24h.count ?? 0} />
        <Stat label="Seen · 7d" value={seen7d.count ?? 0} />
        <Stat label={`Validations · ${WINDOW_DAYS}d`} value={validTotal} />
        <Stat label="Valid rate" value={`${validRate}%`} />
        <Stat label={`Issued · ${WINDOW_DAYS}d`} value={issuedCount.count ?? 0} />
        <Stat label={`Deactivations · ${WINDOW_DAYS}d`} value={feedback.length} />
      </div>

      <Card title={`Validation results · last ${WINDOW_DAYS} days`} subtitle="Outcome mix across /validate, /check and /v2/validate calls.">
        <Bars items={resultMix} total={validTotal} accent={(l) => RESULT_COLORS[l] ?? '#64748b'} />
      </Card>

      <Card title="Plugin version adoption" subtitle="Share of active installs by reported plugin version.">
        <Bars items={pluginVersions} total={installs.length} />
      </Card>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card title="WordPress versions">
          <Bars items={wpVersions} total={installs.length} />
        </Card>
        <Card title="PHP versions">
          <Bars items={phpVersions} total={installs.length} />
        </Card>
      </div>

      <Card title={`Deactivation reasons · last ${WINDOW_DAYS} days`} subtitle="Why customers deactivated, from the SDK feedback form.">
        <Bars items={reasons} total={feedback.length} accent={() => '#f43f5e'} />
      </Card>
    </AdminShell>
  );
}
