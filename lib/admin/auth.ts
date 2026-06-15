import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';

/**
 * Server-side admin gate. Use at the top of every /admin/* server component.
 * 1. Reads the Supabase auth cookie via the SSR client.
 * 2. If no user (or the cookie is corrupt/expired and getUser throws),
 *    redirects to /admin/login.
 * 3. If the user email is not in public.admins, redirects to /admin/login?denied=1.
 */
export async function requireAdmin(): Promise<{ email: string; userId: string }> {
  let user: { id: string; email?: string | null } | null = null;
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    // Corrupt/expired cookie or transient Supabase error: treat as logged-out
    user = null;
  }
  if (!user || !user.email) redirect('/admin/login');

  let row: { email: string } | null = null;
  try {
    const res = await serviceClient()
      .from('admins')
      .select('email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();
    row = (res.data as { email: string } | null) ?? null;
  } catch {
    row = null;
  }
  if (!row) redirect('/admin/login?denied=1');
  return { email: user.email, userId: user.id };
}
