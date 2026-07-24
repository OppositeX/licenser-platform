/**
 * GET /api/cron/renewal-reminders — daily Vercel Cron. Emails a reminder to any
 * active license whose expiry is within REMINDER_WINDOW_DAYS.
 *
 * Auto-renewing subscriptions push expires_at forward on each renewal, so a
 * healthy sub never lands in the window — only genuinely-lapsing licenses
 * (cancelled/failed subs in grace, or manually time-limited licenses) do.
 *
 * Auth: if CRON_SECRET is set, require `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron sends exactly this). If unset, the endpoint runs unguarded —
 * set CRON_SECRET in production.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/licenser/db';
import { sendEmail } from '@/lib/email';
import { renderRenewalReminderEmail } from '@/lib/email/templates/renewal-reminder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REMINDER_WINDOW_DAYS = 7;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supa = db();
  const now = Date.now();
  const windowEnd = new Date(now + REMINDER_WINDOW_DAYS * 86_400_000).toISOString();
  const nowIso = new Date(now).toISOString();

  // Candidates: active, expiring within the window (and not already past).
  const { data: candidates } = await supa
    .from('licenses')
    .select('id,key_prefix,customer_email,customer_name,expires_at,product_id,plan_id')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .gt('expires_at', nowIso)
    .lte('expires_at', windowEnd)
    .limit(1000);

  const rows = (candidates ?? []) as Array<{
    id: string; key_prefix: string; customer_email: string | null; customer_name: string | null;
    expires_at: string; product_id: string; plan_id: string | null;
  }>;
  if (rows.length === 0) return NextResponse.json({ ok: true, checked: 0, sent: 0 });

  // De-dupe: skip licenses already reminded within the window (no schema change —
  // we look for a recent 'license.renewal_reminder' event).
  const sinceIso = new Date(now - REMINDER_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: reminded } = await supa
    .from('events')
    .select('license_id')
    .eq('type', 'license.renewal_reminder')
    .gte('created_at', sinceIso)
    .in('license_id', rows.map((r) => r.id));
  const already = new Set((reminded ?? []).map((e: { license_id: string | null }) => e.license_id));

  const origin = new URL(req.url).origin;
  let sent = 0;

  for (const lic of rows) {
    if (already.has(lic.id) || !lic.customer_email) continue;

    const [{ data: product }, planRes] = await Promise.all([
      supa.from('products').select('name').eq('id', lic.product_id).maybeSingle(),
      lic.plan_id ? supa.from('plans').select('name').eq('id', lic.plan_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const daysLeft = Math.max(0, Math.ceil((new Date(lic.expires_at).getTime() - now) / 86_400_000));
    const tmpl = renderRenewalReminderEmail({
      customerName: lic.customer_name,
      productName: (product as { name?: string } | null)?.name ?? 'your product',
      planName: (planRes as { data: { name?: string } | null }).data?.name ?? 'License',
      licenseKeyPrefix: lic.key_prefix,
      expiresAt: lic.expires_at,
      daysLeft,
      portalUrl: `${origin}/portal`,
    });
    const res = await sendEmail({ to: lic.customer_email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text, tag: 'renewal-reminder' });
    await supa.from('events').insert({
      type: 'license.renewal_reminder',
      license_id: lic.id,
      product_id: lic.product_id,
      data: { days_left: daysLeft, provider: res.provider, ok: res.ok },
    });
    if (res.ok) sent++;
  }

  return NextResponse.json({ ok: true, checked: rows.length, sent });
}
