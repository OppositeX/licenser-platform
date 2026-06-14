/**
 * /api/webhooks/woocommerce — Receives WooCommerce webhooks from gloo.ooo,
 * verifies the HMAC-SHA256 signature (WC sends `X-WC-Webhook-Signature`),
 * routes by topic, then issues / revokes licenses.
 *
 * Supported topics:
 *   - order.completed           → issue license + send email
 *   - order.refunded            → revoke license
 *   - subscription.created      → issue license (with trial_end if present)
 *   - subscription.updated      → re-issue if plan changed; renew expires_at
 *   - subscription.cancelled    → revoke license
 *
 * Setup: in WC → Settings → Advanced → Webhooks, set delivery URL to
 *   https://licenser-platform.vercel.app/api/webhooks/woocommerce
 * and Secret to whatever you put in `WC_WEBHOOK_SECRET`.
 *
 * Without `WC_WEBHOOK_SECRET` set, the route rejects all calls with 503 —
 * fail-safe so an unconfigured prod doesn't silently accept unsigned input.
 */
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/licenser/db';
import { issueLicense, setLicenseStatusByWooSub, setLicenseStatusByWooOrder } from '@/lib/licenser/issuance';
import { sendEmail } from '@/lib/email';
import { renderLicenseIssuedEmail } from '@/lib/email/templates/license-issued';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifyWcSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  // WC sends base64-encoded HMAC-SHA256.
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Walk a WC order/subscription payload and find the first line item whose
 * product_id (or variation_id) matches a row in `plans.woo_product_id`.
 * Falls back to `products.woo_product_id` for non-subscription one-time
 * purchases that don't carry a plan distinction.
 */
async function resolvePlanFromLineItems(items: Array<{ product_id?: number; variation_id?: number; name?: string }>): Promise<{ planId: string; productId: string; planSlug: string } | null> {
  if (!items?.length) return null;
  const ids: string[] = [];
  for (const it of items) {
    if (it.product_id)   ids.push(String(it.product_id));
    if (it.variation_id) ids.push(String(it.variation_id));
  }
  if (!ids.length) return null;

  const supa = db();
  const { data: plan } = await supa.from('plans').select('id,slug,product_id').in('woo_product_id', ids).maybeSingle();
  if (plan) return { planId: plan.id, productId: plan.product_id, planSlug: plan.slug };

  // No plan match — try product-level mapping; pick its first plan as default.
  const { data: prod } = await supa.from('products').select('id').in('woo_product_id', ids).maybeSingle();
  if (prod) {
    const { data: firstPlan } = await supa.from('plans').select('id,slug,product_id').eq('product_id', prod.id).order('price_cents').limit(1).maybeSingle();
    if (firstPlan) return { planId: firstPlan.id, productId: firstPlan.product_id, planSlug: firstPlan.slug };
  }
  return null;
}

interface WcBilling { email?: string; first_name?: string; last_name?: string; }
interface WcOrder { id?: number; status?: string; billing?: WcBilling; line_items?: Array<{ product_id?: number; variation_id?: number; name?: string }>; total?: string; }
interface WcSubscription extends WcOrder { trial_end_date_gmt?: string; next_payment_date_gmt?: string; end_date_gmt?: string; }

export async function POST(req: Request) {
  const secret = process.env.WC_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook_unconfigured', message: 'WC_WEBHOOK_SECRET not set' }, { status: 503 });
  }

  const raw = await req.text();
  const sigHeader = req.headers.get('x-wc-webhook-signature');
  if (!verifyWcSignature(raw, sigHeader, secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const topic = (req.headers.get('x-wc-webhook-topic') ?? '').toLowerCase();
  let payload: WcOrder | WcSubscription;
  try { payload = JSON.parse(raw); } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // Log the inbound webhook for traceability regardless of branch.
  await db().from('events').insert({
    type: `woocommerce.${topic || 'unknown'}`,
    data: { id: payload.id, status: payload.status, total: (payload as any).total ?? null },
  });

  const email = payload.billing?.email?.toLowerCase();
  const name = [payload.billing?.first_name, payload.billing?.last_name].filter(Boolean).join(' ') || null;
  const orderOrSubId = payload.id ? String(payload.id) : null;

  // Topic routing.
  if (topic === 'order.completed' || topic === 'subscription.created') {
    if (!email || !orderOrSubId) {
      return NextResponse.json({ error: 'missing_customer_or_id' }, { status: 400 });
    }
    const mapped = await resolvePlanFromLineItems(payload.line_items ?? []);
    if (!mapped) {
      return NextResponse.json({ error: 'unmapped_product', message: 'No plans.woo_product_id matches the order line items. Set the mapping in /admin/products.' }, { status: 422 });
    }

    const trialEnd = (payload as WcSubscription).trial_end_date_gmt
      ? new Date((payload as WcSubscription).trial_end_date_gmt + 'Z').toISOString()
      : null;
    const nextPayment = (payload as WcSubscription).next_payment_date_gmt
      ? new Date((payload as WcSubscription).next_payment_date_gmt + 'Z').toISOString()
      : null;

    const issued = await issueLicense({
      planId: mapped.planId,
      productId: mapped.productId,
      customerEmail: email,
      customerName: name,
      wooOrderId: topic === 'order.completed' ? orderOrSubId : null,
      wooSubscriptionId: topic === 'subscription.created' ? orderOrSubId : null,
      expiresAt: nextPayment,
      trialEndsAt: trialEnd,
    });

    if (issued.isNew) {
      const tmpl = renderLicenseIssuedEmail({
        productName: issued.product.name,
        productSlug: issued.product.slug,
        customerName: name,
        licenseKey: issued.license.key,
        planName: issued.plan?.name ?? 'License',
        expiresAt: issued.license.expires_at,
        trialDays: trialEnd ? 14 : 0,
      });
      const sent = await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text, tag: 'license-issued' });
      await db().from('events').insert({
        type: 'email.license_issued',
        license_id: issued.license.id,
        product_id: issued.product ? mapped.productId : null,
        data: { provider: sent.provider, ok: sent.ok, error: sent.error ?? null },
      });
    }

    return NextResponse.json({ ok: true, license_id: issued.license.id, key_prefix: issued.license.key.slice(0, 8), is_new: issued.isNew });
  }

  if (topic === 'subscription.updated') {
    if (!orderOrSubId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    const nextPayment = (payload as WcSubscription).next_payment_date_gmt
      ? new Date((payload as WcSubscription).next_payment_date_gmt + 'Z').toISOString()
      : null;
    // Renew expires_at; status -> active (handles trial → paid transition).
    const { data, error } = await db()
      .from('licenses')
      .update({ status: 'active', expires_at: nextPayment })
      .eq('woo_subscription_id', orderOrSubId)
      .select('id');
    if (error) return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
  }

  if (topic === 'subscription.cancelled') {
    if (!orderOrSubId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    const r = await setLicenseStatusByWooSub(orderOrSubId, 'revoked', 'subscription cancelled');
    return NextResponse.json({ ok: true, ...r });
  }

  if (topic === 'order.refunded') {
    if (!orderOrSubId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    const r = await setLicenseStatusByWooOrder(orderOrSubId, 'revoked', 'order refunded');
    return NextResponse.json({ ok: true, ...r });
  }

  // Unknown topic — accept (200) so WC doesn't retry forever, but record it.
  return NextResponse.json({ ok: true, ignored: true, topic });
}
