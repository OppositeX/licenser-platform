/**
 * CNVS pricing settings — the source of truth behind GET /api/v2/cnvs/settings.
 *
 * WHY THIS EXISTS
 * ---------------
 * cnvs-4 quotes and debits a credit price for every AI generation. Until this
 * endpoint existed, every one of those prices was a constant compiled into the
 * cnvs-4 bundle, so changing a price meant shipping a CNVS deploy. The whole
 * point of this module is that the numbers live in `public.settings` under
 * `cnvs.*` keys and are editable from /admin/cnvs — NOT hardcoded here.
 *
 * The constants below are the LAST-RESORT fallback, used only when a row is
 * missing or a stored row is malformed. They match the v1 defaults cnvs-4
 * itself falls back to, so a cold database serves the same prices the product
 * already ships with rather than something new.
 *
 * THE CONTRACT (enforced by cnvs-4 `apps/marketing/lib/cnvs-settings.ts`)
 * ----------------------------------------------------------------------
 * cnvs-4 validates the whole payload before letting any of it price a click.
 * If it fails any rule, cnvs-4 discards the response ENTIRELY, serves its own
 * defaults, and reports `degraded: true, reason: "invalid-payload"`. So a
 * partially-bad payload is worse than no payload: it looks healthy from here
 * and changes nothing in the product. The rules:
 *
 *   1. A 200 must carry prices — a bare `{ ok: true }` is rejected as
 *      `empty-payload`.
 *   2. `rateCard` must price ALL TWELVE actions in CNVS_ACTIONS, by those
 *      exact strings. Partial card, or an unknown action name → rejected whole.
 *   3. `credits` / `paidCredits` must be non-negative INTEGERS (not strings,
 *      not floats, not null).
 *   4. No single action may cost more than MAX_ACTION_CREDITS (1 credit =
 *      1 cent, so a $1,000 ceiling per click).
 *   5. `plans.*.monthlyUsd`/`annualUsd` and `packs[].usd`/`credits` must be
 *      positive; `minSeats`, `credits.perSeat.*`, `credits.freeDaily`
 *      non-negative.
 *   6. Any omitted key falls back to the cnvs-4 default. Omitting is safe,
 *      malformed is not.
 *
 * `buildCnvsSettings()` is written so rule 6 is how we degrade: a section that
 * fails validation is replaced by its default rather than served broken, and
 * the whole assembled payload is re-checked before it leaves the process.
 */

/** The twelve action ids cnvs-4 knows. An id outside this set fails the card. */
export const CNVS_ACTIONS = [
  'agent_edit_fast',
  'agent_edit_pro',
  'image_1080',
  'image_to_3d',
  'rig_repose',
  'animation_clip',
  'world_draft',
  'world_full',
  'hero_video',
  'hero_video_pair',
  'template_restyle',
  'doctrine_tool',
] as const;

export type CnvsAction = (typeof CNVS_ACTIONS)[number];

/** Rule 4: 1 credit = 1 cent, so this is a $1,000 ceiling on a single click. */
export const MAX_ACTION_CREDITS = 100_000;

export interface CnvsPlan { monthlyUsd: number; annualUsd: number; minSeats: number }
export interface CnvsPlans { pro: CnvsPlan; studio: CnvsPlan }
export interface CnvsCredits {
  perSeat: { pro: number; studio: number };
  freeDaily: number;
  rolloverMonths: number;
}
export interface CnvsRateCardEntry {
  action: CnvsAction;
  label: string;
  route: string;
  credits: number;
  /** Optional. When present it must also be a non-negative integer (rule 3). */
  paidCredits?: number;
}
export interface CnvsPack { sku: string; credits: number; usd: number; recurring: boolean }
export interface CnvsDev { lifetimeDays: number; bootsPerDay: number; ipsPerDay: number }
export interface CnvsFairUse { fastEditsPerDay: number }
export interface CnvsEntitlement { prodTtlHours: number; graceHours: number }

export interface CnvsSettings {
  plans: CnvsPlans;
  credits: CnvsCredits;
  rateCard: CnvsRateCardEntry[];
  packs: CnvsPack[];
  dev: CnvsDev;
  graceDays: number;
  fairUse: CnvsFairUse;
  entitlement: CnvsEntitlement;
}

/**
 * Settings-store keys. One row per top-level section keeps each edit auditable
 * on its own and keeps the admin form from having to rewrite unrelated prices.
 */
export const CNVS_SETTING_KEYS = {
  plans: 'cnvs.plans',
  credits: 'cnvs.credits',
  rateCard: 'cnvs.rate_card',
  packs: 'cnvs.packs',
  dev: 'cnvs.dev',
  graceDays: 'cnvs.grace_days',
  fairUse: 'cnvs.fair_use',
  entitlement: 'cnvs.entitlement',
} as const satisfies Record<keyof CnvsSettings, string>;

