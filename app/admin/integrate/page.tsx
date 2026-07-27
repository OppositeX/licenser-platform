import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, ui } from '@/components/AdminShell';
import { Generator, type GenProduct } from './Generator';

export const dynamic = 'force-dynamic';

export default async function IntegratePage() {
  const { email } = await requireAdmin();
  const supa = db();

  const [{ data: products }, { data: plans }] = await Promise.all([
    supa.from('products').select('slug,name').order('name'),
    supa.from('plans').select('slug,name,product_id,products(slug)').order('price_cents'),
  ]);

  const byProduct = new Map<string, GenProduct>();
  for (const p of (products ?? []) as Array<{ slug: string; name: string }>) {
    byProduct.set(p.slug, { slug: p.slug, name: p.name, plans: [] });
  }
  for (const pl of (plans ?? []) as Array<{ slug: string; name: string; products: { slug?: string } | null }>) {
    const pslug = pl.products?.slug;
    if (pslug && byProduct.has(pslug)) byProduct.get(pslug)!.plans.push({ slug: pl.slug, name: pl.name });
  }
  const list = [...byProduct.values()].filter((p) => p.plans.length > 0);

  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? 'licenser-platform.vercel.app'}`;

  return (
    <AdminShell active="integrate" email={email}>
      <h1 style={ui.h1}>Integration generator</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '-8px 0 22px' }}>
        Pick your stack and product — get a ready-to-paste agent prompt <em>or</em> human setup docs for wiring
        license checks into your app.
      </p>
      <Generator products={list} baseUrl={origin} />
    </AdminShell>
  );
}
