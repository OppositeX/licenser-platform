import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Drawer, FlashFromQuery, ui } from '@/components/AdminShell';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface ReleaseRow {
  id: string;
  product_id: string;
  version: string;
  download_url: string | null;
  changelog: string | null;
  release_notes: string | null;
  is_latest: boolean;
  released_at: string;
}

async function upsertRelease(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const product_id = String(formData.get('product_id') ?? '');
  const version = String(formData.get('version') ?? '').trim();
  if (!product_id || !version) redirect('/admin/releases?error=Product%20and%20version%20required');
  const row = {
    product_id,
    version,
    download_url: String(formData.get('download_url') ?? '').trim() || null,
    changelog: String(formData.get('changelog') ?? '').trim() || null,
    release_notes: String(formData.get('release_notes') ?? '').trim() || null,
    is_latest: formData.get('is_latest') === 'on',
  };
  if (row.is_latest) {
    await db().from('product_releases').update({ is_latest: false }).eq('product_id', product_id);
  }
  if (id) {
    await db().from('product_releases').update(row).eq('id', id);
  } else {
    await db().from('product_releases').insert(row);
  }
  if (row.is_latest) {
    await db().from('products').update({ version: row.version }).eq('id', product_id);
  }
  revalidatePath('/admin/releases');
  redirect(`/admin/releases?product=${product_id}&ok=Release%20saved`);
}

async function deleteRelease(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const product_id = String(formData.get('product_id') ?? '');
  if (!id) return;
  await db().from('product_releases').delete().eq('id', id);
  revalidatePath('/admin/releases');
  redirect(`/admin/releases?product=${product_id}&ok=Release%20deleted`);
}

export default async function ReleasesPage(
  props: { searchParams: Promise<{ product?: string; new?: string; edit?: string; ok?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const supa = db();
  const { data: products } = await supa.from('products').select('id,slug,name').order('name');
  const productList = (products ?? []) as Array<{ id: string; slug: string; name: string }>;
  const productId = searchParams.product ?? null;

  let releases: ReleaseRow[] = [];
  if (productId) {
    const { data } = await supa.from('product_releases').select('*').eq('product_id', productId).order('released_at', { ascending: false });
    releases = (data ?? []) as ReleaseRow[];
  }
  const editing = searchParams.edit ? releases.find((r) => r.id === searchParams.edit) : null;
  const currentProduct = productList.find((p) => p.id === productId) ?? null;
  const drawerOpen = !!productId && (!!editing || searchParams.new === '1');

  return (
    <AdminShell active="releases" email={email}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ ...ui.h1, margin: 0 }}>Releases</h1>
        {productId && <Link href={`/admin/releases?product=${productId}&new=1`} style={ui.btn}>+ Add release</Link>}
      </header>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <form method="get" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <select name="product" defaultValue={productId ?? ''} style={{ ...ui.inp, width: 'auto', minWidth: 220 }}>
          <option value="">Select product…</option>
          {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="submit" style={ui.btn}>Switch</button>
      </form>

      {!productId && <div style={{ ...ui.card, color: '#94a3b8', fontSize: 13 }}>Select a product to view and add releases.</div>}

      {productId && (
        <div style={ui.list}>
          {releases.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No releases yet. Click <Link href={`/admin/releases?product=${productId}&new=1`} style={{ color: '#a78bfa' }}>+ Add release</Link>.</div>}
          {releases.map((r) => (
            <div key={r.id} style={ui.row}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  v{r.version} {r.is_latest && <span style={{ color: '#86efac', fontSize: 11, border: '1px solid #14532d', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>latest</span>}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                  {new Date(r.released_at).toLocaleString()}
                  {r.download_url && <> · <a href={r.download_url} target="_blank" rel="noreferrer" style={{ color: '#a78bfa' }}>download</a></>}
                </div>
              </div>
              <Link href={`/admin/releases?product=${productId}&edit=${r.id}`} style={ui.btnGhost}>Edit</Link>
              <form action={deleteRelease}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="product_id" value={productId} />
                <button style={ui.btnDanger}>Delete</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={drawerOpen}
        title={editing ? `Edit release v${editing.version}` : `Add release for ${currentProduct?.name ?? ''}`}
        subtitle="Releases are normally created by the GitHub webhook; this form is for manual backfill / correction."
        closeHref={`/admin/releases?product=${productId}`}
      >
        <form action={upsertRelease} style={ui.formGrid}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <input type="hidden" name="product_id" value={productId ?? ''} />
          <div><label style={ui.label}>Version *</label><input name="version" required defaultValue={editing?.version ?? ''} placeholder="1.4.2" style={ui.inp} /></div>
          <div><label style={ui.label}>Download URL</label><input name="download_url" type="url" defaultValue={editing?.download_url ?? ''} placeholder="https://…/v1.4.2.zip" style={ui.inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={ui.label}>Release notes</label>
            <textarea name="release_notes" rows={3} defaultValue={editing?.release_notes ?? ''} style={{ ...ui.inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={ui.label}>Changelog</label>
            <textarea name="changelog" rows={6} defaultValue={editing?.changelog ?? ''} style={{ ...ui.inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 13, gridColumn: '1 / -1' }}>
            <input type="checkbox" name="is_latest" defaultChecked={editing?.is_latest ?? false} /> Mark as latest (updates product version)
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" style={ui.btn}>{editing ? 'Save release' : 'Add release'}</button>
            <Link href={`/admin/releases?product=${productId}`} style={ui.btnGhost}>Cancel</Link>
          </div>
        </form>
      </Drawer>
    </AdminShell>
  );
}
