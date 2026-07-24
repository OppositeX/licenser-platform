import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Drawer, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { generateLicenseKey } from '@/lib/licenser/issuance';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['active', 'suspended', 'revoked', 'expired'] as const;
type Status = typeof VALID_STATUSES[number];

interface LicenseFull {
  id: string;
  product_id: string;
  plan_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  key: string;
  key_prefix: string;
  status: Status;
  max_activations: number;
  expires_at: string | null;
  grace_until: string | null;
  woo_order_id: string | null;
  woo_subscription_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

async function issueLicense(formData: FormData) {
  'use server';
  const product_id = String(formData.get('product_id') ?? '');
  const plan_id = String(formData.get('plan_id') ?? '') || null;
  const customer_email = String(formData.get('customer_email') ?? '').trim().toLowerCase() || null;
  const customer_name = String(formData.get('customer_name') ?? '').trim() || null;
  const max_activations = Math.max(1, parseInt(String(formData.get('max_activations') ?? '1'), 10) || 1);
  const expires_at = String(formData.get('expires_at') ?? '').trim() || null;
  if (!product_id) redirect('/admin/licenses?error=Product%20required');
  await db().from('licenses').insert({
    product_id, plan_id, customer_email, customer_name, max_activations, expires_at,
    key: generateLicenseKey('LIC'),
  });
  revalidatePath('/admin/licenses');
  redirect('/admin/licenses?ok=License%20issued');
}

async function setLicenseStatus(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !VALID_STATUSES.includes(status as Status)) return;
  await db().from('licenses').update({ status }).eq('id', id);
  revalidatePath('/admin/licenses');
}

async function rotateKey(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await db().from('licenses').update({ key: generateLicenseKey('LIC') }).eq('id', id);
  revalidatePath('/admin/licenses');
  redirect(`/admin/licenses?reveal=${id}&ok=Key%20rotated`);
}

async function applyOverride(formData: FormData) {
  'use server';
  const { email: adminEmail } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const preset = String(formData.get('preset') ?? 'custom');
  let status = String(formData.get('status') ?? '');
  let expires_at: string | null = String(formData.get('expires_at') ?? '').trim() || null;
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!id) return;

  if (preset === 'paid_year') { status = 'active'; expires_at = new Date(Date.now() + 365 * 86400_000).toISOString(); }
  else if (preset === 'lifetime') { status = 'active'; expires_at = null; }
  else if (preset === 'complimentary_year') { status = 'active'; expires_at = new Date(Date.now() + 365 * 86400_000).toISOString(); }
  else if (preset === 'revoke') { status = 'revoked'; }

  const update: Record<string, unknown> = {};
  if (status && VALID_STATUSES.includes(status as Status)) update.status = status;
  if (expires_at !== '') update.expires_at = expires_at;

  if (Object.keys(update).length > 0) {
    await db().from('licenses').update(update).eq('id', id);
  }
  await db().from('license_overrides').insert({
    license_id: id,
    admin_email: adminEmail,
    preset,
    status: (update.status as string) ?? null,
    expires_at: (update.expires_at as string) ?? null,
    reason,
  });
  revalidatePath('/admin/licenses');
  redirect('/admin/licenses?ok=Override%20applied');
}

function formatExpiry(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleDateString();
}

function isoLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function LicensesPage(
  props: { searchParams: Promise<{ product?: string; status?: string; reveal?: string; ok?: string; error?: string; override?: string; new?: string }> }
) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const supa = db();
  const [{ data: products }, { data: plans }] = await Promise.all([
    supa.from('products').select('id,slug,name').order('name'),
    supa.from('plans').select('id,product_id,slug,name').order('name'),
  ]);

  let q = supa.from('licenses').select('*').order('created_at', { ascending: false }).limit(300);
  if (searchParams.product) q = q.eq('product_id', searchParams.product);
  if (searchParams.status && VALID_STATUSES.includes(searchParams.status as Status)) q = q.eq('status', searchParams.status);
  const { data: licenses } = await q;
  const list = (licenses ?? []) as LicenseFull[];

  const productList = (products ?? []) as Array<{ id: string; slug: string; name: string }>;
  const planList = (plans ?? []) as Array<{ id: string; product_id: string; slug: string; name: string }>;
  const revealId = searchParams.reveal ?? null;
  const overrideId = searchParams.override ?? null;
  const overrideLicense = overrideId ? list.find((l) => l.id === overrideId) : null;

  const baseParams = new URLSearchParams();
  if (searchParams.product) baseParams.set('product', searchParams.product);
  if (searchParams.status) baseParams.set('status', searchParams.status);
  const baseQs = baseParams.toString();
  const closeHref = '/admin/licenses' + (baseQs ? '?' + baseQs : '');

  const tab = (label: string, value: string | null) => {
    const active = (searchParams.status ?? '') === (value ?? '');
    const params = new URLSearchParams();
    if (searchParams.product) params.set('product', searchParams.product);
    if (value) params.set('status', value);
    const href = '/admin/licenses' + (params.toString() ? '?' + params.toString() : '');
    return (
      <Link key={label} href={href} style={{
        ...ui.btnGhost,
        background: active ? '#1f2937' : 'transparent',
        color: active ? '#f1f5f9' : '#94a3b8',
        fontWeight: active ? 700 : 500,
      }}>{label}</Link>
    );
  };

  return (
    <AdminShell active="licenses" email={email}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ ...ui.h1, margin: 0 }}>Licenses</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/admin/export/licenses.csv" style={ui.btnGhost}>Export CSV</a>
          <Link href={`/admin/licenses?new=1${baseQs ? '&' + baseQs : ''}`} style={ui.btn}>+ Issue license</Link>
        </div>
      </header>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <form method="get" style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <select name="product" defaultValue={searchParams.product ?? ''} style={{ ...ui.inp, width: 'auto', minWidth: 200 }}>
          <option value="">All products</option>
          {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        <button type="submit" style={ui.btn}>Filter</button>
        {(searchParams.product || searchParams.status) && <Link href="/admin/licenses" style={ui.btnGhost}>Clear</Link>}
      </form>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {tab('All', null)}
        {tab('Active', 'active')}
        {tab('Suspended', 'suspended')}
        {tab('Revoked', 'revoked')}
        {tab('Expired', 'expired')}
      </div>

      <div style={ui.list}>
        {list.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No licenses found.</div>}
        {list.map((l) => (
          <div key={l.id} style={{ borderBottom: '1px solid #1f2937', padding: '14px 22px' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: '#f1f5f9' }}>
                  {revealId === l.id ? l.key : l.key_prefix + '••••••••••••••••••'}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                  {l.customer_email ?? 'no email'}{l.customer_name ? ` · ${l.customer_name}` : ''} · {l.max_activations} seats · exp {formatExpiry(l.expires_at)}
                </div>
                {(l.woo_order_id || l.woo_subscription_id || l.stripe_subscription_id) && (
                  <div style={{ color: '#475569', fontSize: 11, marginTop: 2, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {l.woo_order_id ? `woo-order:${l.woo_order_id}` : ''}
                    {l.woo_subscription_id ? ` woo-sub:${l.woo_subscription_id}` : ''}
                    {l.stripe_subscription_id ? ` stripe:${l.stripe_subscription_id}` : ''}
                  </div>
                )}
              </div>
              <StatusPill status={l.status} />
              <Link href={`/admin/licenses?reveal=${l.id}${baseQs ? '&' + baseQs : ''}`} style={ui.btnGhost}>{revealId === l.id ? 'Hide' : 'Reveal'}</Link>
              <form action={rotateKey}>
                <input type="hidden" name="id" value={l.id} />
                <button style={ui.btnWarn}>Rotate</button>
              </form>
              <form action={setLicenseStatus} style={{ display: 'flex', gap: 4 }}>
                <input type="hidden" name="id" value={l.id} />
                <select name="status" defaultValue={l.status} style={ui.inpSm}>
                  {VALID_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button style={ui.btnGhost}>Save</button>
              </form>
              <Link href={`/admin/licenses?override=${l.id}${baseQs ? '&' + baseQs : ''}`} style={ui.btnGhost}>Override</Link>
            </div>
          </div>
        ))}
      </div>

      <Drawer
        open={searchParams.new === '1'}
        title="Issue new license"
        subtitle="Generates a fresh key (LIC-…) and stores it active by default."
        closeHref={closeHref}
      >
        <form action={issueLicense} style={ui.formGrid}>
          <div style={{ gridColumn: '1 / -1' }}><label style={ui.label}>Product *</label>
            <select name="product_id" required style={ui.inp}>
              <option value="">Product…</option>
              {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label style={ui.label}>Plan</label>
            <select name="plan_id" style={ui.inp}>
              <option value="">No plan</option>
              {planList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label style={ui.label}>Max activations</label><input name="max_activations" type="number" min="1" defaultValue="1" style={ui.inp} /></div>
          <div><label style={ui.label}>Customer email</label><input name="customer_email" type="email" placeholder="customer@example.com" style={ui.inp} /></div>
          <div><label style={ui.label}>Customer name</label><input name="customer_name" placeholder="Jane Doe" style={ui.inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={ui.label}>Expires at</label><input name="expires_at" type="datetime-local" style={ui.inp} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" style={ui.btn}>Issue license</button>
            <Link href={closeHref} style={ui.btnGhost}>Cancel</Link>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={!!overrideLicense}
        title={overrideLicense ? `Override ${overrideLicense.key_prefix}••••` : 'Override'}
        subtitle="Apply a preset or set custom status/expiry. Logged to the override audit trail."
        closeHref={closeHref}
      >
        {overrideLicense && (
          <form action={applyOverride} style={ui.formGrid}>
            <input type="hidden" name="id" value={overrideLicense.id} />
            <div><label style={ui.label}>Preset</label>
              <select name="preset" defaultValue="custom" style={ui.inp}>
                <option value="custom">Custom</option>
                <option value="paid_year">Manually paid (1 year)</option>
                <option value="lifetime">Lifetime</option>
                <option value="complimentary_year">Complimentary (1 year)</option>
                <option value="revoke">Revoke</option>
              </select>
            </div>
            <div><label style={ui.label}>Status</label>
              <select name="status" defaultValue="" style={ui.inp}>
                <option value="">Keep current</option>
                {VALID_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><label style={ui.label}>Expires at</label>
              <input name="expires_at" type="datetime-local" defaultValue={isoLocal(overrideLicense.expires_at)} style={ui.inp} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={ui.label}>Reason / note</label>
              <input name="reason" maxLength={190} placeholder="e.g. paid via wire #12345" style={ui.inp} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="submit" style={ui.btn}>Apply override</button>
              <Link href={closeHref} style={ui.btnGhost}>Cancel</Link>
            </div>
          </form>
        )}
      </Drawer>
    </AdminShell>
  );
}
