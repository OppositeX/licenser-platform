import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CNVS_KEY_TO_SECTION,
  buildCnvsSettings,
  cnvsDefaults,
  validateCnvsSettings,
} from '@/lib/cnvs/settings';

/**
 * The migration seeds the cnvs.* rows and lib/cnvs/settings.ts holds the
 * fallback for a missing row. They are two copies of the same numbers, so they
 * can drift — and a drift is invisible in production, because whichever side is
 * wrong still serves a valid-looking payload. This pins them together.
 */
const MIGRATION = path.join(__dirname, '..', 'supabase', 'migrations', '20260914_cnvs_phase_a.sql');

/** Pull every ('cnvs.x', '<json>'::jsonb) pair out of the seed insert. */
function seededRows(sql: string): Record<string, unknown> {
  const rows: Record<string, unknown> = {};
  const re = /\('(cnvs\.[a-z_]+)',\s*('(?:[^']|'')*')::jsonb\)/g;
  for (const m of sql.matchAll(re)) {
    rows[m[1]] = JSON.parse(m[2].slice(1, -1).replace(/''/g, "'"));
  }
  return rows;
}

describe('20260914_cnvs_phase_a.sql seed', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const rows = seededRows(sql);

  it('seeds a row for every cnvs.* key the code reads', () => {
    expect(Object.keys(rows).sort()).toEqual(Object.keys(CNVS_KEY_TO_SECTION).sort());
  });

  it('seeds values identical to the compiled defaults', () => {
    const { settings, degraded } = buildCnvsSettings(rows);
    expect(degraded).toEqual([]);
    expect(settings).toEqual(cnvsDefaults());
  });

  it('seeds a payload cnvs-4 will accept', () => {
    const { settings } = buildCnvsSettings(rows);
    expect(validateCnvsSettings(settings)).toEqual({ ok: true, errors: [] });
  });

  it('never overwrites prices an admin has already set', () => {
    // `on conflict (key) do nothing` is what makes re-running the migration
    // safe against a live pricing change.
    expect(sql).toMatch(/insert into public\.settings[\s\S]*?on conflict \(key\) do nothing/);
  });
});
