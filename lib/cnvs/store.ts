/**
 * Reads/writes the `cnvs.*` rows in public.settings, and records every change
 * in public.settings_audit ("who changed what", per the /admin/cnvs brief).
 *
 * Read path is deliberately fail-soft: if Supabase is unreachable we serve the
 * defaults rather than a 500. cnvs-4 treats a non-200 as a fault and falls back
 * to its own compiled defaults anyway, so answering with the same numbers keeps
 * the product's pricing stable and keeps the failure visible in `source`.
 */
import { db } from '@/lib/licenser/db';
import {
  CNVS_KEY_TO_SECTION,
  CNVS_SETTING_KEYS,
  buildCnvsSettings,
  cnvsDefaults,
  validateCnvsSection,
  type CnvsSection,
  type CnvsSettings,
} from './settings';

const CNVS_KEYS = Object.values(CNVS_SETTING_KEYS) as string[];

export interface CnvsSettingsSnapshot {
  settings: CnvsSettings;
  /** Newest updated_at across the cnvs.* rows, or null when nothing is stored. */
  updated_at: string | null;
  /** 'store' = at least one row came from the DB. 'defaults' = nothing stored.
   *  'fallback' = the DB read failed and we are serving compiled defaults. */
  source: 'store' | 'defaults' | 'fallback';
  /** Sections that fell back because their stored row is malformed. */
  degraded: Array<{ section: CnvsSection; errors: string[] }>;
}

export async function readCnvsSettings(): Promise<CnvsSettingsSnapshot> {
  let rows: Array<{ key: string; value: unknown; updated_at: string | null }> = [];
  try {
    const { data, error } = await db()
      .from('settings')
      .select('key,value,updated_at')
      .in('key', CNVS_KEYS);
    if (error) throw error;
    rows = (data ?? []) as typeof rows;
  } catch {
    return { settings: cnvsDefaults(), updated_at: null, source: 'fallback', degraded: [] };
  }

  const stored: Record<string, unknown> = {};
  let newest: string | null = null;
  for (const row of rows) {
    stored[row.key] = row.value;
    if (row.updated_at && (!newest || row.updated_at > newest)) newest = row.updated_at;
  }

  const { settings, degraded } = buildCnvsSettings(stored);
  return {
    settings,
    updated_at: newest,
    source: rows.length > 0 ? 'store' : 'defaults',
    degraded,
  };
}

/** Raw rows, for the admin editor (which needs to know what is actually stored). */
export async function readCnvsRows(): Promise<
  Array<{ section: CnvsSection; key: string; value: unknown; updated_at: string | null; updated_by: string | null }>
> {
  const { data } = await db()
    .from('settings')
    .select('key,value,updated_at,updated_by')
    .in('key', CNVS_KEYS);
  return ((data ?? []) as Array<{ key: string; value: unknown; updated_at: string | null; updated_by: string | null }>)
    .filter((r) => CNVS_KEY_TO_SECTION[r.key])
    .map((r) => ({ section: CNVS_KEY_TO_SECTION[r.key], ...r }));
}

export class CnvsValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('; '));
    this.name = 'CnvsValidationError';
  }
}

/**
 * Write one or more sections. Validates BEFORE storing so a bad price can never
 * reach the endpoint — cnvs-4 would discard the entire payload over it, which
 * looks like nothing happened rather than like an error.
 */
export async function writeCnvsSections(
  updates: Partial<Record<CnvsSection, unknown>>,
  adminEmail: string,
): Promise<{ changed: CnvsSection[] }> {
  const sections = Object.keys(updates) as CnvsSection[];
  if (sections.length === 0) return { changed: [] };

  const errors: string[] = [];
  for (const section of sections) errors.push(...validateCnvsSection(section, updates[section]));
  if (errors.length > 0) throw new CnvsValidationError(errors);

  const supa = db();
  const keys = sections.map((s) => CNVS_SETTING_KEYS[s]);

  // Snapshot the previous values so the audit row can say what actually changed.
  const { data: before } = await supa.from('settings').select('key,value').in('key', keys);
  const prev = new Map<string, unknown>(
    ((before ?? []) as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value]),
  );

  const now = new Date().toISOString();
  const changed: CnvsSection[] = [];
  const rows: Array<{ key: string; value: unknown; updated_at: string; updated_by: string }> = [];
  const audits: Array<Record<string, unknown>> = [];

  for (const section of sections) {
    const key = CNVS_SETTING_KEYS[section];
    const next = updates[section];
    const old = prev.get(key);
    // No-op edits should not clutter the audit trail.
    if (old !== undefined && JSON.stringify(old) === JSON.stringify(next)) continue;
    changed.push(section);
    rows.push({ key, value: next, updated_at: now, updated_by: adminEmail });
    audits.push({
      key,
      old_value: old ?? null,
      new_value: next,
      changed_by: adminEmail,
      changed_at: now,
    });
  }

  if (rows.length === 0) return { changed: [] };

  const { error } = await supa.from('settings').upsert(rows, { onConflict: 'key' });
  if (error) throw error;

  // The audit trail must never take the settings write down with it.
  const { error: auditError } = await supa.from('settings_audit').insert(audits);
  if (auditError) {
    await supa.from('logs').insert({
      level: 'warn',
      channel: 'cnvs',
      message: 'settings saved but audit insert failed',
      context: { keys: rows.map((r) => r.key), error: auditError.message },
    });
  }

  return { changed };
}

export interface SettingsAuditRow {
  id: number;
  key: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  changed_at: string;
}

export async function readCnvsAudit(limit = 25): Promise<SettingsAuditRow[]> {
  const { data } = await db()
    .from('settings_audit')
    .select('*')
    .in('key', CNVS_KEYS)
    .order('changed_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as SettingsAuditRow[];
}
