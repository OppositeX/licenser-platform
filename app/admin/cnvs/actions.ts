'use server';
/**
 * Server actions behind /admin/cnvs. Every write goes through
 * writeCnvsSections, which validates against the cnvs-4 contract before
 * storing and records the before/after in settings_audit.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/auth';
import { CnvsValidationError, writeCnvsSections } from '@/lib/cnvs/store';
import { CNVS_ACTIONS, cnvsDefaults, type CnvsSection } from '@/lib/cnvs/settings';

function str(fd: FormData, name: string): string {
  return String(fd.get(name) ?? '').trim();
}

/**
 * Numbers arrive from <input type="number"> as strings. An empty or
 * unparseable field becomes NaN rather than 0 on purpose — the validators
 * reject NaN, so a typo surfaces as an error instead of silently pricing
 * something at zero.
 */
function num(fd: FormData, name: string): number {
  const raw = str(fd, name);
  if (raw === '') return NaN;
  return Number(raw);
}

/** Same, but an empty field means "not set" for genuinely optional fields. */
function optNum(fd: FormData, name: string): number | undefined {
  const raw = str(fd, name);
  if (raw === '') return undefined;
  return Number(raw);
}

function done(changed: CnvsSection[]) {
  revalidatePath('/admin/cnvs');
  const msg = changed.length === 0
    ? 'No changes to save'
    : `Saved: ${changed.join(', ')} — live within the 5-minute cache window`;
  redirect(`/admin/cnvs?ok=${encodeURIComponent(msg)}`);
}

function fail(err: unknown): never {
  const message = err instanceof CnvsValidationError
    // Surface the contract violation itself — an admin needs to know which
    // price cnvs-4 would have rejected, not just that something was wrong.
    ? `Rejected (cnvs-4 would discard the whole payload): ${err.errors.join(' · ')}`
    : `Save failed: ${String((err as Error)?.message ?? err)}`;
  redirect(`/admin/cnvs?error=${encodeURIComponent(message.slice(0, 900))}`);
}

/** redirect() throws a control-flow signal; it must not be caught as an error. */
function isRedirect(e: unknown): boolean {
  return typeof (e as { digest?: string })?.digest === 'string'
    && (e as { digest: string }).digest.startsWith('NEXT_REDIRECT');
}

async function save(updates: Partial<Record<CnvsSection, unknown>>) {
  const { email } = await requireAdmin();
  let changed: CnvsSection[];
  try {
    ({ changed } = await writeCnvsSections(updates, email));
  } catch (err) {
    if (isRedirect(err)) throw err;
    fail(err);
  }
  done(changed);
}

export async function savePlans(fd: FormData) {
  await save({
    plans: {
      pro: {
        monthlyUsd: num(fd, 'pro_monthlyUsd'),
        annualUsd:  num(fd, 'pro_annualUsd'),
        minSeats:   num(fd, 'pro_minSeats'),
      },
      studio: {
        monthlyUsd: num(fd, 'studio_monthlyUsd'),
        annualUsd:  num(fd, 'studio_annualUsd'),
        minSeats:   num(fd, 'studio_minSeats'),
      },
    },
    credits: {
      perSeat: { pro: num(fd, 'perSeat_pro'), studio: num(fd, 'perSeat_studio') },
      freeDaily: num(fd, 'freeDaily'),
      rolloverMonths: num(fd, 'rolloverMonths'),
    },
  });
}

export async function saveRateCard(fd: FormData) {
  // Always emit all twelve actions in canonical order — a partial card is
  // rejected whole by cnvs-4, so the form has no way to drop one.
  const rateCard = CNVS_ACTIONS.map((action) => {
    const entry: Record<string, unknown> = {
      action,
      label:   str(fd, `rate_${action}_label`),
      route:   str(fd, `rate_${action}_route`),
      credits: num(fd, `rate_${action}_credits`),
    };
    const paid = optNum(fd, `rate_${action}_paid`);
    if (paid !== undefined) entry.paidCredits = paid;
    return entry;
  });
  await save({ rateCard });
}

export async function savePacks(fd: FormData) {
  const packs: Array<Record<string, unknown>> = [];
  // Row indexes are stable across the render; a removed or blank row is skipped.
  const count = Number(str(fd, 'pack_count') || '0');
  for (let i = 0; i < count; i++) {
    if (str(fd, `pack_${i}_remove`) === 'on') continue;
    const sku = str(fd, `pack_${i}_sku`);
    if (!sku) continue;
    packs.push({
      sku,
      credits:   num(fd, `pack_${i}_credits`),
      usd:       num(fd, `pack_${i}_usd`),
      recurring: str(fd, `pack_${i}_recurring`) === 'on',
    });
  }
  await save({ packs });
}

export async function saveLimits(fd: FormData) {
  await save({
    dev: {
      lifetimeDays: num(fd, 'dev_lifetimeDays'),
      bootsPerDay:  num(fd, 'dev_bootsPerDay'),
      ipsPerDay:    num(fd, 'dev_ipsPerDay'),
    },
    graceDays: num(fd, 'graceDays'),
    fairUse: { fastEditsPerDay: num(fd, 'fastEditsPerDay') },
    entitlement: {
      prodTtlHours: num(fd, 'prodTtlHours'),
      graceHours:   num(fd, 'graceHours'),
    },
  });
}

/** Restore one section to the v1 defaults cnvs-4 itself falls back to. */
export async function resetSection(fd: FormData) {
  const section = str(fd, 'section') as CnvsSection;
  const defaults = cnvsDefaults();
  if (!(section in defaults)) {
    redirect(`/admin/cnvs?error=${encodeURIComponent(`Unknown section "${section}"`)}`);
  }
  await save({ [section]: defaults[section] } as Partial<Record<CnvsSection, unknown>>);
}
