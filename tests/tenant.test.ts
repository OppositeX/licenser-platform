import { describe, expect, it } from 'vitest';
import { OTW_TENANT_ID, DEFAULT_TENANT_ID } from '@/lib/licenser/tenant';

describe('tenant foundation', () => {
  it('OTW tenant id is the fixed well-known uuid seeded by the migration', () => {
    // Must match the INSERT in 20261003_multitenant_foundation.sql exactly.
    expect(OTW_TENANT_ID).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('default tenant is OTW (preserves single-tenant behaviour until scoping lands)', () => {
    expect(DEFAULT_TENANT_ID).toBe(OTW_TENANT_ID);
  });

  it('OTW id is a syntactically valid uuid', () => {
    expect(OTW_TENANT_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
