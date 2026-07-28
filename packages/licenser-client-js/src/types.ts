/**
 * Shared types between the client, React hook, and consumer apps.
 *
 * These mirror the wire format of the Licenser platform's REST endpoints.
 * Keep in sync with `lib/licenser/validate.ts` in the platform repo.
 */

export type LicenseStatus = 'active' | 'suspended' | 'revoked' | 'expired';

export type LicenseTier = 'starter' | 'pro' | 'studio_pro' | 'enterprise' | null;

export type ValidateReason =
  | 'UNKNOWN_KEY'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUSPENDED'
  | 'DOMAIN_NOT_AUTHORIZED'
  | 'PRODUCT_MISMATCH';

/** Response shape for /api/v2/validate. */
export interface ValidateResult {
  active: boolean;
  reason?: ValidateReason;
  tier: LicenseTier;
  plan_slug: string | null;
  expires_at: string | null;
  features: string[];
  customer_email: string | null;
  product_slug: string | null;
  license_id: string | null;
  product_id: string | null;
  domain: string | null;
}

export interface ActivateInput {
  key: string;
  domain?: string;
  site_url?: string;
  plugin_version?: string;
  wp_version?: string;
  php_version?: string;
  fingerprint?: string;
}

export interface ActivateResult {
  ok: boolean;
  instance_token?: string;
  max_activations?: number;
  active_activations?: number;
  error?: string;
}

export interface DeactivateInput {
  key: string;
  domain?: string;
  site_url?: string;
  instance_token?: string;
}

export interface DeactivateResult {
  ok: boolean;
  error?: string;
}

export interface UpdateCheckInput {
  key: string;
  current?: string;
}

export interface UpdateCheckResult {
  update_available: boolean;
  version?: string;
  download_url?: string;
  changelog?: string;
}

export type FeedbackReason = 'bug' | 'alternative' | 'no-longer-needed' | 'temporary' | 'other';

export interface FeedbackInput {
  key: string;
  reason: FeedbackReason;
  message?: string;
  domain?: string;
  site_url?: string;
}

export interface FeedbackResult {
  ok: boolean;
  error?: string;
}

/** Constructor options for LicenserClient. */
export interface LicenserClientOptions {
  /** Base URL of the Licenser platform, e.g. 'https://licenser.gloo.ooo'. No trailing slash required. */
  endpoint: string;
  /** Product slug as configured in the platform. Sent on every validate call. */
  productSlug?: string;
  /** Request timeout in ms. Defaults to 8000. */
  timeoutMs?: number;
  /** Override fetch (handy for tests or for piping through Next.js fetch caching). */
  fetch?: typeof fetch;
  /** Extra headers attached to every request. */
  headers?: Record<string, string>;
}
