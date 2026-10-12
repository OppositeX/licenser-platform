import { describe, expect, it } from 'vitest';
import { withTenant, withTenantAll, isTenantScoped, TENANT_SCOPED_TABLES } from '@/lib/licenser/tenant-db';
import { pickActingTenant, OTW_TENANT_ID } from '@/lib/licenser/tenant';

const T = '11111111-1111-1111-1111-111111111111';

describe('tenant-db stamping', () => {
  it('stamps tenant_id on a row', () => {
    expect(withTenant('licenses', { key: 'X' }, T)).toEqual({ key: 'X', tenant_id: T });
  });

  it('is a no-op-compatible stamp when tenant_id already matches', () => {
    expect(withTenant('licenses', { key: 'X', tenant_id: T }, T)).toEqual({ key: 'X', tenant_id: T });
  });

  it('REFUSES to stamp a row whose tenant_id contradicts the context (cross-tenant guard)', () => {
    expect(() => withTenant('licenses', { key: 'X', tenant_id: 'other' }, T)).toThrow(/!=/);
  });

  it('refuses a non-tenant-scoped table', () => {
    // @ts-expect-error admins is deliberately not in TenantScopedTable
    expect(() => withTenant('admins', { email: 'a@b.c' }, T)).toThrow(/not tenant-scoped/);
  });

  it('stamps many rows', () => {
    expect(withTenantAll('plans', [{ slug: 'a' }, { slug: 'b' }], T)).toEqual([
      { slug: 'a', tenant_id: T }, { slug: 'b', tenant_id: T },
    ]);
  });

  it('knows which tables are scoped', () => {
    expect(isTenantScoped('licenses')).toBe(true);
    expect(isTenantScoped('admins')).toBe(false);
    expect(TENANT_SCOPED_TABLES).toContain('products');
  });
});

describe('pickActingTenant', () => {
  it('superadmin with no request → OTW default', () => {
    expect(pickActingTenant({ superadmin: true, memberTenantIds: [] })).toBe(OTW_TENANT_ID);
  });
  it('superadmin honours a requested tenant that exists', () => {
    expect(pickActingTenant({ superadmin: true, memberTenantIds: [], requested: T, allTenantIds: [T] })).toBe(T);
  });
  it('superadmin refused a requested tenant that does not exist', () => {
    expect(pickActingTenant({ superadmin: true, memberTenantIds: [], requested: T, allTenantIds: [OTW_TENANT_ID] })).toBeNull();
  });
  it('member defaults to their first tenant', () => {
    expect(pickActingTenant({ superadmin: false, memberTenantIds: [T] })).toBe(T);
  });
  it('member refused a tenant they do not belong to', () => {
    expect(pickActingTenant({ superadmin: false, memberTenantIds: [T], requested: 'other' })).toBeNull();
  });
  it('non-member, non-superadmin → null', () => {
    expect(pickActingTenant({ superadmin: false, memberTenantIds: [] })).toBeNull();
  });
});
