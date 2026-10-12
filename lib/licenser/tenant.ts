/**
 * Tenancy model (Model B foundation).
 *
 * The platform is becoming multi-tenant WITHOUT changing current behaviour:
 * every existing row belongs to the fixed OTW tenant, and any code path that
 * doesn't yet carry a tenant context falls back to it. So until the query layer
 * and admin UI are tenant-aware, the system behaves exactly as the single-tenant
 * version did.
 *
 *   - `licenser_tenants`  — the vendors the platform serves (OTW is one of them).
 *   - `tenant_members`    — per-tenant users + roles (owner/admin/viewer).
 *   - `admins`            — UNCHANGED: platform superadmins (OTW operators) who
 *                           may act on ANY tenant. Not a tenant_members row.
 *
 * This module is read-only and additive; nothing here changes an existing flow.
 */
import { db } from './db';

/** Well-known id of the OTW tenant (seeded in 20261003_multitenant_foundation). */
export const OTW_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/** The tenant a context defaults to when none is resolved — preserves today's behaviour. */
export const DEFAULT_TENANT_ID = OTW_TENANT_ID;

export type TenantRole = 'owner' | 'admin' | 'viewer';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  github_org: string | null;
  branding: TenantBranding;
  created_at: string;
  updated_at: string;
}

/** White-label surface. Empty fields fall back to platform defaults at render time. */
export interface TenantBranding {
  displayName?: string;
  logoUrl?: string;
  fromEmail?: string;
  supportEmail?: string;
  portalDomain?: string;
  accentColor?: string;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  email: string;
  role: TenantRole;
  created_at: string;
}

type TenantRow = Omit<Tenant, 'branding'> & { branding: TenantBranding | null };

function hydrate(row: TenantRow): Tenant {
  return { ...row, branding: row.branding ?? {} };
}

export async function getTenant(id: string): Promise<Tenant | null> {
  const { data } = await db().from('licenser_tenants').select('*').eq('id', id).maybeSingle();
  return data ? hydrate(data as TenantRow) : null;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const { data } = await db().from('licenser_tenants').select('*').eq('slug', slug.toLowerCase()).maybeSingle();
  return data ? hydrate(data as TenantRow) : null;
}

export async function listTenants(): Promise<Tenant[]> {
  const { data } = await db().from('licenser_tenants').select('*').order('created_at', { ascending: true });
  return ((data ?? []) as TenantRow[]).map(hydrate);
}

/** The tenants a user can act on. Platform superadmins (in `admins`) see all. */
export async function tenantsForUser(email: string): Promise<{ superadmin: boolean; tenants: Tenant[] }> {
  const e = email.toLowerCase();
  const { data: adminRow } = await db().from('admins').select('email').eq('email', e).maybeSingle();
  if (adminRow) return { superadmin: true, tenants: await listTenants() };

  const { data: memberships } = await db().from('tenant_members').select('tenant_id').eq('email', e);
  const ids = ((memberships ?? []) as Array<{ tenant_id: string }>).map((m) => m.tenant_id);
  if (ids.length === 0) return { superadmin: false, tenants: [] };
  const { data } = await db().from('licenser_tenants').select('*').in('id', ids).order('created_at', { ascending: true });
  return { superadmin: false, tenants: ((data ?? []) as TenantRow[]).map(hydrate) };
}

/**
 * Decide which tenant an admin is acting as, given who they are and what they
 * requested. Pure + unit-testable (no DB): callers pass the facts they looked up.
 *
 *  - A superadmin may act as any tenant; `requested` wins, else OTW default.
 *  - A member may act only as a tenant they belong to; a `requested` tenant they
 *    don't belong to is refused (null). With no `requested`, their first tenant.
 *  - Nobody (not superadmin, no memberships) → null.
 */
export function pickActingTenant(input: {
  superadmin: boolean;
  memberTenantIds: string[];
  requested?: string | null;
  allTenantIds?: string[];
}): string | null {
  const { superadmin, memberTenantIds, requested, allTenantIds } = input;
  if (superadmin) {
    if (requested) {
      // Only honour a requested tenant that actually exists (when we know the set).
      if (!allTenantIds || allTenantIds.includes(requested)) return requested;
      return null;
    }
    return DEFAULT_TENANT_ID;
  }
  if (memberTenantIds.length === 0) return null;
  if (requested) return memberTenantIds.includes(requested) ? requested : null;
  return memberTenantIds[0];
}

// ── Writes (used by the superadmin onboarding surface) ──────────────────────

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

/** Create a tenant. Slug is normalized + must be unique. Returns the new row. */
export async function createTenant(input: {
  name: string;
  slug?: string;
  github_org?: string | null;
  branding?: TenantBranding;
}): Promise<{ ok: true; tenant: Tenant } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'name required' };
  const slug = normalizeSlug(input.slug || name);
  if (!slug) return { ok: false, error: 'could not derive a slug' };
  const { data, error } = await db()
    .from('licenser_tenants')
    .insert({ name, slug, github_org: input.github_org ?? null, branding: input.branding ?? {} })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return { ok: false, error: `slug "${slug}" is taken` };
    return { ok: false, error: error.message };
  }
  return { ok: true, tenant: hydrate(data as TenantRow) };
}

export async function updateTenantBranding(tenantId: string, branding: TenantBranding): Promise<void> {
  await db().from('licenser_tenants').update({ branding, updated_at: new Date().toISOString() }).eq('id', tenantId);
}

export async function addMember(tenantId: string, email: string, role: TenantRole = 'admin'): Promise<{ ok: boolean; error?: string }> {
  const e = email.trim().toLowerCase();
  if (!e) return { ok: false, error: 'email required' };
  const { error } = await db().from('tenant_members').insert({ tenant_id: tenantId, email: e, role });
  if (error) return { ok: false, error: error.code === '23505' ? 'already a member' : error.message };
  return { ok: true };
}

export async function removeMember(tenantId: string, email: string): Promise<void> {
  await db().from('tenant_members').delete().eq('tenant_id', tenantId).eq('email', email.trim().toLowerCase());
}

export async function listMembers(tenantId: string): Promise<TenantMember[]> {
  const { data } = await db().from('tenant_members').select('*').eq('tenant_id', tenantId).order('created_at');
  return (data ?? []) as TenantMember[];
}

/** True when the email is a platform superadmin (public.admins). */
export async function isSuperadmin(email: string): Promise<boolean> {
  const { data } = await db().from('admins').select('email').eq('email', email.toLowerCase()).maybeSingle();
  return Boolean(data);
}

/** A user's role in one tenant. Superadmins are treated as 'owner' everywhere. */
export async function roleForUser(email: string, tenantId: string): Promise<TenantRole | null> {
  const e = email.toLowerCase();
  const { data: adminRow } = await db().from('admins').select('email').eq('email', e).maybeSingle();
  if (adminRow) return 'owner';
  const { data } = await db().from('tenant_members').select('role').eq('email', e).eq('tenant_id', tenantId).maybeSingle();
  return (data as { role: TenantRole } | null)?.role ?? null;
}
