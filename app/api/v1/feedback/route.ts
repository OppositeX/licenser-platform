import { NextResponse } from 'next/server';
import { logEvent, findLicenseByKey } from '@/lib/licenser/db';
import { errorResponse } from '@/lib/licenser/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse(400, 'licenser_bad_json', 'Invalid JSON body'); }
  const reason = String(body.reason ?? '');
  if (!reason) return errorResponse(400, 'licenser_missing_params', 'reason is required');
  const key = body.license_key ? String(body.license_key) : null;
  const license = key ? await findLicenseByKey(key) : null;
  await logEvent('feedback', {
    reason,
    message: body.message ?? null,
    domain: body.domain ?? null,
  }, { license_id: license?.id ?? null, product_id: license?.product_id ?? null });
  return NextResponse.json({ recorded: true });
}
