import { describe, it, expect, beforeAll } from 'vitest';

// signer.secret() reads the env at call time, so setting it here is enough.
beforeAll(() => {
  process.env.LICENSER_SDK_HMAC_SECRET = 'test-secret-please-ignore';
});

import { issue, verify, verifyHmacRaw } from '@/lib/licenser/signer';
import crypto from 'node:crypto';

describe('signer', () => {
  it('round-trips claims', () => {
    const token = issue({ license_id: 'abc', scope: 'download' }, 600);
    const res = verify(token);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.claims.license_id).toBe('abc');
      expect(res.claims.scope).toBe('download');
      expect(typeof res.claims.exp).toBe('number');
    }
  });

  it('rejects a tampered payload', () => {
    const token = issue({ license_id: 'abc' }, 600);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ license_id: 'evil', exp: 9999999999 }))
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = verify(`${forged}.${sig}`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('bad_signature');
    // sanity: original still valid
    expect(verify(`${payload}.${sig}`).ok).toBe(true);
  });

  it('rejects a malformed token', () => {
    expect(verify('not-a-token').ok).toBe(false);
    expect(verify('a.b.c').ok).toBe(false);
  });

  it('rejects an expired token', () => {
    // ttl is clamped to a 30s minimum; forge an already-expired exp instead.
    const past = { scope: 'download', iat: 1, exp: 2, nonce: 'x' };
    const payload = Buffer.from(JSON.stringify(past)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const sig = crypto.createHmac('sha256', process.env.LICENSER_SDK_HMAC_SECRET!)
      .update(payload).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = verify(`${payload}.${sig}`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('token_expired');
  });

  it('verifyHmacRaw validates a GitHub-style sha256= header', () => {
    const body = '{"hello":"world"}';
    const secret = 'wh-secret';
    const hex = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacRaw(body, `sha256=${hex}`, secret)).toBe(true);
    expect(verifyHmacRaw(body, `sha256=${hex}`, 'wrong')).toBe(false);
    expect(verifyHmacRaw('tampered', `sha256=${hex}`, secret)).toBe(false);
  });
});
