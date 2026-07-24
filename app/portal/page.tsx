import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, findLicenseByKey, isLicenseActive } from '@/lib/licenser/db';

export const dynamic = 'force-dynamic';

const COOKIE = 'lic_portal_key';

const c = {
  bg: '#0a0a0f', card: '#14171f', border: '#1f2937', fg: '#f1f5f9', muted: '#94a3b8', accent: '#8b5cf6',
};
const box: React.CSSProperties = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20 };
const inp: React.CSSProperties = { background: c.bg, border: `1px solid ${c.border}`, color: c.fg, borderRadius: 8, padding: '11px 12px', fontSize: 14, width: '100%', fontFamily: 'ui-monospace, Menlo, monospace' };
const btn: React.CSSProperties = { background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: c.muted, border: `1px solid ${c.border}`, padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' };
const btnDanger: React.CSSProperties = { background: 'transparent', color: '#fda4af', border: '1px solid #7f1d1d', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' };

// --- server actions --------------------------------------------------------

async function openPortal(formData: FormData) {
  'use server';
  const key = String(formData.get('key') ?? '').trim();
  if (!key) redirect('/portal?e=1');
  (await cookies()).set(COOKIE, key, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge: 3600,
  });
  redirect('/portal');
}

async function forgetKey() {
  'use server';
  (await cookies()).delete(COOKIE);
  redirect('/portal');
}

async function deactivateSite(formData: FormData) {
  'use server';
  const key = (await cookies()).get(COOKIE)?.value ?? '';
  const activationId = String(formData.get('activation_id') ?? '');
  if (!key || !activationId) redirect('/portal');
  const license = await findLicenseByKey(key);
  if (!license) redirect('/portal');
  // Ownership check: the activation must belong to THIS license.
  const { data: act } = await db().from('activations').select('id,license_id').eq('id', activationId).maybeSingle();
  if (act && act.license_id === license.id) {
    await db().from('activations').update({ status: 'deactivated' }).eq('id', activationId);
    await db().from('events').insert({ type: 'deactivate', license_id: license.id, product_id: license.product_id, data: { via: 'portal' } });
  }
  redirect('/portal?done=1');
}

// --- page ------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: `radial-gradient(at 30% 0%, #1e1b4b 0%, ${c.bg} 55%), ${c.bg}`, color: c.fg, font: '14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '56px 20px 80px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 28 }}>Licenser <span style={{ color: c.muted, fontWeight: 500 }}>· License portal</span></div>
        {children}
      </div>
    </div>
  );
}

export default async function PortalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const key = (await cookies()).get(COOKIE)?.value ?? '';

  // Not signed in → entry form.
  if (!key) {
    return (
      <Shell>
        <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Manage your license</h1>
        <p style={{ color: c.muted, margin: '0 0 22px' }}>Enter your license key to view your sites and free up activations.</p>
        {sp.e && <p style={{ color: '#fda4af', fontSize: 13, margin: '0 0 14px' }}>Please enter a license key.</p>}
        <form action={openPortal} style={{ ...box, display: 'grid', gap: 12 }}>
          <input name="key" placeholder="LCR-XXXX-XXXX-XXXX-XXXX" style={inp} autoComplete="off" />
          <button type="submit" style={btn}>View my license</button>
        </form>
        <p style={{ color: c.muted, fontSize: 13, marginTop: 20 }}>Lost your key? <a href="/portal/recover" style={{ color: c.accent, textDecoration: 'none' }}>Email it to me</a>.</p>
      </Shell>
    );
  }

  const license = await findLicenseByKey(key);
  if (!license) {
    return (
      <Shell>
        <div style={{ ...box, borderColor: '#7f1d1d' }}>
          <p style={{ color: '#fda4af', margin: '0 0 12px' }}>We couldn&apos;t find a license for that key.</p>
          <form action={forgetKey}><button style={btnGhost}>Try another key</button></form>
        </div>
      </Shell>
    );
  }

  const [{ data: product }, planRes, { data: activations }] = await Promise.all([
    db().from('products').select('name,slug').eq('id', license.product_id).maybeSingle(),
    license.plan_id ? db().from('plans').select('name').eq('id', license.plan_id).maybeSingle() : Promise.resolve({ data: null }),
    db().from('activations').select('id,site_url,status,plugin_version,last_seen_at,activated_at').eq('license_id', license.id).order('activated_at', { ascending: false }),
  ]);
  const plan = (planRes as { data: { name: string } | null }).data;
  const acts = (activations ?? []) as Array<{ id: string; site_url: string; status: string; plugin_version: string | null; last_seen_at: string | null; activated_at: string }>;
  const activeCount = acts.filter((a) => a.status === 'active').length;
  const live = isLicenseActive(license);

  return (
    <Shell>
      {sp.done && <div style={{ background: '#0f2e1a', color: '#86efac', border: '1px solid #14532d', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 13 }}>Site deactivated — that activation slot is now free.</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, letterSpacing: '-0.02em', margin: 0 }}>{product?.name ?? 'Your license'}</h1>
        <form action={forgetKey}><button style={btnGhost}>Forget key</button></form>
      </div>

      <div style={{ ...box, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 16 }}>
          <div><div style={{ color: c.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Plan</div><div style={{ marginTop: 4 }}>{plan?.name ?? '—'}</div></div>
          <div><div style={{ color: c.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Status</div><div style={{ marginTop: 4, color: live ? '#86efac' : '#fda4af', fontWeight: 700 }}>{live ? 'Active' : license.status}</div></div>
          <div><div style={{ color: c.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Sites</div><div style={{ marginTop: 4 }}>{activeCount} / {license.max_activations}</div></div>
          <div><div style={{ color: c.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Renews</div><div style={{ marginTop: 4 }}>{license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Never'}</div></div>
        </div>
      </div>

      <h2 style={{ fontSize: 13, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px', fontWeight: 700 }}>Your sites</h2>
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {acts.length === 0 && <div style={{ padding: '18px 20px', color: c.muted, fontSize: 13 }}>No sites activated yet.</div>}
        {acts.map((a) => (
          <div key={a.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 600, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{a.site_url}</div>
              <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>
                {a.status === 'active' ? 'Active' : 'Deactivated'}
                {a.plugin_version ? ` · v${a.plugin_version}` : ''}
                {a.last_seen_at ? ` · seen ${new Date(a.last_seen_at).toLocaleDateString()}` : ''}
              </div>
            </div>
            {a.status === 'active' && (
              <form action={deactivateSite}>
                <input type="hidden" name="activation_id" value={a.id} />
                <button style={btnDanger}>Deactivate</button>
              </form>
            )}
          </div>
        ))}
      </div>

      <p style={{ color: c.muted, fontSize: 12, marginTop: 18 }}>Deactivating a site frees a slot so you can use your license somewhere else.</p>
    </Shell>
  );
}
