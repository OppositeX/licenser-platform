import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function revokeActivation(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await db().from('activations').update({ status: 'deactivated' }).eq('id', id);
  revalidatePath('/admin/activations');
}

export default async function ActivationsPage(
  props: { searchParams: Promise<{ product?: string; ok?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const supa = db();
  const { data: products } = await supa.from('products').select('id,name').order('name');
  const productList = (products ?? []) as Array<{ id: string; name: string }>;

  let q = supa.from('activations')
    .select('id,site_url,status,plugin_version,wp_version,php_version,activated_at,last_seen_at,license_id,ip,licenses(key_prefix,product_id,customer_email,products(slug,name))')
    .order('last_seen_at', { ascending: false })
    .limit(300);
  // Filter by product via a nested join — we can't .eq on a related column directly,
  // so fetch all and filter in JS when scoped. Cheap given the 300-row cap.
  const { data: rows } = await q;
  const list = (rows ?? []) as Array<any>;
  const filtered = searchParams.product ? list.filter((r) => r.licenses?.product_id === searchParams.product) : list;

  return (
    <AdminShell active="activations" email={email}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ ...ui.h1, margin: 0 }}>Activations</h1>
        <a href="/admin/export/activations.csv" style={ui.btnGhost}>Export CSV</a>
      </header>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <form method="get" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <select name="product" defaultValue={searchParams.product ?? ''} style={ui.inp}>
          <option value="">All products</option>
          {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="submit" style={ui.btn}>Filter</button>
        {searchParams.product && <Link href="/admin/activations" style={ui.btnGhost}>Clear</Link>}
      </form>

      <div style={ui.list}>
        {filtered.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No activations.</div>}
        {filtered.map((a) => (
          <div key={a.id} style={ui.row}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>{a.site_url}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {a.licenses?.products?.name ?? '?'} · {a.licenses?.key_prefix ?? '?'} · {a.licenses?.customer_email ?? 'no email'}
              </div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                v{a.plugin_version ?? '?'}{a.wp_version ? ' · wp ' + a.wp_version : ''}{a.php_version ? ' · php ' + a.php_version : ''}{a.ip ? ' · ' + a.ip : ''} · last seen {new Date(a.last_seen_at).toLocaleString()}
              </div>
            </div>
            <StatusPill status={a.status} />
            {a.status === 'active' && (
              <form action={revokeActivation}>
                <input type="hidden" name="id" value={a.id} />
                <button style={ui.btnWarn}>Deactivate</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
