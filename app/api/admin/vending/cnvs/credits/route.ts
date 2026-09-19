/**
 * POST /api/admin/vending/cnvs/credits — the vending tool: credits.grant.
 *
 * Dispatches a signed `license.credits_purchased` event (a credit-pack top-up)
 * to the subscribed outbound endpoint(s). Scoped bearer auth (`credits:grant`),
 * audited.
 *
 * Two hazards CNVS asked us to design in:
 *   1. Idempotency — keyed on `license_id:woo_order_id:sku`. A repeat call with
 *      the same order never re-dispatches; it replays the recorded result. This
 *      mirrors the CNVS receiver's own sourceRef dedupe, belt-and-braces.
 *   2. Dry-run — MUST NOT sign or send. `dry_run:true` returns exactly what
 *      WOULD be sent (payload + target endpoints) and writes nothing.
 *
 *   Authorization: Bearer <scoped token>
 *   body: { license_id, woo_order_id, credit_pack:{sku,credits,quantity?},
 *           customer_email?, product_slug?, plan_slug?, product_id?, dry_run? }
 *   200 granted / replayed / dry-run · 400 invalid · 401/403 auth
 *   422 no subscriber · 502 delivery failed
 */
import { requireScopedToken } from '@/lib/admin-api/auth';
import { audit } from '@/lib/admin-api/audit';
import { db } from '@/lib/licenser/db';
import {
  buildOutboundPayload,
  dispatchOutboundCollect,
  listOutboundTargets,
  type DispatchCtx,
} from '@/lib/licenser/outbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENT = 'license.credits_purchased';

function bad(message: string, status = 400) {
  return Response.json({ ok: false, error: status === 400 ? 'invalid_request' : 'error', message }, { status });
}
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const posInt = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

interface GrantRow {
  idempotency_key: string; license_id: string; woo_order_id: string; sku: string;
  credits: number; quantity: number; targets: number; delivered_ok: boolean;
  delivery_results: unknown; created_at: string;
}

export async function POST(req: Request) {
  const auth = await requireScopedToken(req, 'credits:grant');
  if (!auth.ok) return auth.response;
  const { id: token_id, prefix: token_prefix } = auth.token;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad('body must be JSON');
  }

  const license_id = s(body.license_id);
  const woo_order_id = s(body.woo_order_id);
  const pack = body.credit_pack && typeof body.credit_pack === 'object' ? (body.credit_pack as Record<string, unknown>) : null;
  const sku = pack ? s(pack.sku) : null;
  const credits = pack ? posInt(pack.credits) : null;
  const quantity = pack ? (posInt(pack.quantity) ?? 1) : 1;
  const dry_run = body.dry_run === true;

  const missing: string[] = [];
  if (!license_id) missing.push('license_id');
  if (!woo_order_id) missing.push('woo_order_id (idempotency key — must be stable per order)');
  if (!sku) missing.push('credit_pack.sku');
  if (credits === null) missing.push('credit_pack.credits (integer ≥ 0)');
  if (missing.length) {
    await audit({ token_id, token_prefix, tool: 'credits.grant', scope: 'credits:grant', dry_run, ok: false, status: 400, args: { missing } });
    return bad('missing/invalid: ' + missing.join(', '));
  }
  if (quantity < 1) return bad('credit_pack.quantity must be ≥ 1');
  if ((credits as number) * quantity === 0) return bad('grant amount is 0 (credits × quantity)');

  const idempotency_key = `${license_id}:${woo_order_id}:${sku}`;
  const ctx: DispatchCtx = {
    license_id,
    product_id: s(body.product_id),
    data: {
      license_id,
      product_slug: s(body.product_slug),
      plan_slug: s(body.plan_slug),
      customer_email: s(body.customer_email),
      woo_order_id,
      credit_pack: { sku, credits, quantity },
    },
  };

  // ── Dry-run: preview only, never sign or send, never write. ──────────────
  if (dry_run) {
    const [{ data: existing }, targets] = await Promise.all([
      db().from('vending_credit_grants').select('idempotency_key').eq('idempotency_key', idempotency_key).maybeSingle(),
      listOutboundTargets(EVENT),
    ]);
    const payload = JSON.parse(buildOutboundPayload(EVENT, ctx));
    await audit({ token_id, token_prefix, tool: 'credits.grant', scope: 'credits:grant', dry_run: true, ok: true, status: 200, args: { idempotency_key, amount: (credits as number) * quantity } });
    return Response.json({
      ok: true,
      dry_run: true,
      idempotency_key,
      duplicate: Boolean(existing),
      amount: (credits as number) * quantity,
      would_send: { event: EVENT, targets, payload },
    }, { headers: { 'cache-control': 'no-store' } });
  }

  // ── Idempotent replay: already granted this order → return prior result. ──
  const { data: prior } = await db()
    .from('vending_credit_grants')
    .select('idempotency_key,license_id,woo_order_id,sku,credits,quantity,targets,delivered_ok,delivery_results,created_at')
    .eq('idempotency_key', idempotency_key)
    .maybeSingle();
  if (prior) {
    const p = prior as GrantRow;
    await audit({ token_id, token_prefix, tool: 'credits.grant', scope: 'credits:grant', dry_run: false, ok: true, status: 200, args: { idempotency_key, replayed: true } });
    return Response.json({ ok: true, replayed: true, idempotency_key, grant: { credits: p.credits, quantity: p.quantity, amount: p.credits * p.quantity, delivered_ok: p.delivered_ok, created_at: p.created_at } });
  }

  // ── Fresh grant. Require a subscriber, then dispatch, then record success. ─
  // Recording only after a confirmed delivery keeps a failed attempt retryable.
  // A concurrent duplicate is safe: the CNVS receiver dedupes on the same key.
  const targets = await listOutboundTargets(EVENT);
  if (targets.length === 0) {
    await audit({ token_id, token_prefix, tool: 'credits.grant', scope: 'credits:grant', dry_run: false, ok: false, status: 422, args: { idempotency_key, reason: 'no_subscribers' } });
    return bad(`no active outbound endpoint is subscribed to "${EVENT}"`, 422);
  }

  const { targets: n, results } = await dispatchOutboundCollect(EVENT, ctx);
  const delivered_ok = n > 0 && results.every((r) => r.status === 'ok');

  if (!delivered_ok) {
    await audit({ token_id, token_prefix, tool: 'credits.grant', scope: 'credits:grant', dry_run: false, ok: false, status: 502, args: { idempotency_key, deliveries: results } });
    return Response.json({ ok: false, error: 'delivery_failed', idempotency_key, deliveries: results }, { status: 502 });
  }

  const payload = JSON.parse(buildOutboundPayload(EVENT, ctx));
  // On a unique-key conflict a concurrent call already recorded it — treat as replay.
  const { error: insErr } = await db().from('vending_credit_grants').insert({
    idempotency_key, license_id, woo_order_id, sku, credits, quantity,
    event_payload: payload, targets: n, delivered_ok, delivery_results: results,
    token_prefix, created_by: `token:${token_prefix}`,
  });
  const replayed = Boolean(insErr); // unique violation ⇒ another call won the race

  await audit({ token_id, token_prefix, tool: 'credits.grant', scope: 'credits:grant', dry_run: false, ok: true, status: 200, args: { idempotency_key, amount: (credits as number) * quantity, targets: n } });
  return Response.json({
    ok: true,
    granted: !replayed,
    replayed,
    idempotency_key,
    amount: (credits as number) * quantity,
    targets: n,
    deliveries: results,
  }, { headers: { 'cache-control': 'no-store' } });
}
