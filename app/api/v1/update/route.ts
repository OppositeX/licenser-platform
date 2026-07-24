// /api/v1/update — new shape requested in LIC-204.
// query: ?product_slug=...&version=...&license_key=...
import { NextResponse } from 'next/server';
import { findLicenseByKey, findProductBySlug, isLicenseActive } from '@/lib/licenser/db';
import { issue as issueToken } from '@/lib/licenser/signer';
import { pickLatestRelease, normalizeChannel } from '@/lib/licenser/releases';
import { errorResponse } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const productSlug = u.searchParams.get('product_slug') ?? '';
  const current     = u.searchParams.get('version') ?? '';
  const licenseKey  = u.searchParams.get('license_key') ?? '';
  const channel     = normalizeChannel(u.searchParams.get('channel') ?? u.searchParams.get('beta'));

  if (!productSlug) return errorResponse(400, 'licenser_missing_params', 'product_slug required');
  const product = await findProductBySlug(productSlug);
  if (!product) return errorResponse(404, 'licenser_product_not_found', 'Unknown product');

  const release = await pickLatestRelease(product.id, channel);

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
    channel: release.channel,
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
