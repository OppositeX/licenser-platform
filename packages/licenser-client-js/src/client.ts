/**
 * LicenserClient — single class wrapping every public endpoint on the
 * Licenser platform. Isomorphic: works in Node 18+, browsers, edge runtimes.
 *
 * Designed to be safe to call from a browser (only /v2/validate is CORS-open;
 * other endpoints work but recommended from server). For React, see
 * `@gloo/licenser-client/react`.
 */
import { fetchJson } from './fetcher.js';
import type {
  ActivateInput, ActivateResult,
  DeactivateInput, DeactivateResult,
  FeedbackInput, FeedbackResult,
  LicenserClientOptions,
  UpdateCheckInput, UpdateCheckResult,
  ValidateResult,
} from './types.js';

export class LicenserClient {
  private readonly endpoint: string;
  private readonly productSlug: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly headers: Record<string, string>;

  constructor(opts: LicenserClientOptions) {
    if (!opts?.endpoint) throw new Error('LicenserClient: `endpoint` is required.');
    this.endpoint = opts.endpoint.replace(/\/$/, '');
    this.productSlug = opts.productSlug;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.fetchImpl = opts.fetch;
    this.headers = opts.headers ?? {};
  }

  private url(path: string): string {
    return `${this.endpoint}${path}`;
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return fetchJson<T>(this.url(path), {
      method: 'POST', body,
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal,
    });
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return fetchJson<T>(this.url(path), {
      method: 'GET',
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal,
    });
  }

  /** Activate a license on a site / instance. */
  activate(input: ActivateInput, signal?: AbortSignal): Promise<ActivateResult> {
    return this.post<ActivateResult>('/api/v1/activate', input, signal);
  }

  /** Deactivate a site. Optionally accompanied by feedback() afterwards. */
  deactivate(input: DeactivateInput, signal?: AbortSignal): Promise<DeactivateResult> {
    return this.post<DeactivateResult>('/api/v1/deactivate', input, signal);
  }

  /**
   * Validate a license — CNVS-4 shape (returns tier + features).
   * This is the CORS-open endpoint suitable for browser-direct calls.
   */
  validate(input: { key: string; domain?: string; slug?: string; fingerprint?: string }, signal?: AbortSignal): Promise<ValidateResult> {
    return this.post<ValidateResult>('/api/v2/validate', {
      ...input,
      slug: input.slug ?? this.productSlug,
    }, signal);
  }

  /** Legacy WP-SDK validate shape (no tier/features). Prefer validate(). */
  validateLegacy(input: { key: string; site_url?: string }, signal?: AbortSignal): Promise<{ ok: boolean; status?: string; expires_at?: string | null }> {
    return this.post('/api/v1/validate', input, signal);
  }

  /** Cheap heartbeat — same wire as validateLegacy but doesn't increment activation seen-at. */
  check(input: { key: string; site_url?: string }, signal?: AbortSignal): Promise<{ ok: boolean; status?: string; expires_at?: string | null }> {
    return this.post('/api/v1/check', input, signal);
  }

  /** Probe for a newer plugin version. */
  updateCheck(input: UpdateCheckInput, signal?: AbortSignal): Promise<UpdateCheckResult> {
    const qs = new URLSearchParams({
      key: input.key,
      ...(this.productSlug ? { product: this.productSlug } : {}),
      ...(input.current ? { current: input.current } : {}),
    });
    return this.get<UpdateCheckResult>(`/api/v1/update-check?${qs.toString()}`, signal);
  }

  /** Build a signed download URL. Returns the URL string; doesn't fetch the asset. */
  updateUrl(input: { key: string; version: string }): string {
    const qs = new URLSearchParams({
      key: input.key,
      v: input.version,
      ...(this.productSlug ? { product: this.productSlug } : {}),
    });
    return this.url(`/api/v1/update?${qs.toString()}`);
  }

  /** Submit deactivation feedback. */
  feedback(input: FeedbackInput, signal?: AbortSignal): Promise<FeedbackResult> {
    return this.post<FeedbackResult>('/api/v1/feedback', input, signal);
  }
}
