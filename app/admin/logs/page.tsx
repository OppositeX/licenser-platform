import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface LogRow {
  id: number;
  level: 'info' | 'warn' | 'error';
  channel: string;
  message: string;
  context: Record<string, unknown>;
  created_at: string;
}

async function clearLogs() {
  'use server';
  await requireAdmin();
  await db().from('logs').delete().gte('id', 0);
  revalidatePath('/admin/logs');
  redirect('/admin/logs?ok=Logs%20cleared');
}

export default async function LogsPage({ searchParams }: { searchParams: { level?: string; channel?: string; ok?: string; error?: string } }) {
  const { email } = await requireAdmin();
  const supa = db();

  let q = supa.from('logs').select('*').order('created_at', { ascending: false }).limit(500);
  if (searchParams.level && ['info', 'warn', 'error'].includes(searchParams.level)) q = q.eq('level', searchParams.level);
  if (searchParams.channel) q = q.eq('channel', searchParams.channel);
  const { data: rows } = await q;
  const list = (rows ?? []) as LogRow[];

  // Build channel set from the result so the picker is useful but cheap.
  const channels = Array.from(new Set(list.map((r) => r.channel))).sort();

  return (
    <AdminShell active="logs" email={email}>
      <h1 style={ui.h1}>Logs</h1>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <Card>
        <form method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={ui.label}>Level</label>
            <select name="level" defaultValue={searchParams.level ?? ''} style={ui.inp}>
              <option value="">Any level</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </div>
          <div>
            <label style={ui.label}>Channel</label>
            <input name="channel" defaultValue={searchParams.channel ?? ''} placeholder="e.g. woocommerce" style={ui.inp} list="channels" />
            <datalist id="channels">
              {channels.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <button type="submit" style={ui.btn}>Filter</button>
          {(searchParams.level || searchParams.channel) && <Link href="/admin/logs" style={ui.btnGhost}>Clear</Link>}
          <form action={clearLogs} style={{ marginLeft: 'auto' }}>
            <button type="submit" style={ui.btnDanger}>Clear all logs</button>
          </form>
        </form>
      </Card>

      <div style={ui.list}>
        {list.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No logs match.</div>}
        {list.map((r) => (
          <details key={r.id} style={{ borderBottom: '1px solid #1f2937' }}>
            <summary style={{ padding: '12px 22px', display: 'grid', gridTemplateColumns: '170px 80px 130px 1fr', gap: 12, cursor: 'pointer', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#475569' }}>{new Date(r.created_at).toLocaleString()}</span>
              <StatusPill status={r.level} />
              <code style={{ fontSize: 11, color: '#a78bfa' }}>{r.channel}</code>
              <span style={{ fontSize: 13, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.message}</span>
            </summary>
            {Object.keys(r.context ?? {}).length > 0 && (
              <pre style={{ ...ui.pre, margin: '0 22px 14px' }}>{JSON.stringify(r.context, null, 2)}</pre>
            )}
          </details>
        ))}
      </div>
    </AdminShell>
  );
}
