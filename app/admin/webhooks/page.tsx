import Link from 'next/link';
import crypto from 'node:crypto';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, Drawer, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { OUTBOUND_EVENTS } from '@/lib/licenser/outbound';
import { mask } from '@/lib/licenser/settings';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Hook { id: string; url: string; secret: string; events: string[]; active: boolean; description: string | null; created_at: string }
interface Delivery { id: string; webhook_id: string; event: string; status: string; status_code: number | null; duration_ms: number | null; error: string | null; created_at: string }

async function createWebhook(formData: FormData) {
  'use server';
  const url = String(formData.get('url') ?? '').trim();
  if (!/^https?:\/\//.test(url)) redirect('/admin/webhooks?error=A%20valid%20https%20URL%20is%20required');
  const all = formData.get('all_events') === 'on';
  const picked = formData.getAll('events').map(String);
  const events = all || picked.length === 0 ? ['*'] : picked;
  const secret = String(formData.get('secret') ?? '').trim() || crypto.randomBytes(24).toString('hex');
  await db().from('outbound_webhooks').insert({
    url, secret, events, active: true,
    description: String(formData.get('description') ?? '').trim() || null,
  });
  revalidatePath('/admin/webhooks');
  redirect('/admin/webhooks?ok=Webhook%20created');
}

async function deleteWebhook(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (id) await db().from('outbound_webhooks').delete().eq('id', id);
  revalidatePath('/admin/webhooks');
  redirect('/admin/webhooks?ok=Webhook%20deleted');
}

async function toggleWebhook(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const active = formData.get('active') === '1';
  if (id) await db().from('outbound_webhooks').update({ active: !active }).eq('id', id);
  revalidatePath('/admin/webhooks');
  redirect('/admin/webhooks');
}

export default async function WebhooksPage(props: { searchParams: Promise<{ new?: string; ok?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const { email } = await requireAdmin();

  const [{ data: hooks }, { data: deliveries }] = await Promise.all([
    db().from('outbound_webhooks').select('*').order('created_at', { ascending: false }),
    db().from('outbound_webhook_deliveries').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  const list = (hooks ?? []) as Hook[];
  const recent = (deliveries ?? []) as Delivery[];
  const drawerOpen = sp.new === '1';

  return (
    <AdminShell active="webhooks" email={email}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ ...ui.h1, margin: 0 }}>Outbound webhooks</h1>
        <Link href="/admin/webhooks?new=1" style={ui.btn}>+ Add endpoint</Link>
      </header>
      <FlashFromQuery ok={sp.ok} error={sp.error} />

      <p style={{ color: '#94a3b8', fontSize: 13, margin: '-6px 0 18px' }}>
        We POST a JSON payload to each endpoint on license events, signed with
        <code style={{ color: '#cbd5e1' }}> X-Licenser-Signature: sha256=HMAC(body, secret)</code>. Verify it before trusting the payload.
      </p>

      <div style={ui.list}>
        {list.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No endpoints yet. Click <Link href="/admin/webhooks?new=1" style={{ color: '#a78bfa' }}>+ Add endpoint</Link>.</div>}
        {list.map((h) => (
          <div key={h.id} style={ui.row}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-all' }}>{h.url}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                {h.events.includes('*') ? 'all events' : h.events.join(', ')} · secret {mask(h.secret)}
              </div>
              {h.description && <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 4 }}>{h.description}</div>}
            </div>
            <StatusPill status={h.active ? 'active' : 'not-configured'} />
            <form action={toggleWebhook}>
              <input type="hidden" name="id" value={h.id} />
              <input type="hidden" name="active" value={h.active ? '1' : '0'} />
              <button style={ui.btnGhost}>{h.active ? 'Pause' : 'Enable'}</button>
            </form>
            <form action={deleteWebhook}>
              <input type="hidden" name="id" value={h.id} />
              <button style={ui.btnDanger}>Delete</button>
            </form>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <Card title="Recent deliveries" subtitle="Last 20 delivery attempts across all endpoints.">
          <div style={ui.list}>
            {recent.length === 0 && <div style={{ padding: '16px 22px', color: '#94a3b8', fontSize: 13 }}>No deliveries yet.</div>}
            {recent.map((d) => (
              <div key={d.id} style={{ padding: '10px 22px', borderBottom: '1px solid #1f2937', fontSize: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusPill status={d.status === 'ok' ? 'ok' : 'error'} />
                <span style={{ color: '#a78bfa', fontWeight: 700, minWidth: 150 }}>{d.event}</span>
                <span style={{ color: '#cbd5e1', flex: 1, minWidth: 120 }}>
                  {d.status_code ? `HTTP ${d.status_code}` : (d.error ?? '—')}{d.duration_ms != null ? ` · ${d.duration_ms}ms` : ''}
                </span>
                <span style={{ color: '#475569' }}>{new Date(d.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Drawer open={drawerOpen} title="Add webhook endpoint" subtitle="Signed license-lifecycle events delivered to your URL." closeHref="/admin/webhooks">
        <form action={createWebhook} style={{ display: 'grid', gap: 16 }}>
          <div><label style={ui.label}>Endpoint URL *</label><input name="url" required type="url" placeholder="https://api.yoursite.com/hooks/licenser" style={ui.inp} /></div>
          <div><label style={ui.label}>Signing secret</label><input name="secret" placeholder="leave blank to auto-generate" style={ui.inp} /></div>
          <div><label style={ui.label}>Description</label><input name="description" placeholder="What is this for?" style={ui.inp} /></div>
          <div>
            <label style={ui.label}>Events</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 13, marginBottom: 8 }}>
              <input type="checkbox" name="all_events" defaultChecked /> All events (recommended)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 6 }}>
              {OUTBOUND_EVENTS.map((e) => (
                <label key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12 }}>
                  <input type="checkbox" name="events" value={e} /> {e}
                </label>
              ))}
            </div>
            <p style={{ color: '#475569', fontSize: 11, margin: '8px 0 0' }}>If &quot;All events&quot; is checked, individual selections are ignored.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="submit" style={ui.btn}>Create endpoint</button>
            <Link href="/admin/webhooks" style={ui.btnGhost}>Cancel</Link>
          </div>
        </form>
      </Drawer>
    </AdminShell>
  );
}
