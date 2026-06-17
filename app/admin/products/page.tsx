import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Drawer, FlashFromQuery, ui } from '@/components/AdminShell';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface ProductFull {
  id: string;
  slug: string;
  name: string;
  version: string | null;
  github_repo: string | null;
  homepage: string | null;
  description: string | null;
  active: boolean;
  stripe_product_id: string | null;
  woo_product_id: string | null;
}

async function upsertProduct(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  if (!slug || !name) redirect('/admin/products?error=Slug%20and%20name%20are%20required');
  const row = {
    slug,
    name,
    version: String(formData.get('version') ?? '').trim() || null,
    github_repo: String(formData.get('github_repo') ?? '').trim() || null,
    homepage: String(formData.get('homepage') ?? '').trim() || null,
    description: String(formData.get('description') ?? '').trim() || null,
    stripe_product_id: String(formData.get('stripe_product_id') ?? '').trim() || null,
    woo_product_id: String(formData.get('woo_product_id') ?? '').trim() || null,
    active: formData.get('active') === 'on',
  };
  if (id) {
    await db().from('products').update(row).eq('id', id);
  } else {
    await db().from('products').insert(row);
  }
  revalidatePath('/admin/products');
  redirect('/admin/products?ok=Product%20saved');
}

async function deleteProduct(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await db().from('products').delete().eq('id', id);
  revalidatePath('/admin/products');
  redirect('/admin/products?ok=Product%20deleted');
}

export default async function ProductsPage(
  props: { searchParams: Promise<{ new?: string; edit?: string; ok?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const { data: products } = await db().from('products').select('*').order('created_at', { ascending: false });
  const list = (products ?? []) as ProductFull[];
  const editing = searchParams.edit ? list.find((p) => p.id === searchParams.edit) : null;
  const drawerOpen = !!editing || searchParams.new === '1';

  return (
    <AdminShell active="products" email={email}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ ...ui.h1, margin: 0 }}>Products</h1>
        <Link href="/admin/products?new=1" style={ui.btn}>+ Add product</Link>
      </header>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <div style={ui.list}>
        {list.length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No products yet. Click <Link href="/admin/products?new=1" style={{ color: '#a78bfa' }}>+ Add product</Link>.</div>}
        {list.map((p) => (
          <div key={p.id} style={ui.row}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
                {p.name}
                {!p.active && <span style={{ color: '#94a3b8', fontSize: 11, border: '1px solid #1f2937', padding: '1px 6px', borderRadius: 4 }}>inactive</span>}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {p.slug}{p.version ? ' · v' + p.version : ''}{p.github_repo ? ' · ' + p.github_repo : ''}
              </div>
              {p.description && <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 4 }}>{p.description}</div>}
            </div>
            <Link href={`/admin/products?edit=${p.id}`} style={ui.btnGhost}>Edit</Link>
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={p.id} />
              <button style={ui.btnDanger}>Delete</button>
            </form>
          </div>
        ))}
      </div>

      <Drawer
        open={drawerOpen}
        title={editing ? `Edit: ${editing.name}` : 'Add product'}
        subtitle="A product represents a plugin or app the platform licenses."
        closeHref="/admin/products"
      >
        <form action={upsertProduct} style={ui.formGrid}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div><label style={ui.label}>Slug *</label><input name="slug" required defaultValue={editing?.slug ?? ''} placeholder="cnvs-runtime" style={ui.inp} /></div>
          <div><label style={ui.label}>Name *</label><input name="name" required defaultValue={editing?.name ?? ''} placeholder="CNVS 4 Runtime" style={ui.inp} /></div>
          <div><label style={ui.label}>Current version</label><input name="version" defaultValue={editing?.version ?? ''} placeholder="1.0.0" style={ui.inp} /></div>
          <div><label style={ui.label}>GitHub repo</label><input name="github_repo" defaultValue={editing?.github_repo ?? ''} placeholder="OppositeX/cnvs-4" style={ui.inp} /></div>
          <div><label style={ui.label}>Homepage URL</label><input name="homepage" type="url" defaultValue={editing?.homepage ?? ''} placeholder="https://…" style={ui.inp} /></div>
          <div><label style={ui.label}>WooCommerce product ID</label><input name="woo_product_id" defaultValue={editing?.woo_product_id ?? ''} style={ui.inp} /></div>
          <div><label style={ui.label}>Stripe product ID</label><input name="stripe_product_id" defaultValue={editing?.stripe_product_id ?? ''} placeholder="prod_…" style={ui.inp} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 13, alignSelf: 'end', paddingBottom: 10 }}>
            <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={ui.label}>Description</label>
            <textarea name="description" defaultValue={editing?.description ?? ''} rows={4} style={{ ...ui.inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" style={ui.btn}>{editing ? 'Save changes' : 'Add product'}</button>
            <Link href="/admin/products" style={ui.btnGhost}>Cancel</Link>
          </div>
        </form>
      </Drawer>
    </AdminShell>
  );
}
