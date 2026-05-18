import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, StatusPill } from '@/components/AdminShell';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function revokeActivation(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await db().from('activations').update({ status: 'deactivated' }).eq('id', id);
  revalidatePath('/admin/activations');
}

export default async function ActivationsPage() {
  const { email } = await requireAdmin();
  const { data: rows } = await db()
    .from('activations')
    .select('id,site_url,status,plugin_version,activated_at,last_seen_at,license_id,ip,licenses(key_prefix,product_id,products(slug,name))')
    .order('last_seen_at', { ascending: false })
    .limit(200);

  return (
    <AdminShell active="activations" email={email}>
      <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 18px' }}>Activations</h1>
      <div style={{ background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
        {(rows ?? []).length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No activations yet.</div>}
        {(rows ?? []).map((a: any) => (
          <div key={a.id} style={{ padding: '14px 22px', borderBottom: '1px solid #1f2937', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>{a.site_url}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {a.licenses?.products?.name ?? '?'} · {a.licenses?.key_prefix ?? '?'} · v{a.plugin_version ?? '?'} {a.ip ? '· ' + a.ip : ''}
              </div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                last seen {new Date(a.last_seen_at).toLocaleString()} · since {new Date(a.activated_at).toLocaleDateString()}
              </div>
            </div>
            <StatusPill status={a.status} />
            {a.status === 'active' && (
              <form action={revokeActivation}>
                <input type="hidden" name="id" value={a.id} />
                <button style={{ background: 'transparent', color: '#fcd34d', border: '1px solid #78350f', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>Revoke</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
