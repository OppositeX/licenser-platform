/**
 * GET /admin/export/{licenses|activations}.csv — admin-gated CSV export.
 * Mirrors the AppSero importer on /admin/migration in the other direction.
 */
import { requireAdmin } from '@/lib/admin/auth';
import { db } from '@/lib/licenser/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 20000;

/** RFC-4180-ish CSV cell: quote when it contains a comma, quote, or newline. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(','), ...rows.map((r) => r.map(cell).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
}

export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  await requireAdmin();
  const { type } = await ctx.params;
  const kind = type.replace(/\.csv$/i, '');
  const supa = db();
  const stamp = new Date().toISOString().slice(0, 10);

  let csv: string;
  let filename: string;

  if (kind === 'licenses') {
    const { data } = await supa
      .from('licenses')
      .select('key,key_prefix,status,max_activations,expires_at,grace_until,customer_email,customer_name,woo_order_id,woo_subscription_id,created_at,products(slug),plans(slug)')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    csv = toCsv(
      ['key', 'key_prefix', 'status', 'product', 'plan', 'customer_email', 'customer_name', 'max_activations', 'expires_at', 'grace_until', 'woo_order_id', 'woo_subscription_id', 'created_at'],
      rows.map((r) => [
        r.key, r.key_prefix, r.status,
        (r.products as { slug?: string } | null)?.slug ?? '',
        (r.plans as { slug?: string } | null)?.slug ?? '',
        r.customer_email, r.customer_name, r.max_activations, r.expires_at, r.grace_until,
        r.woo_order_id, r.woo_subscription_id, r.created_at,
      ]),
    );
    filename = `licenses-${stamp}.csv`;
  } else if (kind === 'activations') {
    const { data } = await supa
      .from('activations')
      .select('site_url,status,ip,plugin_version,wp_version,php_version,last_seen_at,activated_at,licenses(key_prefix,customer_email,products(slug))')
      .order('activated_at', { ascending: false })
      .limit(MAX_ROWS);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    csv = toCsv(
      ['site_url', 'status', 'product', 'license_prefix', 'customer_email', 'plugin_version', 'wp_version', 'php_version', 'ip', 'last_seen_at', 'activated_at'],
      rows.map((r) => {
        const lic = r.licenses as { key_prefix?: string; customer_email?: string; products?: { slug?: string } | null } | null;
        return [
          r.site_url, r.status, lic?.products?.slug ?? '', lic?.key_prefix ?? '', lic?.customer_email ?? '',
          r.plugin_version, r.wp_version, r.php_version, r.ip, r.last_seen_at, r.activated_at,
        ];
      }),
    );
    filename = `activations-${stamp}.csv`;
  } else {
    return new Response('Unknown export type. Use licenses.csv or activations.csv.', { status: 404 });
  }

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
