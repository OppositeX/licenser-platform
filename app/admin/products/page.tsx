import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell } from '@/components/AdminShell';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function createProduct(formData: FormData) {
  'use server';
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const version = String(formData.get('version') ?? '').trim() || null;
  const github_repo = String(formData.get('github_repo') ?? '').trim() || null;
  if (!slug || !name) return;
  await db().from('products').insert({ slug, name, version, github_repo });
  revalidatePath('/admin/products');
}

async function deleteProduct(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await db().from('products').delete().eq('id', id);
  revalidatePath('/admin/products');
}

const inp: React.CSSProperties = { background: '#0a0a0f', border: '1px solid #1f2937', color: '#f1f5f9', borderRadius: 8, padding: '10px 12px', fontSize: 13 };
const btn: React.CSSProperties = { background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };

export default async function ProductsPage() {
  const { email } = await requireAdmin();
  const { data: products } = await db().from('products').select('*').order('created_at', { ascending: false });

  return (
    <AdminShell active="products" email={email}>
      <h1 style={{ fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 18px' }}>Products</h1>
      <form action={createProduct} style={{ background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, padding: 18, marginBottom: 24, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <input name="slug" placeholder="slug (e.g. jepeto-wp)" required style={inp} />
        <input name="name" placeholder="Display name" required style={inp} />
        <input name="version" placeholder="version (optional)" style={inp} />
        <input name="github_repo" placeholder="OppositeX/jepeto-wp" style={inp} />
        <button type="submit" style={btn}>Add product</button>
      </form>
      <div style={{ background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' }}>
        {(products ?? []).length === 0 && <div style={{ padding: 22, color: '#94a3b8', fontSize: 13 }}>No products yet. Add your first one above.</div>}
        {(products ?? []).map((p: { id: string; slug: string; name: string; version: string | null; github_repo: string | null }) => (
          <div key={p.id} style={{ padding: '14px 22px', borderBottom: '1px solid #1f2937', display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{p.slug}{p.version ? ' · v' + p.version : ''}{p.github_repo ? ' · ' + p.github_repo : ''}</div>
            </div>
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={p.id} />
              <button style={{ background: 'transparent', color: '#fda4af', border: '1px solid #7f1d1d', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>Delete</button>
            </form>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
