/**
 * Outbound webhooks — fire signed license-lifecycle events to customer-configured
 * endpoints. Best-effort: this must NEVER throw into or slow down the main flow.
 *
 * Signature: header `X-Licenser-Signature: sha256=<hex hmac of the raw body>`,
 * keyed on the per-endpoint secret. Event name in `X-Licenser-Event`.
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
] as const;

interface Hook { id: string; url: string; secret: string; events: string[] }
interface DispatchCtx { license_id?: string | null; product_id?: string | null; data?: Record<string, unknown> }

export async function dispatchOutbound(event: string, ctx: DispatchCtx = {}): Promise<void> {
  try {
    const { data: hooks } = await db()
      .from('outbound_webhooks')
      .select('id,url,secret,events')
      .eq('active', true);

    const targets = ((hooks ?? []) as Hook[]).filter((h) => {
      const evts = h.events ?? [];
      return evts.includes('*') || evts.includes(event);
    });
    if (targets.length === 0) return;

    const payload = JSON.stringify({
      event,
      license_id: ctx.license_id ?? null,
      product_id: ctx.product_id ?? null,
      data: ctx.data ?? {},
      sent_at: new Date().toISOString(),
    });

    await Promise.allSettled(targets.map((h) => deliver(h, event, ctx.license_id ?? null, payload)));
  } catch {
    // Outbound delivery is never allowed to break license issuance/validation.
  }
}

async function deliver(hook: Hook, event: string, licenseId: string | null, payload: string): Promise<void> {
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

  try {
    await db().from('outbound_webhook_deliveries').insert({
      webhook_id: hook.id, event, license_id: licenseId,
      status, status_code: code, attempts: 1, duration_ms: Date.now() - started, error: err,
    });
  } catch { /* logging failure must not surface */ }
}
