import { describe, expect, it } from 'vitest';
import {
  buildCnvsSettings,
  cnvsDefaults,
  validateCnvsSection,
  CNVS_SETTING_KEYS,
} from '@/lib/cnvs/settings';

describe('cnvs perSeat carries the sold tiers', () => {
  it('defaults include starter/designer/powerhouse + pro/studio aliases', () => {
    const d = cnvsDefaults();
    expect(d.credits.perSeat).toMatchObject({ starter: 500, designer: 1500, powerhouse: 4000, pro: 500, studio: 1000 });
  });

  it('buildCnvsSettings preserves all stored tiers (does not strip to pro/studio)', () => {
    const stored = {
      [CNVS_SETTING_KEYS.credits]: {
        perSeat: { starter: 500, designer: 1500, powerhouse: 4000, pro: 500, studio: 1000 },
        freeDaily: 20, rolloverMonths: 1,
      },
    };
    const { settings, degraded } = buildCnvsSettings(stored);
    expect(degraded).toHaveLength(0);
    expect(settings.credits.perSeat).toEqual({ starter: 500, designer: 1500, powerhouse: 4000, pro: 500, studio: 1000 });
  });

  it('rejects a perSeat missing a sold tier (powerhouse)', () => {
    const errs = validateCnvsSection('credits', { perSeat: { starter: 500, designer: 1500, pro: 500, studio: 1000 }, freeDaily: 20, rolloverMonths: 1 });
    expect(errs.some((e) => e.includes('powerhouse'))).toBe(true);
  });

  it('accepts perSeat with only the three sold tiers (aliases optional)', () => {
    const errs = validateCnvsSection('credits', { perSeat: { starter: 500, designer: 1500, powerhouse: 4000 }, freeDaily: 20, rolloverMonths: 1 });
    expect(errs).toHaveLength(0);
  });

  it('strips unknown perSeat junk while keeping known tiers', () => {
    const stored = {
      [CNVS_SETTING_KEYS.credits]: {
        perSeat: { starter: 500, designer: 1500, powerhouse: 4000, bogus: 99 },
        freeDaily: 20, rolloverMonths: 1,
      },
    };
    const { settings } = buildCnvsSettings(stored);
    expect(settings.credits.perSeat).toEqual({ starter: 500, designer: 1500, powerhouse: 4000 });
    expect((settings.credits.perSeat as Record<string, number>).bogus).toBeUndefined();
  });
});
