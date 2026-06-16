'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LicenserClient } from '../client.js';
import type { LicenserClientOptions, ValidateResult } from '../types.js';
import { useLicenseContext } from './LicenseProvider.js';

/**
 * Process-wide cache shared across all useLicense() callers. Keyed by
 * `${endpoint}|${productSlug}|${key}`. We track both the resolved result and
 * the in-flight promise so two components mounting simultaneously don't fire
 * two network calls.
 */
interface CacheEntry {
  result?: ValidateResult;
  error?: Error;
  promise?: Promise<ValidateResult>;
  ts: number;
}
const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();

function cacheKey(endpoint: string, productSlug: string | undefined, key: string) {
  return `${endpoint}|${productSlug ?? ''}|${key}`;
}

function notify(k: string) {
  const ls = listeners.get(k);
  if (!ls) return;
  for (const l of ls) l();
}

export interface UseLicenseOptions extends Partial<LicenserClientOptions> {
  /** Required. The license key being validated. Empty string => idle. */
  key: string;
  /** Optional domain to scope the check. Defaults to window.location.hostname in the browser. */
  domain?: string;
  /** Optional fingerprint to identify the client (helps abuse detection). */
  fingerprint?: string;
  /** Re-validate at this interval (ms). 0 disables. Default: 60 * 60 * 1000. */
  refreshIntervalMs?: number;
  /** Re-validate when the window regains focus. Default: true. */
  revalidateOnFocus?: boolean;
  /** Treat a cached result as fresh for N ms. Default: 60_000. */
  dedupeMs?: number;
  /** Pre-built client (skips Provider lookup). */
  client?: LicenserClient;
}

export interface UseLicenseReturn {
  license: ValidateResult | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useLicense(opts: UseLicenseOptions): UseLicenseReturn {
  const ctx = useLicenseContext();
  const client = opts.client
    ?? ctx?.client
    ?? (opts.endpoint ? new LicenserClient({ endpoint: opts.endpoint, productSlug: opts.productSlug, timeoutMs: opts.timeoutMs }) : null);
  if (!client) {
    throw new Error('useLicense: no client. Wrap your app in <LicenseProvider endpoint="..." /> or pass `endpoint` / `client` to useLicense.');
  }

  const endpoint = (client as unknown as { endpoint?: string }).endpoint ?? opts.endpoint ?? '';
  const productSlug = opts.productSlug ?? ctx?.productSlug;
  const refreshIntervalMs = opts.refreshIntervalMs ?? 60 * 60 * 1000;
  const revalidateOnFocus = opts.revalidateOnFocus ?? true;
  const dedupeMs = opts.dedupeMs ?? 60_000;

  const k = cacheKey(endpoint, productSlug, opts.key);

  const [, force] = useState(0);
  const triggerRender = useCallback(() => force((n) => n + 1), []);

  // Subscribe this component to cache invalidations for `k`.
  useEffect(() => {
    if (!opts.key) return;
    let set = listeners.get(k);
    if (!set) { set = new Set(); listeners.set(k, set); }
    set.add(triggerRender);
    return () => { set!.delete(triggerRender); if (set!.size === 0) listeners.delete(k); };
  }, [k, opts.key, triggerRender]);

  const fetchInflightRef = useRef<Promise<ValidateResult> | null>(null);

  const runValidate = useCallback(async (): Promise<void> => {
    if (!opts.key) return;
    const existing = cache.get(k);
    if (existing?.promise) { fetchInflightRef.current = existing.promise; try { await existing.promise; } catch { /* ignore */ } return; }

    const domain = opts.domain ?? (typeof window !== 'undefined' ? window.location.hostname : undefined);
    const promise = client.validate({ key: opts.key, domain, slug: productSlug, fingerprint: opts.fingerprint });
    cache.set(k, { ...(existing ?? { ts: 0 }), promise });
    notify(k);
    try {
      const result = await promise;
      cache.set(k, { result, ts: Date.now() });
      notify(k);
    } catch (err) {
      cache.set(k, { error: err as Error, ts: Date.now() });
      notify(k);
    }
  }, [client, k, opts.key, opts.domain, opts.fingerprint, productSlug]);

  // Initial fetch + interval + focus revalidation.
  useEffect(() => {
    if (!opts.key) return;
    const existing = cache.get(k);
    const stale = !existing || (Date.now() - existing.ts) > dedupeMs;
    if (stale) void runValidate();

    const id = refreshIntervalMs > 0 ? setInterval(() => { void runValidate(); }, refreshIntervalMs) : null;

    const onFocus = () => { void runValidate(); };
    if (revalidateOnFocus && typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }

    return () => {
      if (id) clearInterval(id);
      if (revalidateOnFocus && typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
  }, [k, opts.key, runValidate, refreshIntervalMs, revalidateOnFocus, dedupeMs]);

  const entry = cache.get(k);
  return {
    license: entry?.result ?? null,
    loading: !!entry?.promise && !entry?.result,
    error: entry?.error ?? null,
    refresh: runValidate,
  };
}

/** Test-only: clear the module-level cache. */
export function _resetLicenseCache() {
  cache.clear();
  listeners.clear();
}
