import { describe, it, expect } from 'vitest';
import {
  CNVS_ACTIONS,
  CNVS_SETTING_KEYS,
  MAX_ACTION_CREDITS,
  buildCnvsSettings,
  cnvsDefaults,
  validateCnvsSection,
  validateCnvsSettings,
} from '@/lib/cnvs/settings';

/**
 * These tests are the check against the six contract rules cnvs-4 applies to
 * GET /api/v2/cnvs/settings. A payload that trips any of them is discarded
 * whole by cnvs-4 — which looks healthy from our side and changes nothing in
 * the product — so each rule gets an explicit test.
 */

const defaults = cnvsDefaults();

describe('the payload we serve by default', () => {
  it('passes the full contract', () => {
    expect(validateCnvsSettings(defaults)).toEqual({ ok: true, errors: [] });
  });

  it('matches the v1 numbers cnvs-4 falls back to', () => {
    expect(defaults.plans.pro).toEqual({ monthlyUsd: 15, annualUsd: 12, minSeats: 1 });
    expect(defaults.plans.studio).toEqual({ monthlyUsd: 25, annualUsd: 20, minSeats: 2 });
    expect(defaults.credits).toEqual({ perSeat: { pro: 500, studio: 1000 }, freeDaily: 20, rolloverMonths: 1 });
    expect(defaults.dev).toEqual({ lifetimeDays: 7, bootsPerDay: 500, ipsPerDay: 25 });
    expect(defaults.graceDays).toBe(14);
    expect(defaults.fairUse).toEqual({ fastEditsPerDay: 300 });
    expect(defaults.entitlement).toEqual({ prodTtlHours: 24, graceHours: 72 });
    expect(defaults.packs).toHaveLength(4);
    expect(defaults.packs.map((p) => p.sku)).toEqual([
      'cnvs-credits-1k', 'cnvs-credits-5k', 'cnvs-credits-20k', 'cnvs-credits-100k',
    ]);
  });

  it('prices exactly the twelve known actions, in canonical order', () => {
    expect(defaults.rateCard.map((r) => r.action)).toEqual([...CNVS_ACTIONS]);
  });

  it('only sets paidCredits where it differs from credits', () => {
    const fast = defaults.rateCard.find((r) => r.action === 'agent_edit_fast')!;
    expect(fast.paidCredits).toBe(0);
    expect(defaults.rateCard.filter((r) => r.paidCredits !== undefined)).toHaveLength(1);
  });
});

describe('rule 1 — a 200 must carry prices', () => {
  it('rejects an empty object as empty-payload', () => {
    const res = validateCnvsSettings({});
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toContain('empty-payload');
  });

  it('rejects a non-object', () => {
    expect(validateCnvsSettings(null).ok).toBe(false);
    expect(validateCnvsSettings([]).ok).toBe(false);
    expect(validateCnvsSettings('nope').ok).toBe(false);
  });
});

describe('rule 2 — the rate card must price all twelve actions', () => {
  it('rejects a partial card', () => {
    const partial = defaults.rateCard.slice(0, 5);
    const errs = validateCnvsSection('rateCard', partial);
    expect(errs.join(' ')).toContain('missing 7 action(s)');
  });

  it('rejects an action cnvs-4 does not know', () => {
    const card = defaults.rateCard.map((r) => ({ ...r }));
    card[0] = { ...card[0], action: 'agent_edit_turbo' as never };
    const errs = validateCnvsSection('rateCard', card);
    expect(errs.join(' ')).toContain('not one of the twelve known actions');
  });

  it('rejects a duplicated action', () => {
    const card = [...defaults.rateCard.map((r) => ({ ...r })), { ...defaults.rateCard[0] }];
    expect(validateCnvsSection('rateCard', card).join(' ')).toContain('duplicate entry');
  });

  it('accepts the twelve in any order', () => {
    const shuffled = [...defaults.rateCard].reverse();
    expect(validateCnvsSection('rateCard', shuffled)).toEqual([]);
  });
});

