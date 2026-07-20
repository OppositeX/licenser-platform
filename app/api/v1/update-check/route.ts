import { NextResponse } from 'next/server';
import { db, findLicenseByKey, findActivation, isLicenseActive } from '@/lib/licenser/db';
import { issue as issueToken } from '@/lib/licenser/signer';
import { normalizeDomain } from '@/lib/licenser/domain';
import { errorResponse } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(origin: string, licenseKey: string, rawDomain: string, currentVersion: string | null) {
  const license = await findLicenseByKey(licenseKey);
  if (!license) return errorResponse(404, 'licenser_invalid_key', 'Invalid license key.');
  const domain = normalizeDomain(rawDomain);
  const activation = domain ? await findActivation(license.id, domain) : null;
  const entitled = isLicenseActive(license) && !!activation && activation.status === 'active';

  const { data: release } = await db()
    .from('product_releases')
    .select('version,download_url,changelog,release_notes,released_at,is_latest')
    .eq('product_id', license.product_id)
    .order('is_latest', { ascending: false })
    .order('released_at', { ascending: false })
    .limit(1).maybeSingle();

  if (!release) {
    return NextResponse.json({
      has_update: false, entitled, new_version: null, package: null,
      current_version: currentVersion, latest: null,
    });
  }

  const hasUpdate = !!currentVersion && release.version !== currentVersion;

  // Mint a scoped, short-TTL download token and expose it as a `package` URL
  // that the WP SDK (and WP core) can fetch directly. Only when entitled.
  let packageUrl: string | null = null;
  let downloadToken: string | null = null;
  if (entitled) {
    downloadToken = issueToken(
      { license_id: license.id, product_id: license.product_id, version: release.version, domain, scope: 'download' },
      600,
    );
    packageUrl = `${origin}/api/v1/download?token=${encodeURIComponent(downloadToken)}`;
  }

  return NextResponse.json({
    // Flat fields consumed by the WP SDK Updater (Updater.php reads these).
    has_update: hasUpdate,
    entitled,
    new_version: release.version,
    package: packageUrl,
    tested: '',
    requires: '',
    requires_php: '',
    changelog: release.changelog ?? '',
    current_version: currentVersion,
    // Nested block kept for the platform/JS client and backward-compat.
    latest: {
      version: release.version,
      download_url: entitled ? release.download_url : null,
      download_token: downloadToken,
      package: packageUrl,
      changelog: release.changelog,
      release_notes: release.release_notes,
      released_at: release.released_at,
    },
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse(400, 'licenser_bad_json', 'Invalid JSON body'); }
  const key = String(body.license_key ?? '');
  const dom = String(body.domain ?? body.site_url ?? '');
  const ver = body.version ? String(body.version) : null;
  if (!key || !dom) return errorResponse(400, 'licenser_missing_params', 'license_key and domain are required');
  return handle(new URL(req.url).origin, key, dom, ver);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get('license_key') ?? '';
  const dom = u.searchParams.get('domain') ?? u.searchParams.get('site_url') ?? '';
  const ver = u.searchParams.get('version');
  if (!key || !dom) return errorResponse(400, 'licenser_missing_params', 'license_key and domain are required');
  return handle(u.origin, key, dom, ver);
}
