/**
 * License issuance + revocation primitives. Called by both the WooCommerce
 * webhook and (eventually) the admin UI's "issue license" button.
 *
 * Key format: LCR-XXXX-XXXX-XXXX-XXXX (uppercase base36, dash-grouped).
 * Prefix `LCR-` chosen because Benny's admin UI uses `LIC-` for manually-
 * issued keys; this lets us tell webhook-issued vs hand-issued keys apart
 * at a glance.
 */
import crypto from 'node:crypto';
import { db, type LicenseRow } from './db';
import { dispatchOutbound } from './outbound';

export function generateLicenseKey(prefix = 'LCR'): string {
  const seg = () => {
    const bytes = crypto.randomBytes(5).toString('base64')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 4);
    return bytes.padEnd(4, 'X');
  };
  return `${prefix}-${seg()}-${seg()}-${seg()}-${seg()}`;
}

export interface IssueArgs {
  productSlug?: string;
  planSlug?: string;
  planId?: string;
  productId?: string;
  customerEmail: string;
  customerName?: string | null;
  wooOrderId?: string | null;
  wooSubscriptionId?: string | null;
  expiresAt?: string | null;         // ISO
  trialEndsAt?: string | null;       // ISO — when set, expires_at uses this
  maxActivationsOverride?: number;
}

export interface IssueResult {
  license: LicenseRow;
  plan: { slug: string; name: string; max_activations: number } | null;
  product: { slug: string; name: string };
  isNew: boolean;
}

/**
 * Resolve product+plan ids from slugs or accept ids directly. Returns null
 * for plan when no plan matches — issuance still works (license with no plan
 * = honor-system, won't get tier-mapped features).
 */
async function resolveProductPlan(args: IssueArgs) {
  const supa = db();
  let productId = args.productId ?? null;
  let productRow: any = null;
  if (!productId && args.productSlug) {
    const { data } = await supa.from('products').select('id,slug,name').eq('slug', args.productSlug).maybeSingle();
    if (data) { productId = data.id; productRow = data; }
  } else if (productId) {
    const { data } = await supa.from('products').select('id,slug,name').eq('id', productId).maybeSingle();
    productRow = data;
  }
  if (!productId || !productRow) throw new Error(`issuance: unknown product (slug=${args.productSlug ?? 'n/a'}, id=${args.productId ?? 'n/a'})`);

  let planId = args.planId ?? null;
  let planRow: any = null;
  if (!planId && args.planSlug) {
    const { data } = await supa.from('plans').select('id,slug,name,max_activations,feature_flags').eq('product_id', productId).eq('slug', args.planSlug).maybeSingle();
    if (data) { planId = data.id; planRow = data; }
  } else if (planId) {
    const { data } = await supa.from('plans').select('id,slug,name,max_activations,feature_flags').eq('id', planId).maybeSingle();
    planRow = data;
  }
  return { productId, productRow, planId, planRow };
}

/**
 * Issue a new license OR return the existing one if a license already
 * exists for this woo_order_id (idempotent — Woo retries webhooks).
 */
export async function issueLicense(args: IssueArgs): Promise<IssueResult> {
  const supa = db();
  const { productId, productRow, planId, planRow } = await resolveProductPlan(args);

  // Idempotency: dedupe by woo_order_id or woo_subscription_id when present.
  // WooCommerce retries webhooks, and a subscription purchase can arrive via
  // more than one topic, so both keys must be guarded.
  if (args.wooOrderId) {
    const { data: existing } = await supa.from('licenses').select('*').eq('woo_order_id', args.wooOrderId).maybeSingle();
    if (existing) {
      return { license: existing as LicenseRow, plan: planRow, product: productRow, isNew: false };
    }
  }
  if (args.wooSubscriptionId) {
    const { data: existing } = await supa.from('licenses').select('*').eq('woo_subscription_id', args.wooSubscriptionId).maybeSingle();
    if (existing) {
      return { license: existing as LicenseRow, plan: planRow, product: productRow, isNew: false };
    }
  }

  const max_activations = args.maxActivationsOverride ?? planRow?.max_activations ?? 1;
  const expires_at = args.trialEndsAt ?? args.expiresAt ?? null;

  const { data: created, error } = await supa.from('licenses').insert({
    product_id: productId,
    plan_id: planId,
    customer_email: args.customerEmail.toLowerCase(),
    customer_name: args.customerName ?? null,
    key: generateLicenseKey(),
    status: 'active',
    max_activations,
    expires_at,
    woo_order_id: args.wooOrderId ?? null,
    woo_subscription_id: args.wooSubscriptionId ?? null,
  }).select('*').single();
  if (error || !created) throw new Error(`issueLicense failed: ${error?.message ?? 'no row'}`);

  await supa.from('events').insert({
    type: 'license.issued',
    license_id: created.id,
    product_id: productId,
    data: {
      plan_slug: planRow?.slug ?? null,
      woo_order_id: args.wooOrderId ?? null,
      woo_subscription_id: args.wooSubscriptionId ?? null,
      trial: !!args.trialEndsAt,
    },
  });

  await dispatchOutbound('license.issued', {
    license_id: created.id, product_id: productId,
    data: { key_prefix: created.key_prefix, plan_slug: planRow?.slug ?? null, customer_email: created.customer_email },
  });

  return { license: created as LicenseRow, plan: planRow, product: productRow, isNew: true };
}

export async function setLicenseStatusByWooSub(
  wooSubscriptionId: string,
  status: 'active' | 'suspended' | 'revoked' | 'expired',
  reason: string,
): Promise<{ updated: number }> {
  const supa = db();
  const { data, error } = await supa
    .from('licenses')
    .update({ status })
    .eq('woo_subscription_id', wooSubscriptionId)
    .select('id, product_id');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; product_id: string }>;
  await Promise.all(rows.map((r) => supa.from('events').insert({
    type: `license.${status}`,
    license_id: r.id,
    product_id: r.product_id,
    data: { reason, by: 'woocommerce_webhook', woo_subscription_id: wooSubscriptionId },
  })));
  await Promise.all(rows.map((r) => dispatchOutbound(`license.${status}`, {
    license_id: r.id, product_id: r.product_id, data: { reason, source: 'woocommerce' },
  })));
  return { updated: rows.length };
}

export async function setLicenseStatusByWooOrder(
  wooOrderId: string,
  status: 'active' | 'suspended' | 'revoked' | 'expired',
  reason: string,
): Promise<{ updated: number }> {
  const supa = db();
  const { data, error } = await supa
    .from('licenses')
    .update({ status })
    .eq('woo_order_id', wooOrderId)
    .select('id, product_id');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; product_id: string }>;
  await Promise.all(rows.map((r) => supa.from('events').insert({
    type: `license.${status}`,
    license_id: r.id,
    product_id: r.product_id,
    data: { reason, by: 'woocommerce_webhook', woo_order_id: wooOrderId },
  })));
  await Promise.all(rows.map((r) => dispatchOutbound(`license.${status}`, {
    license_id: r.id, product_id: r.product_id, data: { reason, source: 'woocommerce' },
  })));
  return { updated: rows.length };
}