describe('rule 3 — credits and paidCredits are non-negative integers', () => {
  const withCredits = (value: unknown) =>
    defaults.rateCard.map((r, i) => (i === 0 ? { ...r, credits: value } : r));

  it.each([
    ['a string', '10'],
    ['a float', 10.5],
    ['null', null],
    ['undefined', undefined],
    ['negative', -1],
    ['NaN', NaN],
  ])('rejects %s', (_label, value) => {
    expect(validateCnvsSection('rateCard', withCredits(value)).join(' '))
      .toContain('must be a non-negative integer');
  });

  it('accepts zero', () => {
    expect(validateCnvsSection('rateCard', withCredits(0))).toEqual([]);
  });

  it('applies the same rule to paidCredits when present', () => {
    const bad = defaults.rateCard.map((r, i) => (i === 0 ? { ...r, paidCredits: 1.5 } : r));
    expect(validateCnvsSection('rateCard', bad).join(' '))
      .toContain('paidCredits: must be a non-negative integer');
  });

  it('allows paidCredits to be omitted entirely', () => {
    const noPaid = defaults.rateCard.map(({ paidCredits, ...rest }) => rest);
    expect(validateCnvsSection('rateCard', noPaid)).toEqual([]);
  });
});

describe('rule 4 — no action costs more than 100000 credits', () => {
  it('accepts exactly the ceiling', () => {
    const at = defaults.rateCard.map((r, i) => (i === 0 ? { ...r, credits: MAX_ACTION_CREDITS } : r));
    expect(validateCnvsSection('rateCard', at)).toEqual([]);
  });

  it('rejects one credit over', () => {
    const over = defaults.rateCard.map((r, i) => (i === 0 ? { ...r, credits: MAX_ACTION_CREDITS + 1 } : r));
    expect(validateCnvsSection('rateCard', over).join(' ')).toContain('exceeds the 100000 ceiling');
  });

  it('applies the ceiling to paidCredits too', () => {
    const over = defaults.rateCard.map((r, i) => (i === 0 ? { ...r, paidCredits: MAX_ACTION_CREDITS + 1 } : r));
    expect(validateCnvsSection('rateCard', over).join(' ')).toContain('paidCredits');
  });
});

describe('rule 5 — plan and pack money is positive, allowances non-negative', () => {
  it.each([
    ['monthlyUsd', 0],
    ['monthlyUsd', -5],
    ['annualUsd', 0],
  ])('rejects plans.pro.%s = %s', (field, value) => {
    const plans = { ...defaults.plans, pro: { ...defaults.plans.pro, [field]: value } };
    expect(validateCnvsSection('plans', plans).join(' ')).toContain('must be a positive number');
  });

  it('allows minSeats of zero but not negative', () => {
    const zero = { ...defaults.plans, pro: { ...defaults.plans.pro, minSeats: 0 } };
    expect(validateCnvsSection('plans', zero)).toEqual([]);
    const neg = { ...defaults.plans, pro: { ...defaults.plans.pro, minSeats: -1 } };
    expect(validateCnvsSection('plans', neg).join(' ')).toContain('minSeats');
  });

  it('rejects a pack priced at zero or with zero credits', () => {
    const zeroUsd = defaults.packs.map((p, i) => (i === 0 ? { ...p, usd: 0 } : p));
    expect(validateCnvsSection('packs', zeroUsd).join(' ')).toContain('usd: must be a positive number');
    const zeroCredits = defaults.packs.map((p, i) => (i === 0 ? { ...p, credits: 0 } : p));
    expect(validateCnvsSection('packs', zeroCredits).join(' ')).toContain('credits: must be a positive number');
  });

  it('allows credits.freeDaily and perSeat of zero', () => {
    expect(validateCnvsSection('credits', {
      perSeat: { pro: 0, studio: 0 }, freeDaily: 0, rolloverMonths: 0,
    })).toEqual([]);
  });

  it('rejects a non-boolean recurring flag', () => {
    const bad = defaults.packs.map((p, i) => (i === 0 ? { ...p, recurring: 'false' } : p));
    expect(validateCnvsSection('packs', bad).join(' ')).toContain('recurring: must be a boolean');
  });
});

