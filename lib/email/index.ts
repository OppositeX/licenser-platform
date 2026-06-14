/**
 * Email adapter. Picks the first configured provider in this order:
 *   1. Resend       (RESEND_API_KEY)         — primary
 *   2. Postmark     (POSTMARK_SERVER_TOKEN)  — fallback
 *   3. SendGrid     (SENDGRID_API_KEY)       — fallback
 *   4. Noop         — logs to events table for visibility, returns ok
 *
 * Switching providers is just changing env vars in Vercel. No code changes.
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
  provider: 'resend' | 'postmark' | 'sendgrid' | 'noop';
  id?: string;
  error?: string;
}

const DEFAULT_FROM = process.env.LICENSER_EMAIL_FROM ?? 'Licenser <licenses@gloo.ooo>';

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
        from, to: args.to, subject: args.subject, html: args.html,
        text: args.text, reply_to: args.replyTo, tags: args.tag ? [{ name: 'category', value: args.tag }] : undefined,
      }),
    });
    if (!r.ok) {
      const error = await r.text();
      return { ok: false, provider: 'resend', error: error.slice(0, 500) };
    }
    const data = await r.json() as { id?: string };
    return { ok: true, provider: 'resend', id: data.id };
  }

  if (process.env.POSTMARK_SERVER_TOKEN) {
    const r = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: from, To: args.to, Subject: args.subject, HtmlBody: args.html, TextBody: args.text,
        ReplyTo: args.replyTo, Tag: args.tag, MessageStream: 'outbound',
      }),
    });
    if (!r.ok) {
      const error = await r.text();
      return { ok: false, provider: 'postmark', error: error.slice(0, 500) };
    }
    const data = await r.json() as { MessageID?: string };
    return { ok: true, provider: 'postmark', id: data.MessageID };
  }

  if (process.env.SENDGRID_API_KEY) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: from.replace(/.*<|>.*/g, '') || from, name: from.split('<')[0].trim() || undefined },
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
      data: { to: args.to, subject: args.subject, tag: args.tag ?? null, reason: 'no provider env var set' },
    });
  } catch { /* swallow */ }
  return { ok: true, provider: 'noop' };
}
