/**
 * GET /api/v2/cnvs/settings — CNVS pricing, read by cnvs-4 every five minutes.
 * PRC-007 / PRC-008.
 *
 * Public, no auth, `Cache-Control: public, max-age=300`.
 *
 * The numbers come from the `cnvs.*` rows in public.settings (editable at
 * /admin/cnvs), NOT from constants — changing a price must not require a CNVS
 * deploy. lib/cnvs/settings.ts holds the fallback values for a missing or
 * malformed row and documents the contract cnvs-4 enforces on this payload.
 *
 * Response:
 *   { ok: true,
 *     settings: { plans, credits, rateCard, packs, dev, graceDays, fairUse, entitlement },
 *     updated_at: "2026-09-14T…" | null,   // newest cnvs.* row, for cache debugging
 *     source: "store" | "defaults" | "fallback" }
 *
 * `settings` carries exactly the documented keys and nothing else; metadata
 * stays at the top level so it can never be mistaken for a pricing key.
 *
 * WHY THE VALIDATION PASS BELOW EXISTS: cnvs-4 discards this payload whole if
 * it breaks any contract rule, silently reverting to its own defaults. A
 * response that trips a rule therefore looks healthy from here and changes
 * nothing in the product. Anything that would be discarded is turned into
 * defaults plus a logged fault instead, so the failure is visible to us and
 * the customer still gets priced.
 */
import { readCnvsSettings } from '@/lib/cnvs/store';
import { cnvsDefaults, validateCnvsSettings } from '@/lib/cnvs/settings';
import { publicJson, preflight } from '@/lib/cnvs/http';
import { db } from '@/lib/licenser/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 300;

export function OPTIONS() {
  return preflight();
}

export async function GET() {
  const snapshot = await readCnvsSettings();

  // A malformed stored row already degraded to that section's default inside
  // buildCnvsSettings; log it so an admin can see a price is not being served.
  if (snapshot.degraded.length > 0) {
    await logFault('cnvs settings section(s) fell back to defaults', {
      degraded: snapshot.degraded,
    });
  }

  // Belt-and-braces: never emit something cnvs-4 would throw away.
  const check = validateCnvsSettings(snapshot.settings);
  if (!check.ok) {
    await logFault('assembled cnvs settings payload failed contract validation', {
      errors: check.errors,
      source: snapshot.source,
    });
    return publicJson(
      { ok: true, settings: cnvsDefaults(), updated_at: null, source: 'fallback' },
      { maxAge: CACHE_SECONDS },
    );
  }

  return publicJson(
    {
      ok: true,
      settings: snapshot.settings,
      updated_at: snapshot.updated_at,
      source: snapshot.source,
    },
    { maxAge: CACHE_SECONDS },
  );
}

/** Best-effort — a logging failure must never take the pricing endpoint down. */
async function logFault(message: string, context: Record<string, unknown>) {
  try {
    await db().from('logs').insert({ level: 'error', channel: 'cnvs', message, context });
  } catch {
    console.error(`[cnvs/settings] ${message}`, context);
  }
}