describe('rule 6 — omitting a key is safe, malformed is not', () => {
  it('accepts a payload carrying only some sections', () => {
    expect(validateCnvsSettings({ graceDays: 30 })).toEqual({ ok: true, errors: [] });
    expect(validateCnvsSettings({ plans: defaults.plans })).toEqual({ ok: true, errors: [] });
  });

  it('rejects a malformed section even when others are fine', () => {
    const res = validateCnvsSettings({ plans: defaults.plans, graceDays: 'soon' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toContain('graceDays');
  });
});

describe('buildCnvsSettings', () => {
  it('returns defaults when the store is empty', () => {
    const { settings, degraded } = buildCnvsSettings({});
    expect(settings).toEqual(defaults);
    expect(degraded).toEqual([]);
  });

  it('serves a stored price over the default', () => {
    const { settings, degraded } = buildCnvsSettings({
      [CNVS_SETTING_KEYS.graceDays]: 30,
      [CNVS_SETTING_KEYS.plans]: {
        pro: { monthlyUsd: 19, annualUsd: 15, minSeats: 1 },
        studio: { monthlyUsd: 29, annualUsd: 24, minSeats: 3 },
      },
    });
    expect(settings.graceDays).toBe(30);
    expect(settings.plans.pro.monthlyUsd).toBe(19);
    expect(settings.plans.studio.minSeats).toBe(3);
    // Untouched sections keep their defaults.
    expect(settings.rateCard).toEqual(defaults.rateCard);
    expect(degraded).toEqual([]);
  });

  it('falls back per section — one bad row does not cost the whole payload', () => {
    const { settings, degraded } = buildCnvsSettings({
      [CNVS_SETTING_KEYS.graceDays]: 30,
      [CNVS_SETTING_KEYS.rateCard]: [{ action: 'agent_edit_fast', label: 'x', route: 'y', credits: 'free' }],
    });
    expect(settings.graceDays).toBe(30);              // good row applied
    expect(settings.rateCard).toEqual(defaults.rateCard); // bad row degraded
    expect(degraded.map((d) => d.section)).toEqual(['rateCard']);
    expect(validateCnvsSettings(settings).ok).toBe(true);
  });

  it('strips unknown properties out of a stored row', () => {
    const { settings } = buildCnvsSettings({
      [CNVS_SETTING_KEYS.fairUse]: { fastEditsPerDay: 500, secretFlag: true },
    });
    expect(settings.fairUse).toEqual({ fastEditsPerDay: 500 });
  });

  it('re-orders a stored rate card into canonical action order', () => {
    const { settings } = buildCnvsSettings({
      [CNVS_SETTING_KEYS.rateCard]: [...defaults.rateCard].reverse(),
    });
    expect(settings.rateCard.map((r) => r.action)).toEqual([...CNVS_ACTIONS]);
  });

  it('drops paidCredits from the served entry when the stored row omits it', () => {
    const { settings } = buildCnvsSettings({
      [CNVS_SETTING_KEYS.rateCard]: defaults.rateCard.map(({ paidCredits, ...rest }) => rest),
    });
    expect(settings.rateCard.every((r) => !('paidCredits' in r))).toBe(true);
  });

  it('always produces something cnvs-4 will accept, whatever the store holds', () => {
    const garbage = Object.fromEntries(
      Object.values(CNVS_SETTING_KEYS).map((k) => [k, { nonsense: true }]),
    );
    const { settings, degraded } = buildCnvsSettings(garbage);
    expect(validateCnvsSettings(settings)).toEqual({ ok: true, errors: [] });
    expect(degraded).toHaveLength(Object.keys(CNVS_SETTING_KEYS).length);
  });
});
