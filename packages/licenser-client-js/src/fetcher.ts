/**
 * Thin fetch wrapper: timeout, JSON parsing, error mapping. Stays isomorphic
 * (uses globalThis.fetch) so the same code runs in Node 18+, Bun, Deno, and
 * any modern browser.
 */
import { HttpError, NetworkError, TimeoutError } from './errors.js';

export interface FetchJsonOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const f = opts.fetchImpl ?? globalThis.fetch;
  if (typeof f !== 'function') {
    throw new NetworkError('No global fetch available. On Node, use v18+ or pass a fetch implementation via `fetch:` option.');
  }
  const timeoutMs = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // If a caller signal aborts, forward it.
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await f(url, {
      method: opts.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(timeoutMs);
    }
    throw new NetworkError(err instanceof Error ? err.message : String(err), err);
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }

  if (!res.ok) {
    throw new HttpError(res.status, parsed, `HTTP ${res.status} ${res.statusText}`);
  }
  return parsed as T;
}
