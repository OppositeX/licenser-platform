/**
 * Key/value settings accessor backed by public.settings. Defaults live here so
 * a missing row falls back to a sensible value without exploding.
 */
import { db } from './db';

export interface SettingsMap {
  rate_limit_per_minute: number;
  download_url_ttl: number;
  log_retention_days: number;
  signing_secret: string;
  github_webhook_secret: string;
  github_pat: string;
  woo_auto_issue: boolean;
  woo_auto_revoke: boolean;
  woo_grace_days: number;
  stripe_publishable_key: string;
  stripe_secret_key: string;
  stripe_webhook_secret: string;
  stripe_mode: 'test' | 'live';
}

export const SETTING_DEFAULTS: SettingsMap = {
  rate_limit_per_minute: 60,
  download_url_ttl: 600,
  log_retention_days: 30,
  signing_secret: '',
  github_webhook_secret: '',
  github_pat: '',
  woo_auto_issue: true,
  woo_auto_revoke: true,
  woo_grace_days: 7,
  stripe_publishable_key: '',
  stripe_secret_key: '',
  stripe_webhook_secret: '',
  stripe_mode: 'test',
};

export type SettingKey = keyof SettingsMap;

export async function getAllSettings(): Promise<SettingsMap> {
  const { data } = await db().from('settings').select('key,value');
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
    if (row.key in SETTING_DEFAULTS) out[row.key] = row.value;
  }
  return out as unknown as SettingsMap;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
  const { data } = await db().from('settings').select('value').eq('key', key).maybeSingle();
  if (!data) return SETTING_DEFAULTS[key];
  return ((data.value as SettingsMap[K]) ?? SETTING_DEFAULTS[key]);
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K], adminEmail?: string): Promise<void> {
  await db().from('settings').upsert({
    key,
    value: value as unknown as object,
    updated_at: new Date().toISOString(),
    updated_by: adminEmail ?? null,
  });
}

export async function setManySettings(values: Partial<SettingsMap>, adminEmail?: string): Promise<void> {
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value: value as unknown as object,
    updated_at: new Date().toISOString(),
    updated_by: adminEmail ?? null,
  }));
  if (rows.length === 0) return;
  await db().from('settings').upsert(rows);
}

export function mask(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '•'.repeat(value.length);
  return '••••' + value.slice(-4);
}