export type CnvsSection = keyof CnvsSettings;

export const CNVS_SECTIONS = Object.keys(CNVS_SETTING_KEYS) as CnvsSection[];

/** Reverse lookup: 'cnvs.rate_card' → 'rateCard'. */
export const CNVS_KEY_TO_SECTION: Record<string, CnvsSection> = Object.fromEntries(
  CNVS_SECTIONS.map((s) => [CNVS_SETTING_KEYS[s], s]),
);

/**
 * Fallback values — identical to the v1 defaults cnvs-4 compiles in. These are
 * NOT the product's prices; the rows in `public.settings` are. See file header.
 */
export const CNVS_DEFAULTS: CnvsSettings = {
  plans: {
    pro:    { monthlyUsd: 15, annualUsd: 12, minSeats: 1 },
    studio: { monthlyUsd: 25, annualUsd: 20, minSeats: 2 },
  },
  credits: { perSeat: { pro: 500, studio: 1000 }, freeDaily: 20, rolloverMonths: 1 },
  rateCard: [
    { action: 'agent_edit_fast',  label: 'Agent edit, fast model',         route: '/api/ai/agent',       credits: 1, paidCredits: 0 },
    { action: 'agent_edit_pro',   label: 'Agent edit, pro model',          route: '/api/ai/agent',       credits: 6 },
    { action: 'image_1080',       label: 'Image, 1080p',                   route: '/api/ai/image',       credits: 10 },
    { action: 'image_to_3d',      label: 'Image to 3D, textured',          route: '/api/3d/generate',    credits: 100 },
    { action: 'rig_repose',       label: 'Auto-rig, repose first',         route: '/api/3d/rig',         credits: 40 },
    { action: 'animation_clip',   label: 'Animation clip, each',           route: '/api/3d/rig',         credits: 15 },
    { action: 'world_draft',      label: 'World, draft',                   route: '/api/world/generate', credits: 40 },
    { action: 'world_full',       label: 'World, full quality',            route: '/api/world/generate', credits: 300 },
    { action: 'hero_video',       label: 'Hero video, 8 s, one aspect',    route: '/api/ai/video',       credits: 240 },
    { action: 'hero_video_pair',  label: 'Hero video pair, 16:9 and 9:16', route: '/api/ai/video',       credits: 480 },
    { action: 'template_restyle', label: 'Restyle a template with your own product', route: 'bundle',    credits: 150 },
    { action: 'doctrine_tool',    label: 'Doctrine tool call',             route: 'hosted MCP',          credits: 6 },
  ],
  packs: [
    { sku: 'cnvs-credits-1k',   credits: 1000,   usd: 10,  recurring: false },
    { sku: 'cnvs-credits-5k',   credits: 5000,   usd: 45,  recurring: false },
    { sku: 'cnvs-credits-20k',  credits: 20000,  usd: 160, recurring: false },
    { sku: 'cnvs-credits-100k', credits: 100000, usd: 700, recurring: false },
  ],
  dev: { lifetimeDays: 7, bootsPerDay: 500, ipsPerDay: 25 },
  graceDays: 14,
  fairUse: { fastEditsPerDay: 300 },
  entitlement: { prodTtlHours: 24, graceHours: 72 },
};

export function cnvsDefaults(): CnvsSettings {
  return structuredClone(CNVS_DEFAULTS);
}

// ---------------------------------------------------------------------------
// Validation — a local re-implementation of the rules cnvs-4 applies to us.
// ---------------------------------------------------------------------------

