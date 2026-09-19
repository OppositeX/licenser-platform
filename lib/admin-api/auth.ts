/**
 * Scoped bearer-token auth for the CNVS vending API.
 *
 * The CNVS side registers a least-privilege token (never our service role).
 * Each endpoint declares the scope it needs; a token without that scope is
 * refused 403. Tokens are stored only as sha256 hashes — the raw value is
 * shown once at mint time and never again.
 */
import crypto from 'node:crypto';
import { serviceClient } from '@/lib/supabase/service';

export const VENDING_SCOPES = [
  'settings:read',
  'settings:write',
  'license:read',
  'license:write',
  'credits:grant',
  'events:read',
] as const;
export type VendingScope = (typeof VENDING_SCOPES)[number];

export interface TokenRecord { id: string; prefix: string; scopes: string[] }

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw.trim()).digest('hex');
}

/** Mint a fresh raw token. Returned once; only its hash is stored. */
export function mintToken(): { raw: string; hash: string; prefix: string } {
  const raw = 'lvk_' + crypto.randomBytes(24).toString('hex');
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 12) };
}

/**
 * Resolve a Bearer token to its record if it is present and active, regardless
 * of scope. Used to gate MCP `initialize` / `tools/list` (which need a valid
 * caller but no specific scope); per-tool scope is still enforced downstream.
 */
export async function resolveToken(req: Request): Promise<TokenRecord | null> {
  const header = req.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const hash = hashToken(m[1]);
  type Row = { id: string; prefix: string; scopes: string[]; active: boolean };
  try {
    const { data } = await serviceClient()
      .from('api_tokens')
      .select('id, prefix, scopes, active')
      .eq('token_hash', hash)
      .maybeSingle();
    const row = (data as Row | null) ?? null;
    if (!row || !row.active) return null;
    return { id: row.id, prefix: row.prefix, scopes: row.scopes };
  } catch {
    return null;
  }
}

function unauthorized(message: string, status = 401) {
  return new Response(JSON.stringify({ ok: false, error: status === 403 ? 'insufficient_scope' : 'unauthorized', message }), {
    status,
    headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
  });
}

export type AuthOutcome =
  | { ok: true; token: TokenRecord }
  | { ok: false; response: Response };

/**
 * Verify the Bearer token and that it carries `requiredScope`. On success,
 * bumps last_used_at (best-effort) and returns the token record.
 */
export async function requireScopedToken(req: Request, requiredScope: VendingScope): Promise<AuthOutcome> {
  const header = req.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, response: unauthorized('Bearer token required') };

  const hash = hashToken(m[1]);
  type Row = { id: string; prefix: string; scopes: string[]; active: boolean };
  let row: Row | null = null;
  try {
    const { data } = await serviceClient()
      .from('api_tokens')
      .select('id, prefix, scopes, active')
      .eq('token_hash', hash)
      .maybeSingle();
    row = (data as Row | null) ?? null;
  } catch {
    return { ok: false, response: unauthorized('token check failed', 500) };
  }

  if (!row || !row.active) return { ok: false, response: unauthorized('invalid or revoked token') };
  if (!row.scopes.includes(requiredScope)) {
    return { ok: false, response: unauthorized(`token lacks scope "${requiredScope}"`, 403) };
  }

  // Best-effort last-used bump; never blocks the request.
  serviceClient().from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id).then(
    () => {}, () => {},
  );

  return { ok: true, token: { id: row.id, prefix: row.prefix, scopes: row.scopes } };
}
