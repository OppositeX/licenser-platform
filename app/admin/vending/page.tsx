import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { VENDING_SCOPES, mintToken } from '@/lib/admin-api/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface TokenRow { id: string; name: string; prefix: string; scopes: string[]; active: boolean; created_at: string; last_used_at: string | null }
interface AuditRow { id: string; token_prefix: string | null; tool: string; scope: string | null; dry_run: boolean; ok: boolean; status: number | null; created_at: string }

async function createToken(formData: FormData) {
  'use server';
  const { email } = await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/admin/vending?error=Name%20required');
  const scopes = VENDING_SCOPES.filter((s) => formData.get(`scope:${s}`) === 'on');
  if (scopes.length === 0) redirect('/admin/vending?error=Pick%20at%20least%20one%20scope');

  const { raw, hash, prefix } = mintToken();
  const { error } = await db().from('api_tokens').insert({ name, token_hash: hash, prefix, scopes, created_by: email });
  if (error) redirect('/admin/vending?error=' + encodeURIComponent(error.message));

  // Show the raw token exactly once — stored hashed, never retrievable again.
  (await cookies()).set('vending_new_token', raw, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/admin/vending', maxAge: 180 });
  revalidatePath('/admin/vending');
  redirect('/admin/vending?ok=Token%20created%20%E2%80%94%20copy%20it%20now');
}

async function revokeToken(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (id) await db().from('api_tokens').update({ active: false }).eq('id', id);
  revalidatePath('/admin/vending');
  redirect('/admin/vending?ok=Token%20revoked');
}

export default async function VendingPage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await props.searchParams;
  const { email } = await requireAdmin();

  const [{ data: tokens }, { data: auditRows }] = await Promise.all([
    db().from('api_tokens').select('*').order('created_at', { ascending: false }),
    db().from('api_audit').select('id,token_prefix,tool,scope,dry_run,ok,status,created_at').order('created_at', { ascending: false }).limit(15),
  ]);
  const list = (tokens ?? []) as TokenRow[];
  const recent = (auditRows ?? []) as AuditRow[];
  const jar = await cookies();
  const rawOnce = jar.get('vending_new_token')?.value ?? null;

  return (
    <AdminShell active="vending" email={email}>
      <h1 style={ui.h1}>Vending API tokens</h1>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '-8px 0 20px' }}>
        Scoped, least-privilege bearer tokens for the CNVS vending API
        (<code style={{ color: '#cbd5e1' }}>/api/admin/vending/*</code>). Stored hashed — the raw value is shown once.
      </p>
      <FlashFromQuery ok={sp.ok} error={sp.error} />

      {rawOnce && (
        <Card title="New token — copy it now">
          <div style={{ ...ui.pre }}>{rawOnce}</div>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '10px 0 0' }}>
            Give the CNVS side this value out-of-band (never chat). It is never shown again — mint a new one if lost.
          </p>
        </Card>
      )}

      <Card title="Create token" subtitle="Read-only by default — grant only the scopes the caller needs.">
        <form action={createToken} style={{ display: 'grid', gap: 14 }}>
          <div><label style={ui.label}>Name</label><input name="name" placeholder="cnvs-4 vending (read)" style={ui.inp} /></div>
          <div>
            <label style={ui.label}>Scopes</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 8 }}>
              {VENDING_SCOPES.map((s) => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 13 }}>
                  <input type="checkbox" name={`scope:${s}`} defaultChecked={s === 'settings:read'} /> <code>{s}</code>
                </label>
              ))}
            </div>
          </div>
          <div><button type="submit" style={ui.btn}>Create token</button></div>
        </form>
      </Card>

      <Card title="Tokens">
        <div style={ui.list}>
          {list.length === 0 && <div style={{ padding: '16px 22px', color: '#94a3b8', fontSize: 13 }}>No tokens yet.</div>}
          {list.map((t) => (
            <div key={t.id} style={ui.row}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                <div style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {t.prefix}… · {t.scopes.join(', ')}
                </div>
                <div style={{ color: '#475569', fontSize: 11, marginTop: 3 }}>
                  created {new Date(t.created_at).toLocaleDateString()}{t.last_used_at ? ` · last used ${new Date(t.last_used_at).toLocaleString()}` : ' · never used'}
                </div>
              </div>
              <StatusPill status={t.active ? 'active' : 'revoked'} />
              {t.active && (
                <form action={revokeToken}>
                  <input type="hidden" name="id" value={t.id} />
                  <button style={ui.btnDanger}>Revoke</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Recent calls" subtitle="Audit trail — every vending API call, most recent first.">
        <div style={ui.list}>
          {recent.length === 0 && <div style={{ padding: '16px 22px', color: '#94a3b8', fontSize: 13 }}>No calls yet.</div>}
          {recent.map((a) => (
            <div key={a.id} style={{ padding: '10px 22px', borderBottom: '1px solid #1f2937', fontSize: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusPill status={a.ok ? 'ok' : 'error'} />
              <span style={{ color: '#a78bfa', fontWeight: 700, minWidth: 130 }}>{a.tool}{a.dry_run ? ' (dry-run)' : ''}</span>
              <span style={{ color: '#94a3b8', flex: 1, fontFamily: 'ui-monospace, Menlo, monospace' }}>{a.token_prefix ?? '—'}… · {a.scope ?? ''}{a.status ? ` · ${a.status}` : ''}</span>
              <span style={{ color: '#475569' }}>{new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
