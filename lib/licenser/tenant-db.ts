/**
 * Tenant-scoped data access (Model B step 2).
 *
 * The app talks to Postgres through the service-role client, which bypasses
 * RLS, so tenant isolation is enforced HERE, in the query layer — RLS is
 * defence-in-depth, added later. This module gives the admin + vending surfaces
 * a scoped view of the tenant-owned tables; it does NOT touch the public,
 * key-addressed paths (validate / activate / update), because a licence key or
 * instance token is globally unique and already identifies exactly one row —
 * scoping those would add risk for no isolation benefit. That is the single
 * biggest "don't disturb the live CNVS path" decision in this build.
 *
 * Everything defaults to the OTW tenant, so until a caller passes a real tenant
 * context the behaviour is identical to the single-tenant version.
 */
import { db } from './db';
import { DEFAULT_TENANT_ID } from './tenant';

/** Tables that carry a tenant_id (see 20261003_multitenant_foundation). */
export const TENANT_SCOPED_TABLES = [
  'products',
  'plans',
  'licenses',
  'activations',
  'product_releases',
  'events',
  'validation_log',
  'feedback',
  'license_overrides',
  'outbound_webhooks',
  'api_tokens',
  'incidents',
  'service_components',
] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

const SCOPED = new Set<string>(TENANT_SCOPED_TABLES);

export function isTenantScoped(table: string): boolean {
  return SCOPED.has(table);
}

/**
 * Stamp a row with its tenant_id for insertion. Pure. Throws if the table isn't
 * tenant-scoped (a guard against silently writing an unscoped row). An explicit
 * tenant_id already on the row must match the context — mismatches are a bug.
 */
export function withTenant<T extends Record<string, unknown>>(
  table: TenantScopedTable,
  row: T,
  tenantId: string,
): T & { tenant_id: string } {
  if (!isTenantScoped(table)) throw new Error(`withTenant: ${table} is not tenant-scoped`);
  const existing = row.tenant_id;
  if (typeof existing === 'string' && existing !== tenantId) {
    throw new Error(`withTenant: row tenant_id ${existing} != context ${tenantId}`);
  }
  return { ...row, tenant_id: tenantId };
}

/** Stamp many rows at once. Pure. */
export function withTenantAll<T extends Record<string, unknown>>(
  table: TenantScopedTable,
  rows: T[],
  tenantId: string,
): Array<T & { tenant_id: string }> {
  return rows.map((r) => withTenant(table, r, tenantId));
}

/**
 * A select on a tenant-scoped table, filtered to `tenantId` (default OTW).
 * Returns the Supabase query builder so callers chain .eq / .order / .single etc.
 *
 *   const { data } = await scopedSelect('licenses', tenantId, 'id,key_prefix')
 *     .eq('status', 'active');
 */
export function scopedSelect(table: TenantScopedTable, tenantId: string = DEFAULT_TENANT_ID, columns = '*') {
  return db().from(table).select(columns).eq('tenant_id', tenantId);
}

/** Insert tenant-stamped row(s) into a tenant-scoped table. */
export function scopedInsert<T extends Record<string, unknown>>(
  table: TenantScopedTable,
  tenantId: string,
  rowOrRows: T | T[],
) {
  const payload = Array.isArray(rowOrRows)
    ? withTenantAll(table, rowOrRows, tenantId)
    : withTenant(table, rowOrRows, tenantId);
  return db().from(table).insert(payload as never);
}

/**
 * A tenant handle bundling the scoped builders for one tenant — ergonomic for
 * an admin page or a vending request that acts entirely within one tenant.
 */
export interface TenantDb {
  tenantId: string;
  select: (table: TenantScopedTable, columns?: string) => ReturnType<typeof scopedSelect>;
  insert: <T extends Record<string, unknown>>(table: TenantScopedTable, rowOrRows: T | T[]) => ReturnType<typeof scopedInsert>;
}

export function tenantDb(tenantId: string = DEFAULT_TENANT_ID): TenantDb {
  return {
    tenantId,
    select: (table, columns = '*') => scopedSelect(table, tenantId, columns),
    insert: (table, rowOrRows) => scopedInsert(table, tenantId, rowOrRows),
  };
}
