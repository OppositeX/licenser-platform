import { serviceClient } from '@/lib/supabase/service';

export type LicenseStatus = 'active' | 'suspended' | 'revoked' | 'expired';

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  version: string | null;
  github_repo: string | null;
  created_at: string;
  updated_at: string;
}
export interface PlanRow {
  id: string;
  product_id: string;
  slug: string;
  name: string;
  max_activations: number;
  recurring: boolean;
  price_cents: number;
}
export interface LicenseRow {
  id: string;
  product_id: string;
  plan_id: string | null;
  customer_email: string | null;
  key: string;
  key_prefix: string;
  status: LicenseStatus;
  max_activations: number;
  expires_at: string | null;
  grace_until: string | null;
  created_at: string;
  updated_at: string;
}
export interface ActivationRow {
  id: string;
  license_id: string;
  site_url: string;
  ip: string | null;
  user_agent: string | null;
  plugin_version: string | null;
  wp_version: string | null;
  php_version: string | null;
  instance_token: string;
  status: 'active' | 'deactivated';
  activated_at: string;
  last_seen_at: string;
}

export function db() { return serviceClient(); }

export function isLicenseActive(l: LicenseRow): boolean {
  if (l.status !== 'active') return false;
  if (!l.expires_at) return true;
  const grace = l.grace_until || l.expires_at;
  return new Date(grace).getTime() > Date.now();
}

export async function findLicenseByKey(key: string): Promise<LicenseRow | null> {
  const { data, error } = await db()
    .from('licenses')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return (data as LicenseRow | null) ?? null;
}

export async function findProductBySlug(slug: string): Promise<ProductRow | null> {
  const { data, error } = await db()
    .from('products')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as ProductRow | null) ?? null;
}

export async function findActivation(licenseId: string, siteUrl: string): Promise<ActivationRow | null> {
  const { data, error } = await db()
    .from('activations')
    .select('*')
    .eq('license_id', licenseId)
    .eq('site_url', siteUrl)
    .maybeSingle();
  if (error) throw error;
  return (data as ActivationRow | null) ?? null;
}

export async function countActiveActivations(licenseId: string): Promise<number> {
  const { count, error } = await db()
    .from('activations')
    .select('*', { count: 'exact', head: true })
    .eq('license_id', licenseId)
    .eq('status', 'active');
  if (error) throw error;
  return count ?? 0;
}

export async function logEvent(
  type: string,
  data: Record<string, unknown>,
  ids: { license_id?: string | null; product_id?: string | null } = {}
): Promise<void> {
  await db().from('events').insert({
    type,
    data,
    license_id: ids.license_id ?? null,
    product_id: ids.product_id ?? null,
  });
}

export interface PublicLicenseView {
  id: string;
  key_prefix: string;
  product: { id: string; slug: string; name: string } | null;
  plan: { id: string; slug: string; name: string; max_activations: number } | null;
  status: LicenseStatus;
  max_activations: number;
  expires_at: string | null;
  grace_until: string | null;
}

export async function publicLicenseView(l: LicenseRow): Promise<PublicLicenseView> {
  const supa = db();
  const [{ data: product }, plan] = await Promise.all([
    supa.from('products').select('id,slug,name').eq('id', l.product_id).maybeSingle(),
    l.plan_id
      ? supa.from('plans').select('id,slug,name,max_activations').eq('id', l.plan_id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  return {
    id: l.id,
    key_prefix: l.key_prefix,
    product: product as { id: string; slug: string; name: string } | null,
    plan: plan as { id: string; slug: string; name: string; max_activations: number } | null,
    status: l.status,
    max_activations: l.max_activations,
    expires_at: l.expires_at,
    grace_until: l.grace_until,
  };
}

export function publicActivationView(a: ActivationRow) {
  return {
    id: a.id,
    domain: a.site_url,
    status: a.status,
    plugin_version: a.plugin_version,
    last_seen_at: a.last_seen_at,
    activated_at: a.activated_at,
  };
}
