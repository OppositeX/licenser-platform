/**
 * CNVS license vending — the tool that lets the CNVS agent mint and manage its
 * own seats without a human in the admin. All three verbs are pinned to the
 * `cnvs-runtime` product (the token's scope); anything else is refused with a
 * machine-readable `reason`.
 *
 *   GET    ?license_id=… | ?key=…        license.get       (scope license:read)
 *   POST   { plan_slug, customer_email, … , dry_run? }  license.issue   (license:write)
 *   PATCH  { license_id, status, reason, dry_run? }     license.set_status (license:write)
 *
 * Writes support dry_run:true — validate + return what WOULD happen, change
 * nothing. Refusals carry `{ ok:false, reason, message }`.
 */
import { requireScopedToken, type VendingScope } from '@/lib/admin-api/auth';
import { audit } from '@/lib/admin-api/audit';
import { CNVS_PRODUCT_SLUG, findLicense, isCnvsProduct, toView } from '@/lib/admin-api/cnvs-license';
import { db, type LicenseStatus } from '@/lib/licenser/db';
import { issueLicense, setLicenseStatusById } from '@/lib/licenser/issuance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUS: LicenseStatus[] = ['active', 'suspended', 'revoked', 'expired'];

function refuse(reason: string, message: string, status = 400) {
  return Response.json({ ok: false, reason, message }, { status, headers: { 'cache-control': 'no-store' } });
}
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const posInt = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function auth(req: Request, scope: VendingScope) {
  const r = await requireScopedToken(req, scope);
  return r;
}

// ── license.get ────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const a = await auth(req, 'license:read');
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const license_id = s(url.searchParams.get('license_id'));
  const key = s(url.searchParams.get('key'));
  if (!license_id && !key) return refuse('MISSING_FIELD', 'provide license_id or key');

  const lic = await findLicense({ licenseId: license_id, key });
  const audited = (ok: boolean, status: number, reason?: string) =>
    audit({ token_id: a.token.id, token_prefix: a.token.prefix, tool: 'license.get', scope: 'license:read', ok, status, args: { license_id, has_key: Boolean(key), reason } });

  if (!lic) { await audited(false, 404, 'UNKNOWN_LICENSE'); return refuse('UNKNOWN_LICENSE', 'no license matches', 404); }
  if (!isCnvsProduct(lic)) { await audited(false, 403, 'WRONG_PRODUCT'); return refuse('WRONG_PRODUCT', `token is scoped to ${CNVS_PRODUCT_SLUG}`, 403); }

  await audited(true, 200);
  return Response.json({ ok: true, license: toView(lic) }, { headers: { 'cache-control': 'no-store' } });
}

