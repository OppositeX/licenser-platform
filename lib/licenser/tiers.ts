/**
 * Canonical CNVS-4 tier → feature flag map. Mirrors the one in
 * @gloo-ooo/cnvs-licenser (see GLOO-ooo/cnvs-4). Per-plan overrides live
 * in `plans.feature_flags` (jsonb) — if non-empty, that wins.
 *
 * Locked by Omri 2026-06-14. Don't add image-gen / Jepeto / Omnicity here —
 * M5 was killed.
 */

export type CnvsTier = 'starter' | 'pro' | 'studio_pro' | 'enterprise';

/** Map a plan.slug (e.g. 'starter_monthly', 'pro_annual', 'studio_monthly') to a canonical tier. */
export function planSlugToTier(planSlug: string | null | undefined): CnvsTier | null {
  if (!planSlug) return null;
  const s = planSlug.toLowerCase();
  if (s.startsWith('enterprise')) return 'enterprise';
  if (s.startsWith('studio'))     return 'studio_pro';
  if (s.startsWith('pro'))        return 'pro';
  if (s.startsWith('starter'))    return 'starter';
  // Fall through — if someone hand-types 'free' or 'team', they get null.
  return null;
}

export const TIER_FEATURES: Record<CnvsTier, string[]> = {
  starter:    ['preset-library'],
  pro:        ['preset-library', 'ai-relay', 'copilot'],
  studio_pro: ['preset-library', 'ai-relay', 'copilot', 'connector-*', 'white-label'],
  enterprise: ['preset-library', 'ai-relay', 'copilot', 'connector-*', 'white-label', 'sso', 'dedicated-support'],
};

/**
 * Resolve effective feature list for a license.
 *  - If the plan row carries `feature_flags` jsonb (array of strings), return that.
 *  - Else fall back to the canonical tier map.
 *  - 'connector-*' is a wildcard the SDK expands per-connector at runtime; we ship it raw.
 */
export function resolveFeatures(planSlug: string | null, planFlags: unknown): string[] {
  if (Array.isArray(planFlags) && planFlags.length > 0 && planFlags.every((f) => typeof f === 'string')) {
    return planFlags as string[];
  }
  const tier = planSlugToTier(planSlug);
  return tier ? TIER_FEATURES[tier] : [];
}
