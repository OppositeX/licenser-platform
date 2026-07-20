// /api/v1/update — new shape requested in LIC-204.
// query: ?product_slug=...&version=...&license_key=...
import { NextResponse } from 'next/server';
import { db, findLicenseByKey, findProductBySlug, isLicenseActive } from '@/lib/licenser/db';
import { issue as issueToken } from '@/lib/licenser/signer';
import { errorResponse } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const productSlug = u.searchParams.get('product_slug') ?? '';
  const current     = u.searchParams.get('version') ?? '';
  const licenseKey  = u.searchParams.get('license_key') ?? '';

  if (!productSlug) return errorResponse(400, 'licenser_missing_params', 'product_slug required');
  const product = await findProductBySlug(productSlug);
  if (!product) return errorResponse(404, 'licenser_product_not_found', 'Unknown product');

  const { data: release } = await db()
    .from('product_releases')
    .select('version,download_url,changelog,release_notes,released_at,is_latest')
    .eq('product_id', product.id)
    .order('is_latest', { ascending: false })
    .order('released_at', { ascending: false })
    .limit(1).maybeSingle();

  if (!release) {
    return NextResponse.json({ ok: true, product: { slug: product.slug, name: product.name }, latest_version: null, has_update: false, message: 'No releases recorded yet' });
  }

  let entitled = false;
  let token: string | null = null;
  let packageUrl: string | null = null;
  if (licenseKey) {
    const lic = await findLicenseByKey(licenseKey);
    entitled = !!lic && lic.product_id === product.id && isLicenseActive(lic);
    if (entitled && lic) {
      token = issueToken({ license_id: lic.id, product_id: product.id, version: release.version, scope: 'download' }, 600);
      packageUrl = `${u.origin}/api/v1/download?token=${encodeURIComponent(token)}`;
    }
  }

  return NextResponse.json({
    ok: true,
    product: { slug: product.slug, name: product.name },
    latest_version: release.version,
    new_version: release.version,
    current_version: current || null,
    has_update: !!current && release.version !== current,
    entitled,
    download_url: entitled ? release.download_url : null,
    package: packageUrl,
    download_token: token,
    changelog: release.changelog,
    released_at: release.released_at,
  });
}
