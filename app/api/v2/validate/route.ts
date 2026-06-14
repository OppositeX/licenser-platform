/**
 * /api/v2/validate — cnvs-licenser-shaped validation endpoint.
 *
 * Request (POST JSON):
 *   { key: "LIC-XXXX-XXXX-XXXX-XXXX",
 *     slug?: "cnvs-runtime",
 *     domain?: "example.com" | "https://www.example.com/path",
 *     fingerprint?: "optional-device-id" }
 *
 * Response (active):
 *   { active: true,
 *     tier: "pro",
 *     expires_at: "2027-06-14T00:00:00Z",
 *     features: ["preset-library","ai-relay","copilot"],
 *     customer_email: "user@example.com",
 *     plan_slug: "pro_monthly",
 *     product_slug: "cnvs-runtime" }
 *
 * Response (inactive):
 *   { active: false,
 *     reason: "EXPIRED" | "REVOKED" | "SUSPENDED" | "DOMAIN_NOT_AUTHORIZED" | "UNKNOWN_KEY" | "PRODUCT_MISMATCH",
 *     expires_at: "..." | null }
 *
 * CORS: open ('*') for now — see TAKEOVER.md follow-up for allowlist.
 * Rate limit: 60 req/min per (ip + key) — returns 429 with retry-after.
 */
import { NextResponse } from 'next/server';
import { runValidate, logValidation } from '@/lib/licenser/validate';
import { rateLimit } from '@/lib/licenser/ratelimit';
import { readClientIp } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Max-Age':       '86400',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function json(body: Record<string, unknown>, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...CORS_HEADERS, ...(extra ?? {}) } });
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {
    return json({ active: false, reason: 'UNKNOWN_KEY', expires_at: null }, 400);
  }

  // Accept both cnvs-licenser shape (`key`/`slug`) AND legacy WP-SDK shape
  // (`license_key`/`product`) so toolchain confusion can't break callers.
  const key = String(body.key ?? body.license_key ?? '').trim();
  const slug = body.slug ? String(body.slug) : (body.product ? String(body.product) : undefined);
  const domain = body.domain ? String(body.domain) : (body.site_url ? String(body.site_url) : undefined);
  const fingerprint = body.fingerprint ? String(body.fingerprint) : undefined;
  const ip = readClientIp(req) || null;

  if (!key) {
    return json({ active: false, reason: 'UNKNOWN_KEY', expires_at: null }, 200);
  }

  const rlKey = `v2:${ip || 'noip'}:${key.slice(0, 12)}`;
  const rl = rateLimit(rlKey, 60, 60_000);
  if (!rl.ok) {
    return json({ active: false, reason: 'UNKNOWN_KEY', expires_at: null }, 429, {
      'Retry-After': String(Math.ceil(rl.resetIn / 1000)),
    });
  }

  const result = await runValidate({ key, slug, domain, fingerprint, ip: ip ?? undefined });
  await logValidation(result, 'api_v2', ip, fingerprint ?? null);

  if (result.active) {
    return json({
      active: true,
      tier: result.tier,
      expires_at: result.expires_at,
      features: result.features,
      customer_email: result.customer_email,
      plan_slug: result.plan_slug,
      product_slug: result.product_slug,
    });
  }
  return json({
    active: false,
    reason: result.reason ?? 'UNKNOWN_KEY',
    expires_at: result.expires_at,
  });
}
