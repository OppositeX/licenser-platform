// Alias of /validate matching the LIC-204 task spec.
// Returns a compact view: { ok, status, expires_at, plan }.
import { NextResponse } from 'next/server';
import { findLicenseByKey, findActivation, isLicenseActive, db } from '@/lib/licenser/db';
import { normalizeDomain } from '@/lib/licenser/domain';
import { errorResponse } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty body for reachability stub */ }

  const key    = body.license_key ? String(body.license_key) : '';
  const rawDom = body.domain ? String(body.domain) : (body.site_url ? String(body.site_url) : '');

  // Reachability stub: empty body or missing key returns ok=false but 200, with shape info.
  if (!key) {
    return NextResponse.json({
      ok: false,
      code: 'licenser_missing_params',
      message: 'license_key required',
      endpoint: 'check',
      signing: 'sha256+base64url (download tokens only)',
    }, { status: 200 });
  }

  const license = await findLicenseByKey(key);
  if (!license) return NextResponse.json({ ok: false, status: 'not_found' }, { status: 404 });

  const domain = normalizeDomain(rawDom);
  const activation = domain ? await findActivation(license.id, domain) : null;
  const ok = isLicenseActive(license) && !!activation && activation.status === 'active';

  if (activation && activation.status === 'active') {
    await db().from('activations').update({ last_seen_at: new Date().toISOString() }).eq('id', activation.id);
  }

  const { data: plan } = license.plan_id
    ? await db().from('plans').select('slug,name,max_activations').eq('id', license.plan_id).maybeSingle()
    : { data: null };

  return NextResponse.json({
    ok,
    status: license.status,
    expires_at: license.expires_at,
    plan: plan ?? null,
  });
}
