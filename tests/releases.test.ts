import { describe, it, expect } from 'vitest';
import { compareVersions, normalizeChannel } from '@/lib/licenser/releases';

describe('compareVersions', () => {
  it('orders by numeric parts', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0); // not lexical
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });
  it('handles differing lengths', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0);
  });
  it('tolerates junk parts', () => {
    expect(compareVersions('1.x', '1.0')).toBe(0);
  });
});

describe('normalizeChannel', () => {
  it('maps beta-ish inputs to beta', () => {
    for (const v of ['beta', 'rc', '1', 'true', 'BETA']) expect(normalizeChannel(v)).toBe('beta');
  });
  it('everything else is stable', () => {
    for (const v of ['stable', '', undefined, null, '0', 'false', 'nonsense']) expect(normalizeChannel(v)).toBe('stable');
  });
});
