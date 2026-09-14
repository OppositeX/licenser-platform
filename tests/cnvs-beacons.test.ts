import { describe, it, expect } from 'vitest';
import { normalizeBeacon, redactLicenseKeys } from '@/lib/cnvs/beacons';

/**
 * The cnvs-4 caller could not be read from this session (repo out of scope),
 * so these tests pin the property that matters regardless of which field names
 * it actually uses: an unrecognised body is recorded in full, never dropped.
 */

describe('normalizeBeacon', () => {
  it('reads the camelCase shape', () => {
    const b = normalizeBeacon({
      deploymentId: 'dpl_123',
      projectId: 'cnvs-marketing',
      environment: 'production',
      commitSha: 'abc1234def',
      deploymentUrl: 'https://cnvs-4-marketing.vercel.app',
      region: 'fra1',
    });
    expect(b.deployment_id).toBe('dpl_123');
    expect(b.project).toBe('cnvs-marketing');
    expect(b.environment).toBe('production');
    expect(b.commit_sha).toBe('abc1234def');
    expect(b.url).toBe('https://cnvs-4-marketing.vercel.app');
    expect(b.region).toBe('fra1');
  });

  it('reads the snake_case shape', () => {
    const b = normalizeBeacon({
      deployment_id: 'dpl_456',
      project_slug: 'cnvs-editor',
      vercel_env: 'preview',
      app_version: '4.2.0',
    });
    expect(b.deployment_id).toBe('dpl_456');
    expect(b.project).toBe('cnvs-editor');
    expect(b.environment).toBe('preview');
    expect(b.version).toBe('4.2.0');
  });

  it('reads one level of nesting', () => {
    const b = normalizeBeacon({ deployment: { id: 'dpl_789', url: 'https://x.dev' }, env: 'development' });
    expect(b.deployment_id).toBe('dpl_789');
    expect(b.url).toBe('https://x.dev');
    expect(b.environment).toBe('development');
  });

  it('keeps the whole body even when nothing is recognised', () => {
    const body = { totally: 'unexpected', nested: { shape: [1, 2, 3] } };
    const b = normalizeBeacon(body);
    expect(b.deployment_id).toBeNull();
    expect(b.project).toBeNull();
    expect(b.payload).toEqual(body);
  });

  it('accepts an empty body', () => {
    const b = normalizeBeacon({});
    expect(b.payload).toEqual({});
    expect(b.licenseKey).toBeNull();
  });

  it('reduces a license key to its 8-character prefix', () => {
    const b = normalizeBeacon({ licenseKey: 'LCR-ABCD-EFGH-IJKL-MNOP', project: 'p' });
    expect(b.license_key_prefix).toBe('LCR-ABCD');   // matches licenses.key_prefix
    expect(b.licenseKey).toBe('LCR-ABCD-EFGH-IJKL-MNOP'); // in memory only, for lookup
    expect(JSON.stringify(b.payload)).not.toContain('EFGH');
  });

  it('truncates absurdly long field values', () => {
    const b = normalizeBeacon({ project: 'x'.repeat(5000) });
    expect(b.project!.length).toBe(512);
  });

  it('coerces a numeric field to a string rather than dropping it', () => {
    const b = normalizeBeacon({ buildId: 99123 });
    expect(b.deployment_id).toBe('99123');
  });
});

describe('redactLicenseKeys', () => {
  it('redacts nested keys', () => {
    const out = redactLicenseKeys({ license: { key: 'LCR-ABCD-EFGH-IJKL-MNOP' }, safe: 'value' });
    expect(out.license.key).toBe('LCR-ABCD…');
    expect(out.safe).toBe('value');
  });

  it('redacts inside arrays', () => {
    const out = redactLicenseKeys({ items: [{ license_key: 'LCR-ABCD-EFGH-IJKL-MNOP' }] });
    expect(out.items[0].license_key).toBe('LCR-ABCD…');
  });

  it('leaves a short value alone rather than adding a misleading ellipsis', () => {
    expect(redactLicenseKeys({ key: 'abc' }).key).toBe('abc');
  });
});
