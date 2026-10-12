import Link from 'next/link';
import { requireSuperadmin } from '@/lib/admin/tenant-context';
import { AdminShell, Card, FlashFromQuery, ui } from '@/components/AdminShell';
import {
  listTenants, listMembers, createTenant, addMember, removeMember,
  type TenantRole,
} from '@/lib/licenser/tenant';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function createTenantAction(formData: FormData) {
  'use server';
  await requireSuperadmin();
  const res = await createTenant({
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? '') || undefined,
    github_org: String(formData.get('github_org') ?? '').trim() || null,
    branding: {
      displayName: String(formData.get('displayName') ?? '').trim() || undefined,
      logoUrl: String(formData.get('logoUrl') ?? '').trim() || undefined,
      fromEmail: String(formData.get('fromEmail') ?? '').trim() || undefined,
      accentColor: String(formData.get('accentColor') ?? '').trim() || undefined,
    },
  });
  if (!res.ok) redirect('/admin/tenants?error=' + encodeURIComponent(res.error));
  revalidatePath('/admin/tenants');
  redirect('/admin/tenants?ok=' + encodeURIComponent(`Tenant "${res.tenant.name}" created`));
}

async function addMemberAction(formData: FormData) {
  'use server';
  await requireSuperadmin();
  const tenantId = String(formData.get('tenant_id') ?? '');
  const res = await addMember(tenantId, String(formData.get('email') ?? ''), String(formData.get('role') ?? 'admin') as TenantRole);
  revalidatePath('/admin/tenants');
  redirect('/admin/tenants?' + (res.ok ? 'ok=Member%20added' : 'error=' + encodeURIComponent(res.error ?? 'failed')));
}

async function removeMemberAction(formData: FormData) {
  'use server';
  await requireSuperadmin();
  await removeMember(String(formData.get('tenant_id') ?? ''), String(formData.get('email') ?? ''));
  revalidatePath('/admin/tenants');
  redirect('/admin/tenants?ok=Member%20removed');
}

export default async function TenantsPage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const { email } = await requireSuperadmin();
  const tenants = await listTenants();
  const membersByTenant = Object.fromEntries(
    await Promise.all(tenants.map(async (t) => [t.id, await listMembers(t.id)] as const)),
  );

  return (
    <AdminShell active="tenants" email={email} superadmin>
      <h1 style={ui.h1}>Tenants</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '-8px 0 20px' }}>
        Each tenant is a vendor the platform serves. Platform superadmins (you) can act on any tenant;
        per-tenant admins only on their own. White-label fields fall back to platform defaults when blank.
      </p>
      <FlashFromQuery ok={sp.ok} error={sp.error} />

      <Card title="Onboard a new tenant" subtitle="Creates the workspace; add its first admin below once created.">
        <form action={createTenantAction} style={ui.formGrid}>
          <div><label style={ui.label}>Name *</label><input name="name" required placeholder="Acme Software" style={ui.inp} /></div>
          <div><label style={ui.label}>Slug</label><input name="slug" placeholder="acme (auto from name if blank)" style={ui.inp} /></div>
          <div><label style={ui.label}>GitHub org (for release delivery)</label><input name="github_org" placeholder="acme-inc" style={ui.inp} /></div>
          <div><label style={ui.label}>Brand display name</label><input name="displayName" placeholder="Acme Licensing" style={ui.inp} /></div>
          <div><label style={ui.label}>Logo URL</label><input name="logoUrl" type="url" placeholder="https://…/logo.png" style={ui.inp} /></div>
          <div><label style={ui.label}>From email</label><input name="fromEmail" type="email" placeholder="licenses@acme.com" style={ui.inp} /></div>
          <div><label style={ui.label}>Accent color</label><input name="accentColor" placeholder="#8b5cf6" style={ui.inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><button type="submit" style={ui.btn}>Create tenant</button></div>
        </form>
      </Card>

      {tenants.map((t) => (
        <Card key={t.id} title={t.name} subtitle={`${t.slug}${t.github_org ? ' · gh:' + t.github_org : ''} · ${t.status}`}>
          <div style={ui.list}>
            {(membersByTenant[t.id] ?? []).length === 0 && (
              <div style={{ padding: '12px 22px', color: '#94a3b8', fontSize: 13 }}>No members yet — add the first admin below.</div>
            )}
            {(membersByTenant[t.id] ?? []).map((m) => (
              <div key={m.id} style={ui.row}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <span style={{ fontWeight: 600 }}>{m.email}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}> · {m.role}</span>
                </div>
                <form action={removeMemberAction}>
                  <input type="hidden" name="tenant_id" value={t.id} />
                  <input type="hidden" name="email" value={m.email} />
                  <button style={ui.btnDanger}>Remove</button>
                </form>
              </div>
            ))}
          </div>
          <form action={addMemberAction} style={{ ...ui.inlineFormGrid, marginTop: 12 }}>
            <input type="hidden" name="tenant_id" value={t.id} />
            <div><label style={ui.label}>Add member email</label><input name="email" type="email" required placeholder="admin@acme.com" style={ui.inp} /></div>
            <div><label style={ui.label}>Role</label>
              <select name="role" defaultValue="admin" style={ui.inp}>
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="viewer">viewer</option>
              </select>
            </div>
            <div><button type="submit" style={ui.btn}>Add</button></div>
          </form>
        </Card>
      ))}
    </AdminShell>
  );
}
