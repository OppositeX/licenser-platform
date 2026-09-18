/**
 * Audit trail for the vending API. Every call (read or write, real or dry-run)
 * lands one row in api_audit. Logging must never break the request it records.
 */
import { serviceClient } from '@/lib/supabase/service';

export interface AuditEntry {
  token_id: string | null;
  token_prefix: string | null;
  tool: string;
  scope: string | null;
  dry_run?: boolean;
  args?: unknown;
  ok?: boolean;
  status?: number | null;
  error?: string | null;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await serviceClient().from('api_audit').insert({
      token_id: entry.token_id,
      token_prefix: entry.token_prefix,
      tool: entry.tool,
      scope: entry.scope,
      dry_run: entry.dry_run ?? false,
      args: entry.args ?? null,
      ok: entry.ok ?? true,
      status: entry.status ?? null,
      error: entry.error ?? null,
    });
  } catch (e) {
    console.error('[vending/audit] failed', entry.tool, e);
  }
}
