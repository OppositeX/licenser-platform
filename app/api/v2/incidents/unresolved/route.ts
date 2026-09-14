/**
 * GET /api/v2/incidents/unresolved — open incidents for the cnvs-4 status surface.
 *
 * Public, `Cache-Control: public, max-age=60`, same reasoning as /api/v2/status.
 * Unresolved means `resolved_at is null and status <> 'resolved'`.
 *
 * Response: { ok: true, incidents: [ … ], count: n }
 *
 * An empty list is the healthy answer, so a read failure must not be reported
 * as "no incidents" — it answers 200 with `stale: true` and an empty list, and
 * the caller can tell the two apart.
 */
import { publicJson, preflight } from '@/lib/cnvs/http';
import { readUnresolvedIncidents, publicIncident } from '@/lib/cnvs/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 60;

export function OPTIONS() {
  return preflight();
}

export async function GET() {
  try {
    const incidents = await readUnresolvedIncidents();
    return publicJson({
      ok: true,
      incidents: incidents.map(publicIncident),
      count: incidents.length,
    }, { maxAge: CACHE_SECONDS });
  } catch {
    return publicJson({ ok: true, stale: true, incidents: [], count: 0 }, { maxAge: CACHE_SECONDS });
  }
}
