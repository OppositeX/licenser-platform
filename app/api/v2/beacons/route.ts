/**
 * POST /api/v2/beacons — deployment beacons from CNVS runtimes (DET-001).
 *
 * Accepts any JSON object. The whole body is stored in cnvs_beacons.payload;
 * recognised fields are also projected into columns for indexing and the admin
 * list at /admin/cnvs/beacons. See lib/cnvs/beacons.ts for why the shape is
 * treated as unconfirmed.
 *
 * Response: { ok: true, id } — 202, because the beacon is recorded and the
 * caller has nothing to act on. A runtime must never block a deploy on us, so
 * a storage failure answers 202 with `stored: false` rather than a 5xx; the
 * fault is logged on our side instead.
 *
 * A license key in the body is used to resolve the license and is then reduced
 * to its 8-character prefix — the full key is never written to this table.
 *
 * Not cached (Cache-Control: no-store) and rate limited per IP.
 */
import { publicJson, preflight } from '@/lib/cnvs/http';
import { normalizeBeacon } from '@/lib/cnvs/beacons';
import { db } from '@/lib/licenser/db';
import { rateLimit } from '@/lib/licenser/ratelimit';
import { readClientIp } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A runtime beaconing more than twice a second per IP is a loop, not a deploy. */
const RATE_LIMIT_PER_MINUTE = 120;
/** Bodies above this are truncated away — a beacon is metadata, not a payload dump. */
const MAX_BODY_BYTES = 64 * 1024;

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  const ip = readClientIp(req) || null;

  const rl = rateLimit(`beacon:${ip || 'noip'}`, RATE_LIMIT_PER_MINUTE, 60_000);
  if (!rl.ok) {
    return publicJson(
      { ok: false, error: 'RATE_LIMITED' },
      { status: 429, extra: { 'Retry-After': String(Math.ceil(rl.resetIn / 1000)) } },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return publicJson({ ok: false, error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
  }

  let body: unknown;
  try { body = raw ? JSON.parse(raw) : {}; } catch {
    return publicJson({ ok: false, error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return publicJson({ ok: false, error: 'INVALID_BODY', message: 'expected a JSON object' }, { status: 400 });
  }

  const beacon = normalizeBeacon(body as Record<string, unknown>);

  // Resolve the license from the full key, then drop it. Never persisted.
  let licenseId: string | null = null;
  if (beacon.licenseKey) {
    try {
      const { data } = await db()
        .from('licenses')
        .select('id')
        .eq('key', beacon.licenseKey)
        .maybeSingle();
      licenseId = (data as { id: string } | null)?.id ?? null;
    } catch {
      // A lookup failure must not cost us the beacon.
    }
  }

  try {
    const { data, error } = await db()
      .from('cnvs_beacons')
      .insert({
        deployment_id:      beacon.deployment_id,
        project:            beacon.project,
        environment:        beacon.environment,
        runtime:            beacon.runtime,
        version:            beacon.version,
        commit_sha:         beacon.commit_sha,
        url:                beacon.url,
        region:             beacon.region,
        event:              beacon.event,
        status:             beacon.status,
        license_key_prefix: beacon.license_key_prefix,
        license_id:         licenseId,
        fingerprint:        beacon.fingerprint,
        ip,
        user_agent:         req.headers.get('user-agent')?.slice(0, 512) ?? null,
        payload:            beacon.payload,
      })
      .select('id')
      .single();
    if (error) throw error;

    return publicJson({ ok: true, id: (data as { id: string }).id, stored: true }, { status: 202 });
  } catch (err) {
    // Record the beacon we could not store, then still answer 202 — a CNVS
    // deploy is not something to fail over our storage.
    try {
      await db().from('logs').insert({
        level: 'error',
        channel: 'cnvs',
        message: 'beacon insert failed',
        context: { error: String((err as Error)?.message ?? err), payload: beacon.payload },
      });
    } catch {
      console.error('[cnvs/beacons] insert failed', err);
    }
    return publicJson({ ok: true, stored: false }, { status: 202 });
  }
}
