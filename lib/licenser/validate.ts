/**
 * Shared validation core used by both /api/v1/validate (legacy WP-SDK shape)
 * and /api/v2/validate (cnvs-licenser shape). Keeps the business rules in
 * one place: SQL lookup → status → domain → activation → features.
 */
import { db, findLicenseByKey, findActivation, isLicenseActive, type LicenseRow } from './db';
import { normalizeDomain } from './domain';
import { resolveFeatures, planSlugToTier, type CnvsTier } from './tiers';

export type ValidateReason =
  | 'UNKNOWN_KEY'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUSPENDED'
  | 'DOMAIN_NOT_AUTHORIZED'
  | 'PRODUCT_MISMATCH';

export interface ValidateInput {
  key: string;
  slug?: string;          // product slug, e.g. 'cnvs-runtime'
  domain?: string;
  fingerprint?: string;
  ip?: string;
}

export interface ValidateResult {
  active: boolean;
  reason?: ValidateReason;
  tier: CnvsTier | null;
  plan_slug: string | null;
  expires_at: string | null;
  features: string[];
  customer_email: string | null;
  product_slug: string | null;
  license_id: string | null;
  product_id: string | null;
  domain: string | null;
  /** raw underlying license row for callers that need it */
  license?: LicenseRow | null;
}

function planRow(licenseId: string) {
  return db()
    .from('licenses')
    .select('plans(slug,name,max_activations,feature_flags), products(slug,name)')
    .eq('id', licenseId)
    .maybeSingle();
}

function reasonForStatus(status: string, expired: boolean): ValidateReason | undefined {
  if (status === 'revoked')   return 'REVOKED';
  if (status === 'suspended') return 'SUSPENDED';
  if (status === 'expired' || expired) return 'EXPIRED';
  return undefined;
}

export async function runValidate(input: ValidateInput): Promise<ValidateResult> {
  const domain = input.domain ? normalizeDomain(input.domain) : null;
  const license = await findLicenseByKey(input.key);

  if (!license) {
    return {
      active: false, reason: 'UNKNOWN_KEY', tier: null, plan_slug: null,
      expires_at: null, features: [], customer_email: null, product_slug: null,
      license_id: null, product_id: null, domain, license: null,
    };
  }

  // Pull joined plan+product in one shot.
  const { data: joined } = await planRow(license.id);
  const plan = (joined as any)?.plans ?? null;
  const product = (joined as any)?.products ?? null;
  const planSlug: string | null = plan?.slug ?? null;
  const productSlug: string | null = product?.slug ?? null;

  const expiredByDate = !!license.expires_at && new Date(license.grace_until || license.expires_at).getTime() <= Date.now();
  const statusReason = reasonForStatus(license.status, expiredByDate);

  // Product slug mismatch is a hard fail when caller passes one.
  if (input.slug && productSlug && input.slug.toLowerCase() !== productSlug.toLowerCase()) {
    return {
      active: false, reason: 'PRODUCT_MISMATCH', tier: planSlugToTier(planSlug), plan_slug: planSlug,
      expires_at: license.expires_at, features: [], customer_email: license.customer_email,
      product_slug: productSlug, license_id: license.id, product_id: license.product_id,
      domain, license,
    };
  }

  if (statusReason) {
    return {
      active: false, reason: statusReason, tier: planSlugToTier(planSlug), plan_slug: planSlug,
      expires_at: license.expires_at, features: [], customer_email: license.customer_email,
      product_slug: productSlug, license_id: license.id, product_id: license.product_id,
      domain, license,
    };
  }

  // If domain provided, require an active activation. If not provided (SDK
  // smoke test, server-side check), treat domain check as not-applicable.
  if (domain) {
    const activation = await findActivation(license.id, domain);
    const activationOk = !!activation && activation.status === 'active';
    if (!activationOk && !isAllowedDomain(domain)) {
      return {
        active: false, reason: 'DOMAIN_NOT_AUTHORIZED', tier: planSlugToTier(planSlug), plan_slug: planSlug,
        expires_at: license.expires_at, features: [], customer_email: license.customer_email,
        product_slug: productSlug, license_id: license.id, product_id: license.product_id,
        domain, license,
      };
    }
    if (activation) {
      await db().from('activations').update({ last_seen_at: new Date().toISOString() }).eq('id', activation.id);
    }
  }

  return {
    active: true,
    tier: planSlugToTier(planSlug),
    plan_slug: planSlug,
    expires_at: license.expires_at,
    features: resolveFeatures(planSlug, plan?.feature_flags),
    customer_email: license.customer_email,
    product_slug: productSlug,
    license_id: license.id,
    product_id: license.product_id,
    domain,
    license,
  };
}

/**
 * Local-development domain bypass. These hosts skip the activation/seat check
 * so a developer can validate against a real key without burning a seat.
 *
 * IMPORTANT: this is a DEV convenience, not a production tolerance. Previously
 * every `*.vercel.app` host was allowlisted, which meant any valid key
 * validated as fully-featured on unlimited preview deployments and never
 * consumed a seat. That blanket is removed. Real deployments — including
 * production Vercel domains — must go through /api/v1/activate.
 *
 * To re-open specific suffixes (e.g. a shared preview host) without a code
 * change, set LICENSER_DEV_DOMAINS to a comma-separated suffix list, e.g.
 * `LICENSER_DEV_DOMAINS=.previews.gloo.ooo,.vercel.app`.
 */
function devDomainSuffixes(): string[] {
  const extra = (process.env.LICENSER_DEV_DOMAINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ['.local', ...extra];
}

export function isAllowedDomain(domain: string): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  if (d === 'localhost' || d.startsWith('localhost:')) return true;
  if (d === '127.0.0.1' || d.startsWith('127.0.0.1:')) return true;
  return devDomainSuffixes().some((suffix) => d.endsWith(suffix));
}

export async function logValidation(
  result: ValidateResult,
  source: 'api_v1' | 'api_v2' | 'api_check',
  ip: string | null,
  fingerprint: string | null,
): Promise<void> {
  const resultCode: string = result.active ? 'valid' : (result.reason ?? 'unknown_key').toLowerCase();
  try {
    await db().from('validation_log').insert({
      license_id: result.license_id,
      product_id: result.product_id,
      domain: result.domain,
      ip,
      fingerprint,
      result: resultCode,
      source,
    });
  } catch {
    // Logging must never block a validation response.
  }
}
