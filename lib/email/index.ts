/**
 * Email adapter — Resend only.
 *
 * Provider: Resend (switched from SendGrid on 2026-07-23 per Tahir/Omri).
 * Set `RESEND_API_KEY` on Vercel. If missing, every send falls through to the
 * noop branch and gets logged to the `events` table so we can see what would
 * have gone out.
 *
 * From address: `LICENSER_EMAIL_FROM` (default `Licenser <licenses@gloo.ooo>`).
 * The from-domain must be verified in Resend (Domains → add gloo.ooo → set the
 * DNS records). Sends from an unverified domain are rejected by Resend.
 */
import { db } from '@/lib/licenser/db';

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tag?: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider: 'resend' | 'noop';
  id?: string;
  error?: string;
}

const DEFAULT_FROM = process.env.LICENSER_EMAIL_FROM ?? 'Licenser <licenses@gloo.ooo>';

/** Resend tag names/values allow only ASCII letters, numbers, `_` and `-`. */
function sanitizeTag(v: string): string {
  return v.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 256) || 'untagged';
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const from = args.from ?? DEFAULT_FROM;

  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
        tags: args.tag ? [{ name: 'category', value: sanitizeTag(args.tag) }] : undefined,
      }),
    });
    if (!r.ok) {
      const error = await r.text();
      return { ok: false, provider: 'resend', error: error.slice(0, 500) };
    }
    const body = (await r.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, provider: 'resend', id: body?.id };
  }

  // Noop fallback — record so we can see what would have been sent.
  try {
    await db().from('events').insert({
      type: 'email.noop',
      data: { to: args.to, subject: args.subject, tag: args.tag ?? null, reason: 'RESEND_API_KEY not set' },
    });
  } catch { /* swallow */ }
  return { ok: true, provider: 'noop' };
}
