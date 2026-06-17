import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';
import { AdminShell, Card, FlashFromQuery, StatusPill, ui } from '@/components/AdminShell';
import { importAppseroCsv, type ImportResult } from '@/lib/licenser/appsero-import';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function runImport(formData: FormData) {
  'use server';
  const { email } = await requireAdmin();
  const file = formData.get('csv');
  const defaultProductSlug = String(formData.get('default_product_slug') ?? '').trim() || null;
  const dryRun = formData.get('dry_run') === 'on';
  if (!(file instanceof File) || file.size === 0) redirect('/admin/migration?error=No%20file%20uploaded');
  const text = await (file as File).text();
  const result = await importAppseroCsv(text, { dryRun, defaultProductSlug });
  await db().from('logs').insert({
    level: result.errors.length > 0 ? 'warn' : 'info',
    channel: 'migration',
    message: `AppSero import${dryRun ? ' (dry-run)' : ''}: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`,
    context: { admin: email, dry_run: dryRun, ...result },
  });
  (await cookies()).set('migration_result', JSON.stringify(result), { maxAge: 600, httpOnly: true });
  revalidatePath('/admin/migration');
  redirect(`/admin/migration?ok=${encodeURIComponent(`Import ${dryRun ? '(dry-run) ' : ''}completed: ${result.imported} imported, ${result.skipped} skipped`)}`);
}

export default async function MigrationPage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const { data: products } = await db().from('products').select('slug,name').order('name');
  const productList = (products ?? []) as Array<{ slug: string; name: string }>;

  const cookieStore = await cookies();
  const lastRaw = cookieStore.get('migration_result')?.value;
  let last: ImportResult | null = null;
  try { if (lastRaw) last = JSON.parse(lastRaw) as ImportResult; } catch { last = null; }

  return (
    <AdminShell active="migration" email={email}>
      <h1 style={ui.h1}>Migration</h1>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <Card title="AppSero CSV import" subtitle="Upload an AppSero license export to backfill your customers into the platform. Run a dry-run first to spot errors without writing.">
        <form action={runImport} encType="multipart/form-data" style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={ui.label}>CSV file *</label>
            <input name="csv" type="file" accept=".csv,text/csv" required style={{ ...ui.inp, padding: 10 }} />
          </div>
          <div>
            <label style={ui.label}>Default product slug (fallback when CSV row lacks one)</label>
            <select name="default_product_slug" style={{ ...ui.inp, width: '100%' }}>
              <option value="">— none —</option>
              {productList.map((p) => <option key={p.slug} value={p.slug}>{p.name} ({p.slug})</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 13 }}>
            <input type="checkbox" name="dry_run" defaultChecked /> Dry-run (validate only — no writes)
          </label>
          <div><button type="submit" style={ui.btn}>Run import</button></div>
        </form>
      </Card>

      <Card title="Recognised columns" subtitle="Case-insensitive. Aliases are matched per row.">
        <div style={ui.list}>
          {[
            ['license_key', 'license_key | key | license — required'],
            ['customer_email', 'customer_email | email | user_email'],
            ['customer_name', 'customer_name | name | fullname'],
            ['product_slug', 'product_slug | product | plugin_slug — or set the default above'],
            ['plan_slug', 'plan_slug | plan | variation — optional'],
            ['status', 'status | license_status — active / suspended / revoked / expired'],
            ['max_activations', 'max_activations | activation_limit'],
            ['expires_at', 'expires_at | expiry | expiration_date'],
            ['source_id', 'source_id | order_id | woo_order_id'],
          ].map(([c, desc]) => (
            <div key={c} style={{ ...ui.row, display: 'grid', gridTemplateColumns: '170px 1fr' }}>
              <code style={{ color: '#a78bfa', fontSize: 12 }}>{c}</code>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{desc}</span>
            </div>
          ))}
        </div>
      </Card>

      {last && (
        <Card title="Last import result">
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
            <div style={{ ...ui.card, padding: 14 }}><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>Rows</div><div style={{ fontSize: 22, fontWeight: 800 }}>{last.total}</div></div>
            <div style={{ ...ui.card, padding: 14 }}><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>Imported</div><div style={{ fontSize: 22, fontWeight: 800, color: '#86efac' }}>{last.imported}</div></div>
            <div style={{ ...ui.card, padding: 14 }}><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>Skipped</div><div style={{ fontSize: 22, fontWeight: 800, color: '#fcd34d' }}>{last.skipped}</div></div>
          </div>
          {last.errors.length > 0 && (
            <details>
              <summary style={{ color: '#fda4af', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>{last.errors.length} error(s)</summary>
              <div style={ui.list}>
                {last.errors.slice(0, 100).map((e, idx) => (
                  <div key={idx} style={{ ...ui.row, fontSize: 12 }}>
                    <StatusPill status="warn" />
                    <span style={{ color: '#94a3b8' }}>row {e.row}</span>
                    <span style={{ flex: 1, color: '#cbd5e1' }}>{e.message}</span>
                  </div>
                ))}
              </div>
              {last.errors.length > 100 && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>+{last.errors.length - 100} more (see Logs)</div>}
            </details>
          )}
        </Card>
      )}
    </AdminShell>
  );
}
