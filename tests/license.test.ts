import { describe, it, expect } from 'vitest';
import { isLicenseActive, type LicenseRow } from '@/lib/licenser/db';

function lic(over: Partial<LicenseRow>): LicenseRow {
  return {
    id: 'l1', product_id: 'p1', plan_id: null, customer_email: null,
    key: 'LCR-XXXX', key_prefix: 'LCR-XXXX', status: 'active',
    max_activations: 1, expires_at: null, grace_until: null,
    created_at: '', updated_at: '', ...over,
  };
}
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

describe('isLicenseActive', () => {
  it('active + no expiry = active', () => {
    expect(isLicenseActive(lic({ status: 'active', expires_at: null }))).toBe(true);
  });
  it('non-active status is never active', () => {
    expect(isLicenseActive(lic({ status: 'suspended' }))).toBe(false);
    expect(isLicenseActive(lic({ status: 'revoked' }))).toBe(false);
    expect(isLicenseActive(lic({ status: 'expired' }))).toBe(false);
  });
  it('active but past expiry = inactive', () => {
    expect(isLicenseActive(lic({ status: 'active', expires_at: past() }))).toBe(false);
  });
  it('active, future expiry = active', () => {
    expect(isLicenseActive(lic({ status: 'active', expires_at: future() }))).toBe(true);
  });
  it('past expiry but still within grace_until = active', () => {
    expect(isLicenseActive(lic({ status: 'active', expires_at: past(), grace_until: future() }))).toBe(true);
  });
  it('past expiry and past grace = inactive', () => {
    expect(isLicenseActive(lic({ status: 'active', expires_at: past(), grace_until: past() }))).toBe(false);
  });
});
