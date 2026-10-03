/**
 * Tenant-aware admin context (Model B step 3).
 *
 * Wraps requireAdmin() and resolves which tenant the operator is acting as:
 *   - platform superadmins (public.admins) may act as any tenant; default OTW;
 *   - tenant_members act only within their own tenant(s);
 *   - the selection is held in the `acting_tenant` cookie (set by the switcher).
 *
 * requireAdmin() is left untouched, so any page not yet migrated keeps working.
 * A migrated page calls requireAdminTenant() and scopes its queries with the
 * returned tenantId via lib/licenser/tenant-db.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import {
  tenantsForUser,
  roleForUser,
  pickActingTenant,
  type Tenant,
  type TenantRole,
} from '@/lib/licenser/tenant';

export const ACTING_TENANT_COOKIE = 'acting_tenant';

export interface AdminTenantContext {
  email: string;
  userId: string;
  superadmin: boolean;
  /** Tenants this operator may switch between. */
  tenants: Tenant[];
  /** The tenant currently being acted on. */
  tenantId: string;
  tenant: Tenant | null;
  role: TenantRole;
}

/**
 * Gate + resolve the acting tenant. `requested` (e.g. from a query param) wins
 * over the cookie. Redirects to login if not an admin; to /admin/no-tenant if a
 * logged-in user has no tenant they may act on.
 */
export async function requireAdminTenant(requested?: string | null): Promise<AdminTenantContext> {
  const { email, userId } = await requireAdmin();
  const { superadmin, tenants } = await tenantsForUser(email);

  const jar = await cookies();
  const cookieTenant = jar.get(ACTING_TENANT_COOKIE)?.value ?? null;
  const want = requested ?? cookieTenant;

  const tenantId = pickActingTenant({
    superadmin,
    memberTenantIds: tenants.map((t) => t.id),
    requested: want,
    allTenantIds: tenants.map((t) => t.id),
  });

  if (!tenantId) {
    // A superadmin always resolves (default OTW), so reaching here means a
    // member with no valid tenant — or a requested tenant they can't access.
    redirect('/admin/no-tenant');
  }

  const tenant = tenants.find((t) => t.id === tenantId) ?? null;
  const role = (await roleForUser(email, tenantId)) ?? (superadmin ? 'owner' : 'viewer');

  return { email, userId, superadmin, tenants, tenantId, tenant, role };
}
