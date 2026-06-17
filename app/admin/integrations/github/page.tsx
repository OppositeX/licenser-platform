import { headers } from 'next/headers';
import Link from 'next/link';
import crypto from 'node:crypto';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { getAllSettings, mask, setManySettings, setSetting } from '@/lib/licenser/settings';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function saveCredentials(formData: FormData) {
  'use server';
  const { email } = await requireAdmin();
  const updates: { github_webhook_secret?: string; github_pat?: string } = {};
  const secret = String(formData.get('github_webhook_secret') ?? '');
  const pat = String(formData.get('github_pat') ?? '');
  if (secret) updates.github_webhook_secret = secret;
  if (pat) updates.github_pat = pat;
  if (Object.keys(updates).length === 0) redirect('/admin/integrations/github?error=Nothing%20to%20save');
  await setManySettings(updates, email);
  revalidatePath('/admin/integrations/github');
  redirect('/admin/integrations/github?ok=Credentials%20saved');
}

async function rotateSecret() {
  'use server';
  const { email } = await requireAdmin();
  const fresh = crypto.randomBytes(32).toString('hex');
  await setSetting('github_webhook_secret', fresh, email);
  revalidatePath('/admin/integrations/github');
  redirect('/admin/integrations/github?ok=Webhook%20secret%20rotated');
}

async function testPayload(formData: FormData) {
  'use server';
  const product_id = String(formData.get('product_id') ?? '');
  if (!product_id) redirect('/admin/integrations/github?error=Product%20required');
  await db().from('webhook_deliveries').insert({
    source: 'github', event: 'release',
    product_id, status: 'received', message: 'Test payload from admin UI',
    payload: { test: true, at: new Date().toISOString() },
  });
  revalidatePath('/admin/integrations/github');
  redirect('/admin/integrations/github?ok=Test%20delivery%20recorded');
}

export default async function GithubSettings(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const supa = db();
  const settings = await getAllSettings();

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('host') ?? 'localhost:3000';
  const webhookUrl = `${proto}://${host}/api/webhooks/github`;

  const [{ data: products }, { data: deliveries }, { data: releasesPerProduct }] = await Promise.all([
    supa.from('products').select('id,slug,name,github_repo,version').order('name'),
    supa.from('webhook_deliveries').select('*').eq('source', 'github').order('received_at', { ascending: false }).limit(20),
    supa.from('product_releases').select('product_id,version,released_at').order('released_at', { ascending: false }),
  ]);

  const productList = (products ?? []) as Array<{ id: string; slug: string; name: string; github_repo: string | null; version: string | null }>;
  const deliveryList = (deliveries ?? []) as Array<{ id: string; event: string | null; status: string; message: string | null; received_at: string; product_id: string | null }>;
  const latestByProduct = new Map<string, { version: string; released_at: string }>();
  for (const r of (releasesPerProduct ?? []) as Array<{ product_id: string; version: string; released_at: string }>) {
    if (!latestByProduct.has(r.product_id)) latestByProduct.set(r.product_id, r);
  }

  return (
    <AdminShell active="integrations" email={email}>
      <h1 style={ui.h1}><Link href="/admin/integrations" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Integrations</Link> · GitHub</h1>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <Card title="Webhook URL" subtitle="Configure a release webhook in your repo → Settings → Webhooks with content type application/json.">
        <div style={ui.pre}>{webhookUrl}</div>
      </Card>

      <Card title="Credentials" subtitle="The webhook secret signs inbound payloads. PAT is only needed for private repos.">
        <form action={saveCredentials} style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={ui.label}>Webhook secret</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input name="github_webhook_secret" type="password" placeholder={settings.github_webhook_secret ? `current: ${mask(settings.github_webhook_secret)}` : 'paste secret'} style={{ ...ui.inp, flex: 1 }} />
            </div>
          </div>
          <div>
            <label style={ui.label}>GitHub PAT (optional, for private repos)</label>
            <input name="github_pat" type="password" placeholder={settings.github_pat ? `current: ${mask(settings.github_pat)}` : 'ghp_…'} style={{ ...ui.inp, width: '100%' }} />
          </div>
          <div><button type="submit" style={ui.btn}>Save credentials</button></div>
        </form>
        <form action={rotateSecret} style={{ marginTop: 14 }}>
          <button type="submit" style={ui.btnWarn}>Generate new webhook secret</button>
        </form>
      </Card>

      <Card title="Mapped repos" subtitle="Products whose github_repo is set receive release webhooks.">
        <div style={ui.list}>
          {productList.filter((p) => p.github_repo).length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No products have a github_repo set.</div>}
          {productList.filter((p) => p.github_repo).map((p) => {
            const latest = latestByProduct.get(p.id);
            return (
              <div key={p.id} style={ui.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>{p.github_repo}</div>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', minWidth: 160, textAlign: 'right' }}>
                  {latest ? <>v{latest.version} · {new Date(latest.released_at).toLocaleDateString()}</> : 'no releases'}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Test payload" subtitle="Record a synthetic delivery for one of your products (useful for verifying the deliveries log shows up).">
        <form action={testPayload} style={{ display: 'flex', gap: 10 }}>
          <select name="product_id" required style={{ ...ui.inp, flex: 1 }}>
            <option value="">Product…</option>
            {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="submit" style={ui.btn}>Send test payload</button>
        </form>
      </Card>

      <Card title="Recent deliveries">
        <div style={ui.list}>
          {deliveryList.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No deliveries recorded.</div>}
          {deliveryList.map((d) => (
            <div key={d.id} style={{ ...ui.row, display: 'grid', gridTemplateColumns: '170px 100px 110px 1fr', gap: 12 }}>
              <span style={{ fontSize: 11, color: '#475569' }}>{new Date(d.received_at).toLocaleString()}</span>
              <StatusPill status={d.status} />
              <code style={{ fontSize: 11, color: '#cbd5e1' }}>{d.event ?? '—'}</code>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{d.message ?? ''}</span>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
