/**
 * Deployment-beacon normalisation (DET-001).
 *
 * CAVEAT ON THE BODY SHAPE — read before changing this.
 * The brief asks for the exact shape cnvs-4 posts, read from its caller. That
 * repository (GLOO-ooo/cnvs-4) is outside this session's GitHub scope, so the
 * caller could not be read and the field names below are NOT confirmed against
 * it. The table is therefore built to be shape-agnostic: the entire body is
 * stored verbatim in `payload`, and the columns are a best-effort projection
 * used only for indexing and the admin list. A name we guessed wrong costs a
 * null column, never a dropped beacon — and can be corrected here alone, with
 * no migration, once the caller is readable.
 */

/** Candidate keys per column, first match wins. Accepts camel and snake case. */
const FIELD_ALIASES: Record<string, string[]> = {
  deployment_id: ['deploymentId', 'deployment_id', 'deployId', 'deploy_id', 'deployment', 'buildId', 'build_id'],
  project:       ['project', 'projectId', 'project_id', 'projectSlug', 'project_slug', 'app', 'appId', 'site', 'siteId'],
  environment:   ['environment', 'env', 'target', 'vercelEnv', 'vercel_env', 'stage'],
  runtime:       ['runtime', 'platform', 'host', 'provider'],
  version:       ['version', 'appVersion', 'app_version', 'cnvsVersion', 'cnvs_version', 'buildVersion', 'build_version'],
  commit_sha:    ['commitSha', 'commit_sha', 'commit', 'sha', 'gitSha', 'git_sha', 'revision'],
  url:           ['url', 'deploymentUrl', 'deployment_url', 'origin', 'siteUrl', 'site_url', 'domain', 'hostname'],
  region:        ['region', 'vercelRegion', 'vercel_region', 'location'],
  event:         ['event', 'type', 'kind', 'reason'],
  status:        ['status', 'state', 'result'],
  fingerprint:   ['fingerprint', 'instanceId', 'instance_id', 'instanceToken', 'instance_token', 'machineId'],
};

/** Anything matching these holds a license key — never stored in full. */
const LICENSE_KEY_ALIASES = ['licenseKey', 'license_key', 'key', 'license'];

const MAX_TEXT = 512;

function readString(src: Record<string, unknown>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const v = src[alias];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, MAX_TEXT);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, MAX_TEXT);
  }
  return null;
}

/**
 * Flatten one level of nesting so `{ deployment: { id, url } }` and
 * `{ deploymentId, url }` both resolve. Top-level keys always win.
 */
function flatten(body: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        // `{ deployment: { id } }` → `deploymentId`, alongside a bare `id`.
        const camel = `${k}${nk.charAt(0).toUpperCase()}${nk.slice(1)}`;
        if (!(camel in flat)) flat[camel] = nv;
        if (!(nk in flat)) flat[nk] = nv;
      }
    }
  }
  return { ...flat, ...body };
}

export interface NormalizedBeacon {
  deployment_id: string | null;
  project: string | null;
  environment: string | null;
  runtime: string | null;
  version: string | null;
  commit_sha: string | null;
  url: string | null;
  region: string | null;
  event: string | null;
  status: string | null;
  fingerprint: string | null;
  license_key_prefix: string | null;
  payload: Record<string, unknown>;
  /** Full license key, if the body carried one. Used to resolve license_id — never stored. */
  licenseKey: string | null;
}

export function normalizeBeacon(body: Record<string, unknown>): NormalizedBeacon {
  const flat = flatten(body);

  const licenseKey = readString(flat, LICENSE_KEY_ALIASES);
  // Match licenses.key_prefix, which is `substr(key, 1, 8)`.
  const license_key_prefix = licenseKey ? licenseKey.slice(0, 8) : null;

  const out: NormalizedBeacon = {
    deployment_id: readString(flat, FIELD_ALIASES.deployment_id),
    project:       readString(flat, FIELD_ALIASES.project),
    environment:   readString(flat, FIELD_ALIASES.environment),
    runtime:       readString(flat, FIELD_ALIASES.runtime),
    version:       readString(flat, FIELD_ALIASES.version),
    commit_sha:    readString(flat, FIELD_ALIASES.commit_sha),
    url:           readString(flat, FIELD_ALIASES.url),
    region:        readString(flat, FIELD_ALIASES.region),
    event:         readString(flat, FIELD_ALIASES.event),
    status:        readString(flat, FIELD_ALIASES.status),
    fingerprint:   readString(flat, FIELD_ALIASES.fingerprint),
    license_key_prefix,
    payload: redactLicenseKeys(body),
    licenseKey,
  };
  return out;
}

/**
 * Replace any license key in the stored body with its 8-char prefix. The key is
 * the customer's credential; a beacon log is no place to keep a second copy of
 * it. Recurses so a nested `{ license: { key } }` is covered too.
 */
export function redactLicenseKeys(value: unknown, depth = 0): any {
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactLicenseKeys(v, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (LICENSE_KEY_ALIASES.includes(k) && typeof v === 'string') {
      out[k] = v.slice(0, 8) + (v.length > 8 ? '…' : '');
    } else {
      out[k] = redactLicenseKeys(v, depth + 1);
    }
  }
  return out;
}
