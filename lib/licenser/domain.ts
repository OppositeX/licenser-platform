/**
 * Normalize a URL or host string to a lowercase bare hostname.
 *  - "https://www.Example.com/path"  -> "example.com"
 *  - "Example.COM"                   -> "example.com"
 *  - "example.com:8080"              -> "example.com"
 * Returns "" if the input is unusable.
 */
export function normalizeDomain(input: string): string {
  if (!input) return '';
  let s = String(input).trim();
  if (!s) return '';
  try {
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    const u = new URL(s);
    let host = (u.hostname || '').toLowerCase();
    host = host.replace(/^www\./, '');
    return host;
  } catch {
    return '';
  }
}
