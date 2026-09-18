/**
 * Read the CNVS pricing settings from the cnvs.* rows in public.settings and
 * assemble them into the camelCase shape the CNVS side diffs against
 * (plans / credits / rateCard / packs / dev / graceDays / fairUse / entitlement).
 *
 * This is a faithful read of what's stored — no defaults injected — so a
 * missing section shows as `null` and the operator can see the gap. That's the
 * whole point of settings.get being the first vending tool.
 */
import { serviceClient } from '@/lib/supabase/service';

/** cnvs.* store key -> camelCase section name in the assembled payload. */
const KEY_TO_SECTION: Record<string, string> = {
  'cnvs.plans': 'plans',
  'cnvs.credits': 'credits',
  'cnvs.rate_card': 'rateCard',
  'cnvs.packs': 'packs',
  'cnvs.dev': 'dev',
  'cnvs.grace_days': 'graceDays',
  'cnvs.fair_use': 'fairUse',
  'cnvs.entitlement': 'entitlement',
};

export interface CnvsSettingsRead {
  settings: Record<string, unknown>;
  meta: { keys: string[]; missing: string[]; updated_at: string | null };
}

export async function readCnvsSettings(): Promise<CnvsSettingsRead> {
  const { data } = await serviceClient()
    .from('settings')
    .select('key, value, updated_at')
    .like('key', 'cnvs.%');

  const rows = (data ?? []) as Array<{ key: string; value: unknown; updated_at: string | null }>;

  const settings: Record<string, unknown> = {};
  const present = new Set<string>();
  let newest: string | null = null;

  for (const r of rows) {
    const section = KEY_TO_SECTION[r.key];
    if (!section) continue;
    settings[section] = r.value;
    present.add(section);
    if (r.updated_at && (!newest || r.updated_at > newest)) newest = r.updated_at;
  }

  const missing = Object.values(KEY_TO_SECTION).filter((s) => !present.has(s));
  // Null out any section we don't have, so the shape is stable and gaps are explicit.
  for (const s of missing) settings[s] = null;

  return { settings, meta: { keys: rows.map((r) => r.key).sort(), missing, updated_at: newest } };
}
