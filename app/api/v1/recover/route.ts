/**
 * POST /api/v1/recover — email a customer every license key on file for their
 * address, so they can recover keys they've lost.
 *
 * Request: { email: string }
 * Response: always a generic 200 ("if that email has licenses, we've emailed
 * them") — we never reveal whether an email exists, to avoid enumeration.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/licenser/db';
import { rateLimit } from '@/lib/licenser/ratelimit';
import { readClientIp } from '@/lib/licenser/errors';
import { sendEmail } from '@/lib/email';
import { renderLicenseRecoveryEmail, type RecoveryLicense } from '@/lib/email/templates/license-recovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC = { ok: true, message: 'If that email has licenses on file, we have emailed them.' };

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* tolerate empty */ }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, message: 'A valid email is required.' }, { status: 400 });
  }

  // Rate-limit by IP + email so this can't be used to spam an inbox.
  const ip = readClientIp(req) || 'noip';
  const rl = rateLimit(`recover:${ip}:${email}`, 5, 60 * 60 * 1000); // 5/hour
  if (!rl.ok) {
    return NextResponse.json({ ...GENERIC }, { status: 200 }); // still generic
  }

  const { data } = await db()
    .from('licenses')
    .select('key, status, customer_name, expires_at, products(name), plans(name)')
    .eq('customer_email', email)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(50);

  const licenses = (data ?? []) as unknown as Array<{
    key: string; status: string; customer_name: string | null; expires_at: string | null;
    products: { name: string } | null; plans: { name: string } | null;
  }>;

  // Anti-enumeration: identical response whether or not anything was found.
  if (licenses.length === 0) {
    return NextResponse.json(GENERIC);
  }

  const list: RecoveryLicense[] = licenses.map((l) => ({
    productName: l.products?.name ?? 'License',
    planName: l.plans?.name ?? '—',
    key: l.key,
    status: l.status,
    expiresAt: l.expires_at,
  }));

  const origin = new URL(req.url).origin;
  const tmpl = renderLicenseRecoveryEmail({
    customerName: licenses[0].customer_name,
    licenses: list,
    portalUrl: `${origin}/portal`,
  });
  const sent = await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text, tag: 'license-recovery' });

  await db().from('events').insert({
    type: 'license.recovery_sent',
    data: { email, count: list.length, provider: sent.provider, ok: sent.ok },
  });

  return NextResponse.json(GENERIC);
}
