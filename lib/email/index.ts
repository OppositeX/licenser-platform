/**
 * Email adapter — SendGrid only.
 *
 * Provider locked in by Omri 2026-06-14: SendGrid is the production email sender.
 * Set `SENDGRID_API_KEY` on Vercel. If missing, every send falls through to the
 * noop branch and gets logged to the `events` table so we can see what would have
 * gone out.
 *
 * From address: `LICENSER_EMAIL_FROM` (default `Licenser <licenses@gloo.ooo>`).
 * Make sure the from-domain is verified in your SendGrid sender authentication
 * (Settings → Sender Authentication → Domain Auth on gloo.ooo).
 *
 * Optional: if you want to use a SendGrid Dynamic Template instead of inline HTML,
 * set `LICENSER_SENDGRID_TEMPLATE_ID` and pass `templateData` per call (caller
 * change required — current call sites all pass `html`).
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
  provider: 'sendgrid' | 'noop';
  id?: string;
  error?: string;
}

const DEFAULT_FROM = process.env.LICENSER_EMAIL_FROM ?? 'Licenser <licenses@gloo.ooo>';

/** Pulls just the bare email out of a `"Name <email@x>"` string. */
function parseFrom(s: string): { email: string; name?: string } {
  const m = s.match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: s.trim() };
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const from = args.from ?? DEFAULT_FROM;
  const fromParts = parseFrom(from);

  if (process.env.SENDGRID_API_KEY) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: fromParts,
        reply_to: args.replyTo ? { email: args.replyTo } : undefined,
        subject: args.subject,
        content: [
          ...(args.text ? [{ type: 'text/plain', value: args.text }] : []),
          { type: 'text/html', value: args.html },
        ],
        categories: args.tag ? [args.tag] : undefined,
      }),
    });
    if (!r.ok) {
      const error = await r.text();
      return { ok: false, provider: 'sendgrid', error: error.slice(0, 500) };
    }
    return { ok: true, provider: 'sendgrid', id: r.headers.get('x-message-id') ?? undefined };
  }

  // Noop fallback — record so we can see what would have been sent.
  try {
    await db().from('events').insert({
      type: 'email.noop',
      data: { to: args.to, subject: args.subject, tag: args.tag ?? null, reason: 'SENDGRID_API_KEY not set' },
    });
  } catch { /* swallow */ }
  return { ok: true, provider: 'noop' };
}
