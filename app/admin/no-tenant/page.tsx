import { requireAdmin } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

/**
 * Shown when a logged-in admin has no tenant they may act on (a tenant_member
 * row was expected but none exists, or they requested a tenant they can't
 * access). A platform superadmin never lands here — they default to OTW.
 */
export default async function NoTenantPage() {
  const { email } = await requireAdmin();
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0a0f', color: '#f1f5f9', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: 440, textAlign: 'center', padding: 32, border: '1px solid #1f2937', borderRadius: 12, background: '#14171f' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 10px' }}>No workspace assigned</h1>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.5, margin: '0 0 18px' }}>
          Your account (<code style={{ color: '#cbd5e1' }}>{email}</code>) isn’t a member of any tenant yet.
          Ask your administrator to add you to a workspace.
        </p>
        <form action="/admin/logout" method="post" style={{ margin: 0 }}>
          <button style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #1f2937', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Sign out</button>
        </form>
      </div>
    </div>
  );
}