/** Rule 3: a real, finite, non-negative integer. Rejects strings and floats. */
function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}
/** Rule 5: finite and > 0. Prices may be fractional (e.g. $12.50/seat). */
function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}
/** Rule 5: finite and >= 0. */
function isNonNegNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Per-section validators. Each returns a list of human-readable problems. */
export const CNVS_VALIDATORS: Record<CnvsSection, (value: unknown) => string[]> = {
  plans(value) {
    const errs: string[] = [];
    if (!isPlainObject(value)) return ['plans: expected an object'];
    for (const tier of ['pro', 'studio'] as const) {
      const p = value[tier];
      if (!isPlainObject(p)) { errs.push(`plans.${tier}: expected an object`); continue; }
      // Rule 5: prices positive, seat floor non-negative.
      if (!isPositiveNumber(p.monthlyUsd)) errs.push(`plans.${tier}.monthlyUsd: must be a positive number`);
      if (!isPositiveNumber(p.annualUsd))  errs.push(`plans.${tier}.annualUsd: must be a positive number`);
      if (!isNonNegNumber(p.minSeats))     errs.push(`plans.${tier}.minSeats: must be a non-negative number`);
    }
    return errs;
  },

  credits(value) {
    const errs: string[] = [];
    if (!isPlainObject(value)) return ['credits: expected an object'];
    const perSeat = value.perSeat;
    if (!isPlainObject(perSeat)) {
      errs.push('credits.perSeat: expected an object');
    } else {
      for (const tier of ['pro', 'studio'] as const) {
        if (!isNonNegNumber(perSeat[tier])) errs.push(`credits.perSeat.${tier}: must be a non-negative number`);
      }
    }
    if (!isNonNegNumber(value.freeDaily))      errs.push('credits.freeDaily: must be a non-negative number');
    if (!isNonNegNumber(value.rolloverMonths)) errs.push('credits.rolloverMonths: must be a non-negative number');
    return errs;
  },

  rateCard(value) {
    const errs: string[] = [];
    if (!Array.isArray(value)) return ['rateCard: expected an array'];

    const seen = new Set<string>();
    for (const [i, raw] of value.entries()) {
      if (!isPlainObject(raw)) { errs.push(`rateCard[${i}]: expected an object`); continue; }
      const action = raw.action;
      // Rule 2: an action cnvs-4 does not know poisons the whole card.
      if (typeof action !== 'string' || !(CNVS_ACTIONS as readonly string[]).includes(action)) {
        errs.push(`rateCard[${i}].action: "${String(action)}" is not one of the twelve known actions`);
        continue;
      }
      if (seen.has(action)) errs.push(`rateCard: duplicate entry for "${action}"`);
      seen.add(action);

      if (!isNonEmptyString(raw.label)) errs.push(`rateCard[${action}].label: must be a non-empty string`);
      if (!isNonEmptyString(raw.route)) errs.push(`rateCard[${action}].route: must be a non-empty string`);
      // Rule 3.
      if (!isNonNegInt(raw.credits)) {
        errs.push(`rateCard[${action}].credits: must be a non-negative integer`);
      } else if (raw.credits > MAX_ACTION_CREDITS) {
        // Rule 4.
        errs.push(`rateCard[${action}].credits: ${raw.credits} exceeds the ${MAX_ACTION_CREDITS} ceiling`);
      }
      // paidCredits is optional, but must obey rules 3 + 4 when present.
      if (raw.paidCredits !== undefined) {
        if (!isNonNegInt(raw.paidCredits)) {
          errs.push(`rateCard[${action}].paidCredits: must be a non-negative integer when present`);
        } else if (raw.paidCredits > MAX_ACTION_CREDITS) {
          errs.push(`rateCard[${action}].paidCredits: ${raw.paidCredits} exceeds the ${MAX_ACTION_CREDITS} ceiling`);
        }
      }
    }

    // Rule 2: all twelve, or none of it counts.
    const missing = CNVS_ACTIONS.filter((a) => !seen.has(a));
    if (missing.length > 0) errs.push(`rateCard: missing ${missing.length} action(s): ${missing.join(', ')}`);
    return errs;
  },

  packs(value) {
    const errs: string[] = [];
    if (!Array.isArray(value)) return ['packs: expected an array'];
    if (value.length === 0) errs.push('packs: expected at least one pack');
    const seen = new Set<string>();
    for (const [i, raw] of value.entries()) {
      if (!isPlainObject(raw)) { errs.push(`packs[${i}]: expected an object`); continue; }
      if (!isNonEmptyString(raw.sku)) errs.push(`packs[${i}].sku: must be a non-empty string`);
      else if (seen.has(raw.sku)) errs.push(`packs: duplicate sku "${raw.sku}"`);
      else seen.add(raw.sku);
      // Rule 5.
      if (!isPositiveNumber(raw.credits)) errs.push(`packs[${i}].credits: must be a positive number`);
      if (!isPositiveNumber(raw.usd))     errs.push(`packs[${i}].usd: must be a positive number`);
      if (typeof raw.recurring !== 'boolean') errs.push(`packs[${i}].recurring: must be a boolean`);
    }
    return errs;
  },

  dev(value) {
    const errs: string[] = [];
    if (!isPlainObject(value)) return ['dev: expected an object'];
    for (const k of ['lifetimeDays', 'bootsPerDay', 'ipsPerDay'] as const) {
      if (!isNonNegNumber(value[k])) errs.push(`dev.${k}: must be a non-negative number`);
    }
    return errs;
  },

  graceDays(value) {
    return isNonNegNumber(value) ? [] : ['graceDays: must be a non-negative number'];
  },

  fairUse(value) {
    if (!isPlainObject(value)) return ['fairUse: expected an object'];
    return isNonNegNumber(value.fastEditsPerDay)
      ? []
      : ['fairUse.fastEditsPerDay: must be a non-negative number'];
  },

  entitlement(value) {
    const errs: string[] = [];
    if (!isPlainObject(value)) return ['entitlement: expected an object'];
    for (const k of ['prodTtlHours', 'graceHours'] as const) {
      if (!isNonNegNumber(value[k])) errs.push(`entitlement.${k}: must be a non-negative number`);
    }
    return errs;
  },
};

