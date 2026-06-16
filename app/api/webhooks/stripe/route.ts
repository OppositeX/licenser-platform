/**
 * /api/webhooks/stripe — receives Stripe webhook events. Scaffolded for the
 * upcoming checkout/shop work; today it just records the event in
 * webhook_deliveries so the integration page shows traffic. Issuance /
 * subscription state-machine handling lands when the shop UI is built.
 *
 * Signature: Stripe sends `Stripe-Signature: t=...,v1=hex`. The shared secret
 * lives in public.settings under stripe_webhook_secret.
 */
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/licenser/db';
import { getSetting } from '@/lib/licenser/settings';
import { logger } from '@/lib/licenser/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verify(rawBody: string, sigHeader: string | null, secret: string, toleranceSec = 300): boolean {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=', 2) as [string, string]));
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  const tsNum = parseInt(t, 10);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > toleranceSec) return false;
  const signed = `${t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
  if (v1.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected)); } catch { return false; }
}

export async function POST(req: Request) {
  const secret = await getSetting('stripe_webhook_secret');
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!secret) {
    await db().from('webhook_deliveries').insert({
      source: 'stripe', event: null, status: 'error',
      message: 'stripe_webhook_secret not configured',
    });
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 503 });
  }

  if (!verify(rawBody, sig, secret)) {
    await db().from('webhook_deliveries').insert({
      source: 'stripe', event: null, status: 'error',
      message: 'signature verification failed',
    });
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let payload: { id?: string; type?: string; data?: { object?: unknown } } = {};
  try { payload = JSON.parse(rawBody); } catch { /* keep empty */ }

  await db().from('webhook_deliveries').insert({
    source: 'stripe', event: payload.type ?? 'unknown', delivery_id: payload.id ?? null,
    status: 'received', message: `event ${payload.type ?? 'unknown'} stored — handler not yet wired`,
    payload: payload as object,
  });

  await logger.info('stripe', `received ${payload.type ?? 'unknown'}`, { id: payload.id });
  return NextResponse.json({ ok: true });
}
