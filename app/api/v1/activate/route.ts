import { NextResponse } from 'next/server';
import {
  db, findLicenseByKey, findProductBySlug, findActivation,
  countActiveActivations, isLicenseActive, publicLicenseView, publicActivationView,
  logEvent,
} from '@/lib/licenser/db';
import { normalizeDomain } from '@/lib/licenser/domain';
import { errorResponse, readClientIp } from '@/lib/licenser/errors';
import { dispatchOutbound } from '@/lib/licenser/outbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse(400, 'licenser_bad_json', 'Invalid JSON body'); }

  const key      = String(body.license_key ?? '');
  const rawDom   = String(body.domain ?? body.site_url ?? '');
  const product  = body.product ? String(body.product) : (body.product_slug ? String(body.product_slug) : '');
  const version  = body.version ? String(body.version) : null;
  const wpVer    = body.wp_version ? String(body.wp_version) : null;
  const phpVer   = body.php_version ? String(body.php_version) : null;

  if (!key || !rawDom) return errorResponse(400, 'licenser_missing_params', 'license_key and domain are required');
  const domain = normalizeDomain(rawDom);
  if (!domain) return errorResponse(400, 'licenser_bad_domain', 'Invalid domain');

  const license = await findLicenseByKey(key);
  if (!license) return errorResponse(404, 'licenser_invalid_key', 'Invalid license key.');
  if (!isLicenseActive(license)) {
    return errorResponse(403, 'licenser_inactive_license', 'License is not active.', { license_status: license.status });
  }
  if (product) {
    const p = await findProductBySlug(product);
    if (p && p.id !== license.product_id) {
      return errorResponse(403, 'licenser_product_mismatch', 'License does not match the requested product.');
    }
  }

  const ip = readClientIp(req);
  const ua = req.headers.get('user-agent') ?? '';
  const supa = db();
  const now = new Date().toISOString();

  let activation = await findActivation(license.id, domain);
  if (activation) {
    if (activation.status === 'deactivated') {
      const active = await countActiveActivations(license.id);
      if (active >= license.max_activations) {
        return errorResponse(403, 'licenser_max_activations', 'License activation limit reached.', { used: active, limit: license.max_activations });
      }
      const { data: reactivated } = await supa
        .from('activations')
        .update({ status: 'active', last_seen_at: now, plugin_version: version, wp_version: wpVer, php_version: phpVer, ip, user_agent: ua })
        .eq('id', activation.id).select('*').single();
      activation = reactivated;
    } else {
      const { data: touched } = await supa
        .from('activations')
        .update({ last_seen_at: now, plugin_version: version ?? activation.plugin_version, wp_version: wpVer ?? activation.wp_version, php_version: phpVer ?? activation.php_version, ip: ip || activation.ip, user_agent: ua || activation.user_agent })
        .eq('id', activation.id).select('*').single();
      activation = touched;
    }
  } else {
    const active = await countActiveActivations(license.id);
    if (active >= license.max_activations) {
      return errorResponse(403, 'licenser_max_activations', 'License activation limit reached.', { used: active, limit: license.max_activations });
    }
    const { data: created, error: insErr } = await supa
      .from('activations')
      .insert({ license_id: license.id, site_url: domain, ip, user_agent: ua, plugin_version: version, wp_version: wpVer, php_version: phpVer })
      .select('*').single();
    if (insErr) return errorResponse(500, 'licenser_db_error', insErr.message);
    activation = created;
  }

  await logEvent('activate', { domain, version }, { license_id: license.id, product_id: license.product_id });
  await dispatchOutbound('license.activated', { license_id: license.id, product_id: license.product_id, data: { domain } });

  return NextResponse.json({
    license: await publicLicenseView(license),
    activation: publicActivationView(activation!),
    instance_token: activation!.instance_token,
  });
}