export function validateCnvsSection(section: CnvsSection, value: unknown): string[] {
  return CNVS_VALIDATORS[section](value);
}

/**
 * Full-payload gate. Mirrors what cnvs-4 does to our response, so nothing that
 * would be discarded on arrival can leave this process.
 */
export function validateCnvsSettings(payload: unknown): { ok: boolean; errors: string[] } {
  if (!isPlainObject(payload)) return { ok: false, errors: ['settings: expected an object'] };
  // Rule 1: a 200 must carry prices.
  if (Object.keys(payload).length === 0) return { ok: false, errors: ['settings: empty-payload'] };

  const errors: string[] = [];
  for (const section of CNVS_SECTIONS) {
    // Rule 6: an absent key is legal — cnvs-4 falls back to its own default.
    if (payload[section] === undefined) continue;
    errors.push(...validateCnvsSection(section, payload[section]));
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Assemble the payload we serve from whatever the settings store holds.
 *
 * Section-by-section: a stored value that validates wins; anything missing or
 * malformed degrades to the default for that section only. That is rule 6 used
 * deliberately — a bad row costs us one section's prices, not the entire
 * response (which cnvs-4 would throw away wholesale).
 */
export function buildCnvsSettings(stored: Record<string, unknown>): {
  settings: CnvsSettings;
  /** Sections that fell back, with the reason. Surfaced to admins, not to callers. */
  degraded: Array<{ section: CnvsSection; errors: string[] }>;
} {
  const settings = cnvsDefaults();
  const degraded: Array<{ section: CnvsSection; errors: string[] }> = [];

  for (const section of CNVS_SECTIONS) {
    const raw = stored[CNVS_SETTING_KEYS[section]];
    if (raw === undefined || raw === null) continue; // no row yet → default, silently
    const errors = validateCnvsSection(section, raw);
    if (errors.length > 0) { degraded.push({ section, errors }); continue; }
    (settings as unknown as Record<string, unknown>)[section] = normalizeSection(section, raw);
  }

  return { settings, degraded };
}

/**
 * Strip unknown properties and pin key order so the served payload contains
 * exactly the documented shape — a stored row with extra junk in it cannot
 * leak into the response.
 */
function normalizeSection(section: CnvsSection, raw: unknown): unknown {
  const o = raw as Record<string, any>;
  switch (section) {
    case 'plans':
      return {
        pro:    { monthlyUsd: o.pro.monthlyUsd,    annualUsd: o.pro.annualUsd,    minSeats: o.pro.minSeats },
        studio: { monthlyUsd: o.studio.monthlyUsd, annualUsd: o.studio.annualUsd, minSeats: o.studio.minSeats },
      } satisfies CnvsPlans;
    case 'credits':
      return {
        perSeat: { pro: o.perSeat.pro, studio: o.perSeat.studio },
        freeDaily: o.freeDaily,
        rolloverMonths: o.rolloverMonths,
      } satisfies CnvsCredits;
    case 'rateCard': {
      // Serve in the canonical action order regardless of how rows were stored.
      const byAction = new Map<string, Record<string, any>>(
        (raw as Array<Record<string, any>>).map((e) => [e.action as string, e]),
      );
      return CNVS_ACTIONS.map((action) => {
        const e = byAction.get(action)!;
        const entry: CnvsRateCardEntry = {
          action, label: e.label, route: e.route, credits: e.credits,
        };
        if (e.paidCredits !== undefined) entry.paidCredits = e.paidCredits;
        return entry;
      });
    }
    case 'packs':
      return (raw as Array<Record<string, any>>).map((p) => ({
        sku: p.sku, credits: p.credits, usd: p.usd, recurring: p.recurring,
      })) satisfies CnvsPack[];
    case 'dev':
      return { lifetimeDays: o.lifetimeDays, bootsPerDay: o.bootsPerDay, ipsPerDay: o.ipsPerDay } satisfies CnvsDev;
    case 'graceDays':
      return raw as number;
    case 'fairUse':
      return { fastEditsPerDay: o.fastEditsPerDay } satisfies CnvsFairUse;
    case 'entitlement':
      return { prodTtlHours: o.prodTtlHours, graceHours: o.graceHours } satisfies CnvsEntitlement;
  }
}
