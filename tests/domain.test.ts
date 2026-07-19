import { describe, it, expect, afterEach } from 'vitest';
import { normalizeDomain } from '@/lib/licenser/domain';
import { isAllowedDomain } from '@/lib/licenser/validate';

describe('normalizeDomain', () => {
  it('strips scheme, www, path and port', () => {
    expect(normalizeDomain('https://www.Example.com/path')).toBe('example.com');
    expect(normalizeDomain('Example.COM')).toBe('example.com');
    expect(normalizeDomain('example.com:8080')).toBe('example.com');
    expect(normalizeDomain('http://sub.example.com')).toBe('sub.example.com');
  });
  it('returns empty string for unusable input', () => {
    expect(normalizeDomain('')).toBe('');
    expect(normalizeDomain('   ')).toBe('');
  });
});

describe('isAllowedDomain (dev-only bypass)', () => {
  const origEnv = process.env.LICENSER_DEV_DOMAINS;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.LICENSER_DEV_DOMAINS;
    else process.env.LICENSER_DEV_DOMAINS = origEnv;
  });

  it('allows localhost / 127.0.0.1 / .local', () => {
    expect(isAllowedDomain('localhost')).toBe(true);
    expect(isAllowedDomain('localhost:3000')).toBe(true);
    expect(isAllowedDomain('127.0.0.1')).toBe(true);
    expect(isAllowedDomain('cnvs.local')).toBe(true);
  });

  it('NO LONGER blanket-allows *.vercel.app (the old seat-bypass hole)', () => {
    delete process.env.LICENSER_DEV_DOMAINS;
    expect(isAllowedDomain('cnvs-preview.vercel.app')).toBe(false);
    expect(isAllowedDomain('example.com')).toBe(false);
  });

  it('honours an explicit LICENSER_DEV_DOMAINS suffix allowlist', () => {
    process.env.LICENSER_DEV_DOMAINS = '.previews.gloo.ooo,.vercel.app';
    expect(isAllowedDomain('x.previews.gloo.ooo')).toBe(true);
    expect(isAllowedDomain('cnvs-preview.vercel.app')).toBe(true);
    expect(isAllowedDomain('evil.com')).toBe(false);
  });
});
