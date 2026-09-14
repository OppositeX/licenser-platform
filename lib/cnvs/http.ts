/**
 * Shared response helpers for the public /api/v2 CNVS endpoints.
 *
 * These are read by cnvs-4 both server-side and from the browser (status
 * surface), so they carry the same open CORS posture /api/v2/validate already
 * uses. See TAKEOVER.md follow-up for tightening '*' to an allowlist.
 */
import { NextResponse } from 'next/server';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Max-Age':       '86400',
};

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * JSON with CORS and an explicit Cache-Control. Routes are `force-dynamic` so
 * they always read current data; the caching that matters is the CDN/client
 * cache this header drives.
 */
export function publicJson(
  body: unknown,
  opts: { status?: number; maxAge?: number; extra?: Record<string, string> } = {},
) {
  const { status = 200, maxAge, extra } = opts;
  const headers: Record<string, string> = { ...CORS_HEADERS, ...(extra ?? {}) };
  headers['Cache-Control'] = maxAge && maxAge > 0
    ? `public, max-age=${maxAge}`
    : 'no-store';
  return NextResponse.json(body as Record<string, unknown>, { status, headers });
}
