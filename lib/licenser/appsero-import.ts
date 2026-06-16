/**
 * AppSero CSV importer. Maps the typical AppSero license export to our schema.
 * AppSero exports vary; common columns we recognise (case-insensitive):
 *   license_key, customer_email, customer_name, product_slug (or product),
 *   plan (or plan_slug, variation), status, max_activations, expires_at,
 *   created_at, source_id (woo order id), source_type
 *
 * Anything we don't recognise is dropped silently. Rows missing license_key
 * are reported as errors. customer_email is recommended but not required.
 */
import { db } from './db';
import { generateLicenseKey } from './issuance';

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

/** Tolerant CSV parser — handles quoted fields, doubled quotes, and \r\n. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); out.push(row); }
  return out.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

const HEADER_ALIASES: Record<string, string[]> = {
  license_key:     ['license_key', 'key', 'license'],
  customer_email:  ['customer_email', 'email', 'user_email'],
  customer_name:   ['customer_name', 'name', 'fullname'],
  product_slug:    ['product_slug', 'product', 'plugin_slug'],
  plan_slug:       ['plan_slug', 'plan', 'variation'],
  status:          ['status', 'license_status'],
  max_activations: ['max_activations', 'activation_limit', 'activations_limit'],
  expires_at:      ['expires_at', 'expiry', 'expiration_date', 'expire_date'],
  source_id:       ['source_id', 'order_id', 'woo_order_id'],
  source_type:     ['source_type', 'source'],
};

function mapHeaders(header: string[]): Record<string, number> {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const map: Record<string, number> = {};
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = norm.indexOf(alias);
      if (idx !== -1) { map[canonical] = idx; break; }
    }
  }
  return map;
}

function pick(row: string[], idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const v = row[idx];
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function normaliseStatus(s: string | null): 'active' | 'suspended' | 'revoked' | 'expired' {
  if (!s) return 'active';
  const lower = s.toLowerCase();
  if (['active', 'enabled', 'valid'].includes(lower)) return 'active';
  if (['suspended', 'on-hold', 'paused'].includes(lower)) return 'suspended';
  if (['revoked', 'cancelled', 'canceled', 'refunded'].includes(lower)) return 'revoked';
  if (['expired'].includes(lower)) return 'expired';
  return 'active';
}

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export interface ImportOptions {
  dryRun: boolean;
  defaultProductSlug: string | null;
}

export async function importAppseroCsv(text: string, opts: ImportOptions): Promise<ImportResult> {
  const rows = parseCsv(text);
  if (rows.length === 0) return { total: 0, imported: 0, skipped: 0, errors: [{ row: 0, message: 'Empty file' }] };
  const headerMap = mapHeaders(rows[0]);
  if (headerMap.license_key === undefined) {
    return { total: 0, imported: 0, skipped: 0, errors: [{ row: 1, message: 'Could not find a license_key column. Headers seen: ' + rows[0].join(', ') }] };
  }
  const supa = db();

  // Pre-fetch products + plans for resolution.
  const [{ data: products }, { data: plans }] = await Promise.all([
    supa.from('products').select('id,slug'),
    supa.from('plans').select('id,slug,product_id'),
  ]);
  const productBySlug = new Map((products ?? []).map((p: { id: string; slug: string }) => [p.slug, p]));
  const planByKey = new Map((plans ?? []).map((p: { id: string; slug: string; product_id: string }) => [`${p.product_id}|${p.slug}`, p]));

  const result: ImportResult = { total: 0, imported: 0, skipped: 0, errors: [] };

  for (let i = 1; i < rows.length; i++) {
    result.total++;
    const row = rows[i];
    const key = pick(row, headerMap.license_key);
    if (!key) { result.skipped++; result.errors.push({ row: i + 1, message: 'Missing license_key' }); continue; }

    const productSlug = pick(row, headerMap.product_slug) ?? opts.defaultProductSlug;
    if (!productSlug) { result.skipped++; result.errors.push({ row: i + 1, message: 'No product_slug column and no default selected' }); continue; }
    const product = productBySlug.get(productSlug);
    if (!product) { result.skipped++; result.errors.push({ row: i + 1, message: `Unknown product slug "${productSlug}"` }); continue; }

    const planSlug = pick(row, headerMap.plan_slug);
    const plan = planSlug ? planByKey.get(`${product.id}|${planSlug}`) : undefined;

    const insertRow = {
      product_id: product.id,
      plan_id: plan?.id ?? null,
      customer_email: pick(row, headerMap.customer_email)?.toLowerCase() ?? null,
      customer_name: pick(row, headerMap.customer_name),
      key: key.startsWith('LIC-') || key.startsWith('LCR-') ? key : key, // keep customer's key verbatim
      status: normaliseStatus(pick(row, headerMap.status)),
      max_activations: Math.max(1, parseInt(pick(row, headerMap.max_activations) ?? '1', 10) || 1),
      expires_at: parseDate(pick(row, headerMap.expires_at)),
      woo_order_id: pick(row, headerMap.source_id),
    };

    if (opts.dryRun) { result.imported++; continue; }

    const { error } = await supa.from('licenses').insert(insertRow);
    if (error) {
      if (error.code === '23505') {
        // Duplicate key — keep existing license, treat as skipped.
        result.skipped++;
        result.errors.push({ row: i + 1, message: `Duplicate key "${key}" already exists; skipped` });
      } else {
        result.skipped++;
        result.errors.push({ row: i + 1, message: error.message });
      }
    } else {
      result.imported++;
    }
  }

  // Re-generate any keys that collided? The spec says preserve customer keys —
  // if they collide with existing rows we surface that as an error above so
  // the operator can decide what to do. We never silently replace a key.
  void generateLicenseKey;

  return result;
}
