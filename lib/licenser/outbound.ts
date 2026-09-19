/**
 * Outbound webhooks — fire signed license-lifecycle events to customer-configured
 * endpoints. Best-effort: this must NEVER throw into or slow down the main flow.
 *
 * Signature: header `X-Licenser-Signature: sha256=<hex hmac of the raw body>`,
 * keyed on the per-endpoint secret. Event name in `X-Licenser-Event`.
 *
 * Two entry points:
 *   - `dispatchOutbound`        — fire-and-forget; used by the license lifecycle.
 *   - `dispatchOutboundCollect` — same fan-out but returns per-endpoint delivery
 *     results, so a caller (e.g. the vending credits.grant API) can report and
 *     react to what actually happened. `buildOutboundPayload` / `listOutboundTargets`
 *     let that caller preview a delivery (dry-run) without signing or sending.
 */
import crypto from 'node:crypto';
import { db } from './db';

export const OUTBOUND_EVENTS = [
  'license.issued',
  'license.activated',
  'license.deactivated',
  'license.revoked',
  'license.suspended',
  'license.expired',
  'license.renewed',
  'license.credits_purchased',
] as const;

interface Hook { id: string; url: string; secret: string; events: string[] }
export interface DispatchCtx { license_id?: string | null; product_id?: string | null; data?: Record<string, unknown> }

export interface DeliveryResult {
  hook_id: string;
  url: string;
  status: 'ok' | 'error';
  status_code: number | null;
  error: string | null;
  duration_ms: number;
}

/** The exact JSON string sent as the request body for `event` + `ctx`. */
export function buildOutboundPayload(event: string, ctx: DispatchCtx = {}): string {
  return JSON.stringify({
    event,
    license_id: ctx.license_id ?? null,
    product_id: ctx.product_id ?? null,
    data: ctx.data ?? {},
    sent_at: new Date().toISOString(),
  });
}

/** Active endpoints subscribed to `event` (via explicit name or `*`). */
export async function listOutboundTargets(event: string): Promise<Array<{ id: string; url: string }>> {
  const { data: hooks } = await db()
    .from('outbound_webhooks')
    .select('id,url,secret,events')
    .eq('active', true);
  return ((hooks ?? []) as Hook[])
    .filter((h) => (h.events ?? []).includes('*') || (h.events ?? []).includes(event))
    .map((h) => ({ id: h.id, url: h.url }));
}

/**
 * Fan out `event` to every subscribed endpoint and return each delivery result.
 * Unlike `dispatchOutbound`, this surfaces failures to the caller (it still logs
 * each attempt and never throws for a single endpoint's failure).
 */
export async function dispatchOutboundCollect(
  event: string,
  ctx: DispatchCtx = {},
): Promise<{ targets: number; results: DeliveryResult[] }> {
  const { data: hooks } = await db()
    .from('outbound_webhooks')
    .select('id,url,secret,events')
    .eq('active', true);

  const targets = ((hooks ?? []) as Hook[]).filter((h) => {
    const evts = h.events ?? [];
    return evts.includes('*') || evts.includes(event);
  });
  if (targets.length === 0) return { targets: 0, results: [] };

  const payload = buildOutboundPayload(event, ctx);
  const settled = await Promise.all(
    targets.map((h) => deliver(h, event, ctx.license_id ?? null, payload)),
  );
  return { targets: targets.length, results: settled };
}

/** Fire-and-forget lifecycle dispatch — never throws into or slows the main flow. */
export async function dispatchOutbound(event: string, ctx: DispatchCtx = {}): Promise<void> {
  try {
    await dispatchOutboundCollect(event, ctx);
  } catch {
    // Outbound delivery is never allowed to break license issuance/validation.
  }
}

async function deliver(hook: Hook, event: string, licenseId: string | null, payload: string): Promise<DeliveryResult> {
  const sig = 'sha256=' + crypto.createHmac('sha256', hook.secret).update(payload).digest('hex');
  const started = Date.now();
  let status: 'ok' | 'error' = 'error';
  let code: number | null = null;
  let err: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Licenser-Webhooks/1.0',
          'x-licenser-event': event,
          'x-licenser-signature': sig,
        },
        body: payload,
        signal: controller.signal,
      });
      code = res.status;
      status = res.ok ? 'ok' : 'error';
      if (!res.ok) err = `HTTP ${res.status}`;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    err = e instanceof Error ? e.message.slice(0, 300) : 'delivery failed';
  }

  const duration_ms = Date.now() - started;
  try {
    await db().from('outbound_webhook_deliveries').insert({
      webhook_id: hook.id, event, license_id: licenseId,
      status, status_code: code, attempts: 1, duration_ms, error: err,
    });
  } catch { /* logging failure must not surface */ }

  return { hook_id: hook.id, url: hook.url, status, status_code: code, error: err, duration_ms };
}
