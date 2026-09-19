/**
 * CNVS license vending helpers. The CNVS vending token is scoped to a single
 * product — `cnvs-runtime` — so an autonomous caller can mint and manage CNVS
 * seats but nothing else in the OTW catalogue. Every read/write here enforces
 * that boundary and returns a stable license view.
 */
import { db, isLicenseActive, type LicenseRow } from '@/lib/licenser/db';

export const CNVS_PRODUCT_SLUG = 'cnvs-runtime';

export interface CnvsLicenseView {
  license_id: string;
  key_prefix: string;
  status: string;
  active: boolean;
  product_slug: string | null;
  plan_slug: string | null;
  customer_email: string | null;
  max_activations: number;
  expires_at: string | null;
  created_at: string;
}

interface LicenseWithSlugs extends LicenseRow {
  product_slug: string | null;
  plan_slug: string | null;
}

/** Look up a license by id or key and resolve its product + plan slug. */
export async function findLicense(opts: { licenseId?: string | null; key?: string | null }): Promise<LicenseWithSlugs | null> {
  const supa = db();
  const base = supa.from('licenses').select('*');
  const q = opts.licenseId ? base.eq('id', opts.licenseId)
    : opts.key ? base.eq('key', opts.key)
      : null;
  if (!q) return null;
  const { data } = await q.maybeSingle();
  const lic = (data as LicenseRow | null) ?? null;
  if (!lic) return null;

  const [{ data: prod }, { data: plan }] = await Promise.all([
    supa.from('products').select('slug').eq('id', lic.product_id).maybeSingle(),
    lic.plan_id ? supa.from('plans').select('slug').eq('id', lic.plan_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    ...lic,
    product_slug: (prod as { slug: string } | null)?.slug ?? null,
    plan_slug: (plan as { slug: string } | null)?.slug ?? null,
  };
}

/** True when the license belongs to the CNVS product the token is scoped to. */
export function isCnvsProduct(lic: { product_slug: string | null }): boolean {
  return lic.product_slug === CNVS_PRODUCT_SLUG;
}

export function toView(lic: LicenseWithSlugs): CnvsLicenseView {
  return {
    license_id: lic.id,
    key_prefix: lic.key_prefix,
    status: lic.status,
    active: isLicenseActive(lic),
    product_slug: lic.product_slug,
    plan_slug: lic.plan_slug,
    customer_email: lic.customer_email,
    max_activations: lic.max_activations,
    expires_at: lic.expires_at,
    created_at: lic.created_at,
  };
}
