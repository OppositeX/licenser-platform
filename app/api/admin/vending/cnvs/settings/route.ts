/**
 * /api/admin/vending/cnvs/settings — vending tools settings.get + settings.update.
 *
 *   GET   settings.get    (scope settings:read)  — live cnvs.* pricing, for diffing.
 *   PATCH settings.update  (scope settings:write) — write one or more sections,
 *         contract-validated and REFUSE-WHOLE: if any section is invalid nothing
 *         is written (cnvs-4 discards a bad payload wholesale, so a partial write
 *         is worse than none). dry_run:true validates and reports, writes nothing.
 *
 *   body (PATCH): { sections: { credits?, rateCard?, plans?, packs?, dev?,
 *                   graceDays?, fairUse?, entitlement? }, dry_run? }
 *   401 unauthorized · 403 insufficient_scope · 400 { reason:'INVALID', errors }
 */
import { requireScopedToken } from '@/lib/admin-api/auth';
import { audit } from '@/lib/admin-api/audit';
import { readCnvsSettings } from '@/lib/admin-api/cnvs-settings-read';
import { CNVS_SECTIONS, validateCnvsSection, type CnvsSection } from '@/lib/cnvs/settings';
import { CnvsValidationError, writeCnvsSections } from '@/lib/cnvs/store';

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

export async function PATCH(req: Request) {
  const auth = await requireScopedToken(req, 'settings:write');
  if (!auth.ok) return auth.response;
  const { id: token_id, prefix: token_prefix } = auth.token;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch {
    return Response.json({ ok: false, reason: 'BAD_BODY', message: 'body must be JSON' }, { status: 400 });
  }
  const dry_run = body.dry_run === true;
  const raw = (body.sections && typeof body.sections === 'object' ? body.sections : {}) as Record<string, unknown>;

  // Only recognised sections; an unknown key is refused (never silently ignored).
  const unknown = Object.keys(raw).filter((k) => !(CNVS_SECTIONS as string[]).includes(k));
  if (unknown.length) {
    await audit({ token_id, token_prefix, tool: 'settings.update', scope: 'settings:write', dry_run, ok: false, status: 400, args: { unknown } });
    return Response.json({ ok: false, reason: 'UNKNOWN_SECTION', message: 'unknown section(s): ' + unknown.join(', '), known: CNVS_SECTIONS }, { status: 400 });
  }
  const sections = raw as Partial<Record<CnvsSection, unknown>>;
  const keys = Object.keys(sections) as CnvsSection[];
  if (keys.length === 0) {
    return Response.json({ ok: false, reason: 'MISSING_FIELD', message: 'sections: provide at least one section to update' }, { status: 400 });
  }

  // Refuse-whole: validate every section up front; a single error aborts all.
  const errors: string[] = [];
  for (const k of keys) errors.push(...validateCnvsSection(k, sections[k]));
  if (errors.length) {
    await audit({ token_id, token_prefix, tool: 'settings.update', scope: 'settings:write', dry_run, ok: false, status: 400, args: { sections: keys, errors } });
    return Response.json({ ok: false, reason: 'INVALID', message: 'validation failed — nothing written', errors }, { status: 400 });
  }

  if (dry_run) {
    await audit({ token_id, token_prefix, tool: 'settings.update', scope: 'settings:write', dry_run: true, ok: true, status: 200, args: { sections: keys } });
    return Response.json({ ok: true, dry_run: true, would_change: keys }, { headers: { 'cache-control': 'no-store' } });
  }

  try {
    const { changed } = await writeCnvsSections(sections, `token:${token_prefix}`);
    await audit({ token_id, token_prefix, tool: 'settings.update', scope: 'settings:write', dry_run: false, ok: true, status: 200, args: { changed } });
    return Response.json({ ok: true, changed }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof CnvsValidationError) {
      await audit({ token_id, token_prefix, tool: 'settings.update', scope: 'settings:write', dry_run: false, ok: false, status: 400, args: { errors: e.errors } });
      return Response.json({ ok: false, reason: 'INVALID', message: 'validation failed — nothing written', errors: e.errors }, { status: 400 });
    }
    await audit({ token_id, token_prefix, tool: 'settings.update', scope: 'settings:write', dry_run: false, ok: false, status: 500, error: e instanceof Error ? e.message : String(e) });
    return Response.json({ ok: false, reason: 'WRITE_FAILED', message: e instanceof Error ? e.message : 'write failed' }, { status: 500 });
  }
}
