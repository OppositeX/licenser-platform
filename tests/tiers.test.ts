import { describe, it, expect } from 'vitest';
import { planSlugToTier, resolveFeatures, TIER_FEATURES } from '@/lib/licenser/tiers';

describe('planSlugToTier', () => {
  it('maps known plan slug prefixes to tiers', () => {
    expect(planSlugToTier('starter_monthly')).toBe('starter');
    expect(planSlugToTier('pro_annual')).toBe('pro');
    expect(planSlugToTier('studio_monthly')).toBe('studio_pro');
    expect(planSlugToTier('enterprise_custom')).toBe('enterprise');
  });
  it('is case-insensitive', () => {
    expect(planSlugToTier('PRO_MONTHLY')).toBe('pro');
  });
  it('returns null for unknown or empty slugs', () => {
    expect(planSlugToTier('free')).toBeNull();
    expect(planSlugToTier('team')).toBeNull();
    expect(planSlugToTier(null)).toBeNull();
    expect(planSlugToTier(undefined)).toBeNull();
  });
});

describe('resolveFeatures', () => {
  it('falls back to the canonical tier map', () => {
    expect(resolveFeatures('pro_monthly', undefined)).toEqual(TIER_FEATURES.pro);
    expect(resolveFeatures('starter_annual', [])).toEqual(TIER_FEATURES.starter);
  });
  it('prefers a non-empty per-plan feature_flags override', () => {
    expect(resolveFeatures('starter_monthly', ['preset-library', 'ai-relay'])).toEqual(['preset-library', 'ai-relay']);
  });
  it('ignores a malformed override and uses the tier map', () => {
    expect(resolveFeatures('pro_monthly', [1, 2, 3])).toEqual(TIER_FEATURES.pro);
    expect(resolveFeatures('pro_monthly', 'not-an-array')).toEqual(TIER_FEATURES.pro);
  });
  it('returns [] for an unmappable plan with no override', () => {
    expect(resolveFeatures('free', undefined)).toEqual([]);
    expect(resolveFeatures(null, undefined)).toEqual([]);
  });
});
