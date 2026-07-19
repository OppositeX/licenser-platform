/**
 * /api/v1/download — consumes the signed download_token issued by
 * /api/v1/update-check and /api/v1/update, then delivers the release zip.
 *
 * WordPress core fetches `package` server-to-server (no browser), so the URL
 * must serve the actual bytes. For public GitHub assets we redirect. For
 * private repos we proxy with the configured PAT so the token never reaches
 * the client.
 *
 * Query: ?token=<signed download token>
 *
 * The token is HMAC-signed, short-TTL, and pins { license_id, product_id,
 * version, domain, scope:'download' }. We re-verify the license is still
 * active at download time — a token minted seconds before a revoke must not
 * outlive it.
 */
import { NextResponse } from 'next/server';
import { db, findLicenseByKey, isLicenseActive, type LicenseRow } from '@/lib/licenser/db';
import { verify as verifyToken } from '@/lib/licenser/signer';
import { getSetting } from '@/lib/licenser/settings';
import { errorResponse } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!token) return errorResponse(400, 'licenser_missing_token', 'token is required');

  const res = verifyToken(token);
  if (!res.ok) {
    const status = res.error === 'token_expired' ? 410 : 403;
    return errorResponse(status, `licenser_${res.error}`, 'Download token rejected.');
  }
  const claims = res.claims;
  if (claims.scope !== 'download') {
    return errorResponse(403, 'licenser_bad_scope', 'Token is not a download token.');
  }

  const licenseId = String(claims.license_id ?? '');
  const productId = String(claims.product_id ?? '');
  const version = String(claims.version ?? '');
  if (!licenseId || !productId || !version) {
    return errorResponse(403, 'licenser_bad_claims', 'Token is missing required claims.');
  }

  // Re-check entitlement at download time (token could predate a revoke/expiry).
  const { data: license } = await db()
    .from('licenses')
    .select('*')
    .eq('id', licenseId)
    .maybeSingle();
  if (!license || !isLicenseActive(license as LicenseRow)) {
    return errorResponse(403, 'licenser_inactive_license', 'License is no longer active.');
  }
  if ((license as LicenseRow).product_id !== productId) {
    return errorResponse(403, 'licenser_product_mismatch', 'Token does not match the license product.');
  }

  const { data: release } = await db()
    .from('product_releases')
    .select('version,download_url')
    .eq('product_id', productId)
    .eq('version', version)
    .maybeSingle();
  if (!release?.download_url) {
    return errorResponse(404, 'licenser_no_release', 'Release or download URL not found.');
  }

  const url = release.download_url as string;
  const pat = (await getSetting('github_pat')) || process.env.LICENSER_GITHUB_PAT || '';

  // No PAT (or non-GitHub URL): assume the asset is publicly fetchable and
  // hand WordPress a redirect. This keeps memory flat for large public zips.
  const isGithub = /(^|\.)github\.com\//.test(url) || url.includes('api.github.com');
  if (!pat || !isGithub) {
    return NextResponse.redirect(url, 302);
  }

  // Private repo: proxy the bytes with the PAT attached. GitHub honours the
  // token on browser_download_url and redirects to a signed asset URL, which
  // fetch() follows transparently.
  const upstream = await fetch(url, {
    headers: {
      Authorization: `token ${pat}`,
      Accept: 'application/octet-stream',
      'User-Agent': 'Licenser-Platform',
    },
    redirect: 'follow',
  });
  if (!upstream.ok || !upstream.body) {
    return errorResponse(502, 'licenser_upstream_failed', `Upstream returned ${upstream.status}.`);
  }

  const filename = `${(license as LicenseRow).product_id}-${version}.zip`;
  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  const len = upstream.headers.get('content-length');
  if (len) headers.set('Content-Length', len);

  return new NextResponse(upstream.body, { status: 200, headers });
}
