/**
 * GET /api/admin/vending/cnvs/settings — the first vending tool: settings.get.
 *
 * Scoped bearer auth (`settings:read`), read-only, audited. Returns the live
 * cnvs.* pricing settings assembled into the CNVS-side shape so the two teams
 * can diff instead of assert. Zero blast radius — no dependency on the pending
 * webhook-secret or per-seat decisions.
 *
 *   Authorization: Bearer <scoped token>
 *   200 { ok: true, settings: {...}, meta: { keys, missing, updated_at } }
 *   401 unauthorized · 403 insufficient_scope
 */
import { requireScopedToken } from '@/lib/admin-api/auth';
import { audit } from '@/lib/admin-api/audit';
import { readCnvsSettings } from '@/lib/admin-api/cnvs-settings-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireScopedToken(req, 'settings:read');
  if (!auth.ok) return auth.response;

  try {
    const { settings, meta } = await readCnvsSettings();
    await audit({
      token_id: auth.token.id, token_prefix: auth.token.prefix,
      tool: 'settings.get', scope: 'settings:read', ok: true, status: 200,
      args: { missing: meta.missing },
    });
    return Response.json({ ok: true, settings, meta }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    await audit({
      token_id: auth.token.id, token_prefix: auth.token.prefix,
      tool: 'settings.get', scope: 'settings:read', ok: false, status: 500,
      error: e instanceof Error ? e.message : String(e),
    });
    return Response.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
