import crypto from 'node:crypto';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell, Card, FlashFromQuery, ui } from '@/components/AdminShell';
import { getAllSettings, mask, setManySettings, setSetting } from '@/lib/licenser/settings';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function saveSettings(formData: FormData) {
  'use server';
  const { email } = await requireAdmin();
  const githubSecret = String(formData.get('github_webhook_secret') ?? '');
  const githubPat = String(formData.get('github_pat') ?? '');
  const updates: Record<string, unknown> = {
    rate_limit_per_minute: Math.max(1, parseInt(String(formData.get('rate_limit_per_minute') ?? '60'), 10) || 60),
    download_url_ttl: Math.max(60, parseInt(String(formData.get('download_url_ttl') ?? '600'), 10) || 600),
    log_retention_days: Math.max(1, parseInt(String(formData.get('log_retention_days') ?? '30'), 10) || 30),
  };
  if (githubSecret) updates.github_webhook_secret = githubSecret;
  if (githubPat) updates.github_pat = githubPat;
  if (formData.get('rotate_signing_secret') === 'on') {
    updates.signing_secret = crypto.randomBytes(32).toString('hex');
  }
  await setManySettings(updates as never, email);
  revalidatePath('/admin/settings');
  redirect('/admin/settings?ok=Settings%20saved');
}

async function rotateSigningSecret() {
  'use server';
  const { email } = await requireAdmin();
  await setSetting('signing_secret', crypto.randomBytes(32).toString('hex'), email);
  revalidatePath('/admin/settings');
  redirect('/admin/settings?ok=Signing%20secret%20rotated');
}

export default async function SettingsPage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const { email } = await requireAdmin();
  const settings = await getAllSettings();

  return (
    <AdminShell active="settings" email={email}>
      <h1 style={ui.h1}>Settings</h1>
      <FlashFromQuery ok={searchParams.ok} error={searchParams.error} />

      <form action={saveSettings} style={{ display: 'grid', gap: 18 }}>
        <Card title="Limits & expiry">
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <label style={ui.label}>Rate limit per minute (per IP)</label>
              <input name="rate_limit_per_minute" type="number" min="1" defaultValue={settings.rate_limit_per_minute} style={{ ...ui.inp, width: '100%' }} />
            </div>
            <div>
              <label style={ui.label}>Signed download URL TTL (seconds)</label>
              <input name="download_url_ttl" type="number" min="60" defaultValue={settings.download_url_ttl} style={{ ...ui.inp, width: '100%' }} />
            </div>
            <div>
              <label style={ui.label}>Log retention (days)</label>
              <input name="log_retention_days" type="number" min="1" defaultValue={settings.log_retention_days} style={{ ...ui.inp, width: '100%' }} />
            </div>
          </div>
        </Card>

        <Card title="GitHub credentials" subtitle="Duplicated from the GitHub integration page for convenience.">
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={ui.label}>Webhook secret</label>
              <input name="github_webhook_secret" type="password" placeholder={settings.github_webhook_secret ? `current: ${mask(settings.github_webhook_secret)}` : 'paste secret'} style={{ ...ui.inp, width: '100%' }} />
            </div>
            <div>
              <label style={ui.label}>GitHub PAT</label>
              <input name="github_pat" type="password" placeholder={settings.github_pat ? `current: ${mask(settings.github_pat)}` : 'ghp_…'} style={{ ...ui.inp, width: '100%' }} />
            </div>
          </div>
        </Card>

        <Card title="Signing secret" subtitle="Used to sign download URLs and other server-issued artifacts. Rotating invalidates outstanding signed URLs.">
          <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 12 }}>
            Current: {settings.signing_secret ? <code style={{ color: '#cbd5e1' }}>{mask(settings.signing_secret)}</code> : 'not set'}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cbd5e1', fontSize: 13 }}>
            <input type="checkbox" name="rotate_signing_secret" /> Rotate signing secret when saving
          </label>
        </Card>

        <div><button type="submit" style={ui.btn}>Save settings</button></div>
      </form>

      <Card title="Rotate signing secret immediately" subtitle="Generates a new secret without changing other fields.">
        <form action={rotateSigningSecret}>
          <button type="submit" style={ui.btnWarn}>Generate new signing secret</button>
        </form>
      </Card>
    </AdminShell>
  );
}
