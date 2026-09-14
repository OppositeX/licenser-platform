/**
 * GET /api/v2/status — service status for the cnvs-4 status surface.
 *
 * Public, `Cache-Control: public, max-age=60`. A status page that lags an
 * outage by five minutes is worse than useless, so this caches for a minute
 * rather than the settings endpoint's five.
 *
 * Response:
 *   { ok: true,
 *     status: "operational" | "maintenance" | "degraded" | "partial_outage" | "major_outage",
 *     updated_at: "…",
 *     components: [ { key, name, description, status, updated_at } ],
 *     incidents:  [ { id, title, status, impact, components, started_at, updated_at } ],
 *     incident_count: 0 }
 *
 * `status` is the worst of the component statuses and the floor implied by any
 * open incident's impact — see rollUpStatus in lib/cnvs/status.ts.
 *
 * If the database read fails we answer 200 with status "degraded" and an
 * explicit `stale: true`, because the one moment this endpoint matters most is
 * the moment our own backend is unwell.
 */
import { publicJson, preflight } from '@/lib/cnvs/http';
import { readComponents, readUnresolvedIncidents, rollUpStatus, publicIncident } from '@/lib/cnvs/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_SECONDS = 60;

export function OPTIONS() {
  return preflight();
}

export async function GET() {
  try {
    const [components, incidents] = await Promise.all([
      readComponents(),
      readUnresolvedIncidents(),
    ]);

    const status = rollUpStatus(components, incidents);
    const stamps = [
      ...components.map((c) => c.updated_at),
      ...incidents.map((i) => i.updated_at),
    ].filter(Boolean).sort();

    return publicJson({
      ok: true,
      status,
      updated_at: stamps.length > 0 ? stamps[stamps.length - 1] : new Date().toISOString(),
      components: components.map((c) => ({
        key: c.key,
        name: c.name,
        description: c.description,
        status: c.status,
        updated_at: c.updated_at,
      })),
      incidents: incidents.map(publicIncident),
      incident_count: incidents.length,
    }, { maxAge: CACHE_SECONDS });
  } catch {
    return publicJson({
      ok: true,
      status: 'degraded',
      stale: true,
      updated_at: new Date().toISOString(),
      components: [],
      incidents: [],
      incident_count: 0,
    }, { maxAge: CACHE_SECONDS });
  }
}