// ── license.issue ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const a = await auth(req, 'license:write');
  if (!a.ok) return a.response;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return refuse('BAD_BODY', 'body must be JSON'); }

  const plan_slug = s(body.plan_slug);
  const customer_email = s(body.customer_email);
  const customer_name = s(body.customer_name);
  const expires_at = s(body.expires_at);
  const woo_order_id = s(body.woo_order_id);
  const max_activations = body.max_activations === undefined ? null : posInt(body.max_activations);
  const dry_run = body.dry_run === true;

  const audited = (ok: boolean, status: number, extra: Record<string, unknown> = {}) =>
    audit({ token_id: a.token.id, token_prefix: a.token.prefix, tool: 'license.issue', scope: 'license:write', dry_run, ok, status, args: { plan_slug, woo_order_id, ...extra } });

  const missing: string[] = [];
  if (!plan_slug) missing.push('plan_slug');
  if (!customer_email) missing.push('customer_email');
  if (body.max_activations !== undefined && max_activations === null) missing.push('max_activations (positive integer)');
  if (missing.length) { await audited(false, 400, { missing }); return refuse('MISSING_FIELD', 'missing/invalid: ' + missing.join(', ')); }
  if (expires_at && Number.isNaN(Date.parse(expires_at))) return refuse('BAD_FIELD', 'expires_at must be an ISO date');

  // The plan must belong to cnvs-runtime — the product this token is scoped to.
  const { data: prod } = await db().from('products').select('id').eq('slug', CNVS_PRODUCT_SLUG).maybeSingle();
  const productId = (prod as { id: string } | null)?.id;
  if (!productId) { await audited(false, 500, { reason: 'NO_PRODUCT' }); return refuse('NO_PRODUCT', `${CNVS_PRODUCT_SLUG} product not found`, 500); }
  const { data: plan } = await db().from('plans').select('id,slug,name,max_activations').eq('product_id', productId).eq('slug', plan_slug).maybeSingle();
  if (!plan) { await audited(false, 400, { reason: 'UNKNOWN_PLAN' }); return refuse('UNKNOWN_PLAN', `no plan "${plan_slug}" on ${CNVS_PRODUCT_SLUG}`); }
  const planRow = plan as { id: string; slug: string; name: string; max_activations: number };

  if (dry_run) {
    await audited(true, 200);
    return Response.json({
      ok: true, dry_run: true,
      would_issue: {
        product_slug: CNVS_PRODUCT_SLUG, plan_slug: planRow.slug,
        customer_email: customer_email!.toLowerCase(), customer_name,
        max_activations: max_activations ?? planRow.max_activations,
        expires_at: expires_at ?? null, woo_order_id,
      },
    }, { headers: { 'cache-control': 'no-store' } });
  }

  try {
    const r = await issueLicense({
      productId, planId: planRow.id, planSlug: planRow.slug,
      customerEmail: customer_email!, customerName: customer_name,
      expiresAt: expires_at, wooOrderId: woo_order_id,
      maxActivationsOverride: max_activations ?? undefined,
    });
    await audited(true, 200, { license_id: r.license.id, is_new: r.isNew });
    return Response.json({
      ok: true,
      is_new: r.isNew,
      license: {
        license_id: r.license.id,
        key: r.license.key,            // full key — CNVS delivers it to the customer
        key_prefix: r.license.key_prefix,
        status: r.license.status,
        product_slug: CNVS_PRODUCT_SLUG,
        plan_slug: planRow.slug,
        customer_email: r.license.customer_email,
        max_activations: r.license.max_activations,
        expires_at: r.license.expires_at,
      },
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    await audited(false, 500, { error: e instanceof Error ? e.message : String(e) });
    return refuse('ISSUE_FAILED', e instanceof Error ? e.message : 'issue failed', 500);
  }
}

// ── license.set_status ───────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const a = await auth(req, 'license:write');
  if (!a.ok) return a.response;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return refuse('BAD_BODY', 'body must be JSON'); }

  const license_id = s(body.license_id);
  const status = s(body.status) as LicenseStatus | null;
  const reason = s(body.reason) ?? 'set via vending api';
  const dry_run = body.dry_run === true;

  const audited = (ok: boolean, code: number, extra: Record<string, unknown> = {}) =>
    audit({ token_id: a.token.id, token_prefix: a.token.prefix, tool: 'license.set_status', scope: 'license:write', dry_run, ok, status: code, args: { license_id, status, ...extra } });

  if (!license_id) { await audited(false, 400); return refuse('MISSING_FIELD', 'license_id required'); }
  if (!status || !VALID_STATUS.includes(status)) { await audited(false, 400, { reason: 'BAD_STATUS' }); return refuse('BAD_STATUS', `status must be one of ${VALID_STATUS.join(', ')}`); }

  const lic = await findLicense({ licenseId: license_id });
  if (!lic) { await audited(false, 404, { reason: 'UNKNOWN_LICENSE' }); return refuse('UNKNOWN_LICENSE', 'no license matches', 404); }
  if (!isCnvsProduct(lic)) { await audited(false, 403, { reason: 'WRONG_PRODUCT' }); return refuse('WRONG_PRODUCT', `token is scoped to ${CNVS_PRODUCT_SLUG}`, 403); }

  if (dry_run) {
    await audited(true, 200);
    return Response.json({ ok: true, dry_run: true, would_change: { license_id, from: lic.status, to: status, reason } }, { headers: { 'cache-control': 'no-store' } });
  }

  try {
    const r = await setLicenseStatusById(license_id, status, reason);
    await audited(true, 200, { updated: r.updated });
    const fresh = await findLicense({ licenseId: license_id });
    return Response.json({ ok: true, updated: r.updated, license: fresh ? toView(fresh) : null }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    await audited(false, 500, { error: e instanceof Error ? e.message : String(e) });
    return refuse('STATUS_FAILED', e instanceof Error ? e.message : 'status change failed', 500);
  }
}
