/**
 * Release-channel selection. Update delivery serves the highest non-yanked
 * version in the requested channel:
 *   - stable clients see only `stable`
 *   - beta clients see `stable` + `rc` + `beta` (whichever version is highest)
 * Yanked releases are never served — that's the rollback lever (pull a bad
 * build and clients fall back to the previous good one automatically).
 */
import { db } from './db';

export type ReleaseChannel = 'stable' | 'beta';

export interface ReleasePick {
  version: string;
  download_url: string | null;
  changelog: string | null;
  release_notes: string | null;
  released_at: string;
  channel: string;
}

/** Numeric dotted-version compare. Returns >0 if a>b, <0 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Normalize an inbound channel hint from the SDK into 'stable' | 'beta'. */
export function normalizeChannel(input: unknown): ReleaseChannel {
  const s = String(input ?? '').toLowerCase();
  return s === 'beta' || s === 'rc' || s === '1' || s === 'true' ? 'beta' : 'stable';
}

export async function pickLatestRelease(productId: string, channel: ReleaseChannel = 'stable'): Promise<ReleasePick | null> {
  const allowed = channel === 'beta' ? ['stable', 'rc', 'beta'] : ['stable'];
  const { data } = await db()
    .from('product_releases')
    .select('version,download_url,changelog,release_notes,released_at,channel')
    .eq('product_id', productId)
    .eq('yanked', false)
    .in('channel', allowed);

  const rows = (data ?? []) as ReleasePick[];
  if (rows.length === 0) return null;
  rows.sort((a, b) => compareVersions(b.version, a.version) || (new Date(b.released_at).getTime() - new Date(a.released_at).getTime()));
  return rows[0];
}
