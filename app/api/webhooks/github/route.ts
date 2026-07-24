/**
 * /api/webhooks/github — receives GitHub release webhooks and records them in
 * webhook_deliveries for visibility on /admin/integrations/github. Release
 * payloads create / upsert rows in product_releases when the repo matches a
 * product's github_repo.
 *
 * Signature: GitHub posts X-Hub-Signature-256 as `sha256=<hex>`. The shared
 * secret lives in public.settings under github_webhook_secret.
 */
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/licenser/db';
import { getSetting } from '@/lib/licenser/settings';
import { logger } from '@/lib/licenser/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verify(body: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  if (header.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected)); } catch { return false; }
}

export async function POST(req: Request) {
  const secret = await getSetting('github_webhook_secret');
  const rawBody = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  const event = req.headers.get('x-github-event') ?? 'unknown';
  const delivery = req.headers.get('x-github-delivery');

  if (!secret) {
    await db().from('webhook_deliveries').insert({
      source: 'github', event, delivery_id: delivery, status: 'error',
      message: 'github_webhook_secret not configured',
    });
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 503 });
  }

  if (!verify(rawBody, sig, secret)) {
    await db().from('webhook_deliveries').insert({
      source: 'github', event, delivery_id: delivery, status: 'error',
      message: 'signature verification failed',
    });
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(rawBody); } catch { /* keep empty */ }

  if (event !== 'release') {
    await db().from('webhook_deliveries').insert({
      source: 'github', event, delivery_id: delivery, status: 'ignored',
      message: `event ${event} ignored`, payload,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const release = (payload as { release?: { tag_name?: string; body?: string; prerelease?: boolean; assets?: Array<{ browser_download_url?: string; name?: string }> } }).release ?? {};
  const repoFull = ((payload as { repository?: { full_name?: string } }).repository?.full_name ?? '').trim();
  const tag = (release.tag_name ?? '').replace(/^v/, '');
  // A GitHub pre-release lands on the beta channel; a full release is stable.
  const channel = release.prerelease ? 'beta' : 'stable';

  const { data: product } = await db().from('products').select('id,slug').eq('github_repo', repoFull).maybeSingle();
  if (!product || !tag) {
    await db().from('webhook_deliveries').insert({
      source: 'github', event, delivery_id: delivery, status: 'ignored',
      message: `no product mapped to ${repoFull || '(unknown repo)'} or missing tag`,
      payload,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const zipAsset = (release.assets ?? []).find((a) => a.name?.endsWith('.zip'));
  const downloadUrl = zipAsset?.browser_download_url ?? null;

  await db().from('product_releases').upsert({
    product_id: product.id,
    version: tag,
    channel,
    download_url: downloadUrl,
    changelog: release.body ?? null,
    is_latest: channel === 'stable',
    released_at: new Date().toISOString(),
  }, { onConflict: 'product_id,version' });

  // A stable release becomes the product's displayed latest; a pre-release does not.
  if (channel === 'stable') {
    await db().from('product_releases')
      .update({ is_latest: false })
      .eq('product_id', product.id)
      .neq('version', tag);
    await db().from('products').update({ version: tag }).eq('id', product.id);
  }

  await db().from('webhook_deliveries').insert({
    source: 'github', event, delivery_id: delivery, product_id: product.id,
    status: 'ok', message: `release ${tag} recorded for ${product.slug}`,
    payload: { tag, repo: repoFull, download_url: downloadUrl },
  });

  await logger.info('github', `release ${tag} for ${product.slug}`, { repo: repoFull });
  return NextResponse.json({ ok: true });
}
