import { NextResponse } from 'next/server';
import { db, findLicenseByKey, findActivation, logEvent } from '@/lib/licenser/db';
import { normalizeDomain } from '@/lib/licenser/domain';
import { errorResponse } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse(400, 'licenser_bad_json', 'Invalid JSON body'); }

  const key    = String(body.license_key ?? '');
  const rawDom = String(body.domain ?? body.site_url ?? '');
  if (!key || !rawDom) return errorResponse(400, 'licenser_missing_params', 'license_key and domain are required');
  const domain = normalizeDomain(rawDom);
  if (!domain) return errorResponse(400, 'licenser_bad_domain', 'Invalid domain');

  const license = await findLicenseByKey(key);
  if (!license) return errorResponse(404, 'licenser_invalid_key', 'Invalid license key.');
  const activation = await findActivation(license.id, domain);
  if (!activation) return errorResponse(404, 'licenser_no_activation', 'No active installation found for this domain.');

  await db().from('activations').update({ status: 'deactivated' }).eq('id', activation.id);
  await logEvent('deactivate', { domain, reason: body.reason ?? null, message: body.message ?? null }, { license_id: license.id, product_id: license.product_id });

  return NextResponse.json({ deactivated: true, activation_id: activation.id, license_id: license.id });
}
