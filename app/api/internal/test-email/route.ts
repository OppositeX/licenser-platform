/**
 * /api/internal/test-email — Admin-only smoke test for the email adapter.
 * Gated on the same admin session as /admin/*. Send a test license-issued
 * email to yourself to verify Resend wiring.
 *
 * GET  /api/internal/test-email             → tells you what provider is configured
 * POST /api/internal/test-email  { to? }    → sends a sample license-issued email
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { sendEmail } from '@/lib/email';
import { renderLicenseIssuedEmail } from '@/lib/email/templates/license-issued';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mirrors the adapter in lib/email: Resend, or noop when the key is unset.
function detectProvider(): 'resend' | 'noop' {
  return process.env.RESEND_API_KEY ? 'resend' : 'noop';
}

export async function GET() {
  const { email } = await requireAdmin();
  return NextResponse.json({
    ok: true,
    provider: detectProvider(),
    you: email,
    from: process.env.LICENSER_EMAIL_FROM ?? 'Licenser <licenses@gloo.ooo>',
    hint: 'POST { to } to send a sample license-issued email. Defaults to your admin email.',
  });
}

export async function POST(req: Request) {
  const { email } = await requireAdmin();
  let body: { to?: string; product?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const to = (body.to ?? email).toLowerCase();

  // Preview the email for any product (defaults to cnvs-runtime) so we can
  // verify the product-aware install section: POST { product: "gloo-for-elementor" }.
  const productSlug = (body.product ?? 'cnvs-runtime').trim();
  const { data: product } = await db().from('products').select('name').eq('slug', productSlug).maybeSingle();
  const productName = (product as { name?: string } | null)?.name ?? productSlug;

  const tmpl = renderLicenseIssuedEmail({
    productName,
    productSlug,
    customerName: 'Test User',
    licenseKey: 'LCR-TEST-XXXX-XXXX-XXXX',
    planName: 'Sample plan',
    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
    trialDays: 0,
  });
  const result = await sendEmail({ to, subject: '[test] ' + tmpl.subject, html: tmpl.html, text: tmpl.text, tag: 'license-issued-test' });
  return NextResponse.json({ ok: result.ok, provider: result.provider, id: result.id ?? null, error: result.error ?? null, to, product: productSlug });
}
