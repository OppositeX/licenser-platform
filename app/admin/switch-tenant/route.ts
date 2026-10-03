/**
 * POST /admin/switch-tenant — set the operator's acting tenant.
 *
 * The validation of whether this user may act as the chosen tenant happens in
 * requireAdminTenant() on the next page load (a cookie value is only a request,
 * not a grant), so this handler just records the choice and redirects back.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { ACTING_TENANT_COOKIE } from '@/lib/admin/tenant-context';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  await requireAdmin(); // must be a logged-in admin to switch at all
  const form = await req.formData();
  const tenant = String(form.get('tenant') ?? '').trim();
  const referer = req.headers.get('referer');
  const dest = referer && referer.startsWith(new URL(req.url).origin) ? referer : '/admin';

  const res = NextResponse.redirect(dest, { status: 303 });
  if (tenant) {
    res.cookies.set(ACTING_TENANT_COOKIE, tenant, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/admin', maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
