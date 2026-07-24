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
  let body: { to?: string } = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const to = (body.to ?? email).toLowerCase();

  const tmpl = renderLicenseIssuedEmail({
    productName: 'CNVS 4 Runtime',
    productSlug: 'cnvs-runtime',
    customerName: 'Test User',
    licenseKey: 'LCR-TEST-XXXX-XXXX-XXXX',
    planName: 'Pro (monthly)',
    expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    trialDays: 14,
  });
  const result = await sendEmail({ to, subject: '[test] ' + tmpl.subject, html: tmpl.html, text: tmpl.text, tag: 'license-issued-test' });
  return NextResponse.json({ ok: result.ok, provider: result.provider, id: result.id ?? null, error: result.error ?? null, to });
}
