import crypto from 'node:crypto';

function base64urlEncode(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function secret(): string {
  const s = process.env.LICENSER_SDK_HMAC_SECRET;
  if (!s) throw new Error('LICENSER_SDK_HMAC_SECRET is not set');
  return s;
}

export interface Claims {
  [k: string]: unknown;
  iat?: number;
  exp?: number;
  nonce?: string;
}

export function issue(claims: Claims, ttlSeconds = 600): string {
  const now = Math.floor(Date.now() / 1000);
  const payloadObj: Claims = {
    ...claims,
    iat: now,
    exp: now + Math.max(30, ttlSeconds),
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payload = base64urlEncode(Buffer.from(JSON.stringify(payloadObj), 'utf8'));
  const sig = base64urlEncode(crypto.createHmac('sha256', secret()).update(payload).digest());
  return payload + '.' + sig;
}

export function verify(token: string): { ok: true; claims: Claims } | { ok: false; error: string } {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'invalid_token_format' };
  const [payload, given] = parts;
  const expected = base64urlEncode(crypto.createHmac('sha256', secret()).update(payload).digest());
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return { ok: false, error: 'bad_signature' };
  }
  let claims: Claims;
  try {
    claims = JSON.parse(base64urlDecode(payload).toString('utf8'));
  } catch {
    return { ok: false, error: 'bad_payload' };
  }
  if (claims.exp && Math.floor(Date.now() / 1000) > claims.exp) {
    return { ok: false, error: 'token_expired' };
  }
  return { ok: true, claims };
}

export function verifyHmacRaw(body: string, headerSig: string, sharedSecret: string): boolean {
  let algo = 'sha256';
  let sigHex = headerSig;
  if (headerSig.includes('=')) {
    const [a, s] = headerSig.split('=', 2);
    algo = a;
    sigHex = s;
  }
  const expected = crypto.createHmac(algo, sharedSecret).update(body).digest('hex');
  if (expected.length !== sigHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHex));
}
