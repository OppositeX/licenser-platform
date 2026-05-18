import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';

/**
 * Server-side admin gate. Use at the top of every /admin/* server component.
 * 1. Reads the Supabase auth cookie via the SSR client.
 * 2. If no user, redirects to /admin/login.
 * 3. If the user email is not in public.admins, redirects to /admin/login?denied=1.
 */
export async function requireAdmin(): Promise<{ email: string; userId: string }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) redirect('/admin/login');
  const { data: row } = await serviceClient()
    .from('admins')
    .select('email')
    .eq('email', user.email.toLowerCase())
    .maybeSingle();
  if (!row) redirect('/admin/login?denied=1');
  return { email: user.email, userId: user.id };
}
