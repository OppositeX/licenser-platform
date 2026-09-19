/**
 * Scoped vending MCP — Streamable HTTP transport (JSON-RPC 2.0 over POST).
 *
 * This is the endpoint the CNVS agent calls to mint and manage its own seats
 * and credits. It is a thin bridge: each `tools/call` is dispatched to the
 * matching `/api/admin/vending/*` REST route with the caller's own Bearer
 * token, so all scope checks, validation, dry-run and audit live in one place
 * (the REST handlers) and are never duplicated here.
 *
 *   POST  { jsonrpc:"2.0", id, method, params }
 *     initialize · tools/list · tools/call · ping · notifications/*
 *   GET → 405 (no SSE; matches the CNVS-side transport shape)
 *
 * Auth: `Authorization: Bearer <scoped token>` — a valid active token gates
 * initialize/tools/list; each tool's specific scope is enforced downstream.
 * Refusals surface the downstream machine-readable `reason`.
 */
import { resolveToken } from '@/lib/admin-api/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERVER_INFO = { name: 'licenser-vending', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  route: { method: 'GET' | 'POST' | 'PATCH'; path: string };
}

const TOOLS: ToolDef[] = [
  {
    name: 'license.issue',
    description: 'Issue a new cnvs-runtime license for a customer. Returns the full license key (deliver it to the customer) and license_id. dry_run:true validates and returns what would be created without issuing.',
    inputSchema: {
      type: 'object',
      required: ['plan_slug', 'customer_email'],
      properties: {
        plan_slug: { type: 'string', description: 'cnvs-runtime plan slug, e.g. starter_annual | designer_annual | powerhouse_annual | enterprise' },
        customer_email: { type: 'string' },
        customer_name: { type: 'string' },
        expires_at: { type: 'string', description: 'ISO timestamp; omit for none' },
        max_activations: { type: 'integer', description: 'override the plan default (seats/sites)' },
        woo_order_id: { type: 'string', description: 'idempotency: a repeat issue for the same order returns the existing license' },
        dry_run: { type: 'boolean' },
      },
    },
    route: { method: 'POST', path: '/api/admin/vending/cnvs/license' },
  },
  {
    name: 'license.get',
    description: 'Look up a cnvs-runtime license by license_id or key. Returns status, active, plan, seats, expiry.',
    inputSchema: {
      type: 'object',
      properties: { license_id: { type: 'string' }, key: { type: 'string' } },
    },
    route: { method: 'GET', path: '/api/admin/vending/cnvs/license' },
  },
  {
    name: 'license.set_status',
    description: 'Change a cnvs-runtime license status (active|suspended|revoked|expired). dry_run:true returns the intended change without applying it.',
    inputSchema: {
      type: 'object',
      required: ['license_id', 'status'],
      properties: {
        license_id: { type: 'string' },
        status: { type: 'string', enum: ['active', 'suspended', 'revoked', 'expired'] },
        reason: { type: 'string' },
        dry_run: { type: 'boolean' },
      },
    },
    route: { method: 'PATCH', path: '/api/admin/vending/cnvs/license' },
  },
  {
    name: 'credits.grant',
    description: 'Dispatch a signed credit-pack top-up (license.credits_purchased). Idempotent on woo_order_id. dry_run:true returns the exact payload + targets without signing or sending.',
    inputSchema: {
      type: 'object',
      required: ['license_id', 'woo_order_id', 'credit_pack'],
      properties: {
        license_id: { type: 'string' },
        woo_order_id: { type: 'string', description: 'idempotency key — must be stable per order' },
        credit_pack: {
          type: 'object',
          required: ['sku', 'credits'],
          properties: { sku: { type: 'string' }, credits: { type: 'integer' }, quantity: { type: 'integer' } },
        },
        customer_email: { type: 'string' },
        product_slug: { type: 'string' },
        plan_slug: { type: 'string' },
        dry_run: { type: 'boolean' },
      },
    },
    route: { method: 'POST', path: '/api/admin/vending/cnvs/credits' },
  },
  {
    name: 'settings.get',
    description: 'Read the live cnvs.* pricing settings (plans, credits, rateCard, packs, dev, graceDays, fairUse, entitlement) so the two sides can diff instead of assert.',
    inputSchema: { type: 'object', properties: {} },
    route: { method: 'GET', path: '/api/admin/vending/cnvs/settings' },
  },
  {
    name: 'settings.update',
    description: 'Write one or more cnvs.* pricing sections. Contract-validated and refuse-whole: if any section is invalid, nothing is written. dry_run:true validates and reports without writing.',
    inputSchema: {
      type: 'object',
      required: ['sections'],
      properties: {
        sections: {
          type: 'object',
          description: 'Map of section name → new value. Any of: plans, credits, rateCard, packs, dev, graceDays, fairUse, entitlement.',
        },
        dry_run: { type: 'boolean' },
      },
    },
    route: { method: 'PATCH', path: '/api/admin/vending/cnvs/settings' },
  },
];

const rpc = (id: unknown, result: unknown) => Response.json({ jsonrpc: '2.0', id, result });
const rpcErr = (id: unknown, code: number, message: string, data?: unknown, httpStatus = 200) =>
  Response.json({ jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } }, { status: httpStatus });

export async function GET() {
  return Response.json({ ok: false, error: 'use POST (JSON-RPC 2.0); no SSE transport' }, { status: 405, headers: { allow: 'POST' } });
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const origin = new URL(req.url).origin;

  let msg: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try { msg = await req.json(); } catch { return rpcErr(null, -32700, 'Parse error'); }
  const { id = null, method, params } = msg;
  if (!method) return rpcErr(id, -32600, 'Invalid Request: no method');

  // Notifications (no id, no response expected).
  if (method.startsWith('notifications/')) return new Response(null, { status: 202 });
  if (method === 'ping') return rpc(id, {});

  if (method === 'initialize') {
    const token = await resolveToken(req);
    if (!token) return rpcErr(id, -32001, 'Unauthorized: valid Bearer token required', undefined, 401);
    return rpc(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO });
  }

  if (method === 'tools/list') {
    const token = await resolveToken(req);
    if (!token) return rpcErr(id, -32001, 'Unauthorized: valid Bearer token required', undefined, 401);
    return rpc(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  }

  if (method === 'tools/call') {
    const name = params?.name as string | undefined;
    const args = (params?.arguments as Record<string, unknown> | undefined) ?? {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return rpcErr(id, -32602, `Unknown tool: ${name ?? '(none)'}`);

    // Bridge to the REST route with the caller's own Authorization header.
    let url = origin + tool.route.path;
    const init: RequestInit = { method: tool.route.method, headers: { authorization: authHeader } };
    if (tool.route.method === 'GET') {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(args)) if (v !== undefined && v !== null) qs.set(k, String(v));
      const q = qs.toString();
      if (q) url += '?' + q;
    } else {
      (init.headers as Record<string, string>)['content-type'] = 'application/json';
      init.body = JSON.stringify(args);
    }

    let downstream: Response;
    try { downstream = await fetch(url, init); } catch (e) {
      return rpcErr(id, -32003, 'Tool dispatch failed', { error: e instanceof Error ? e.message : String(e) });
    }
    const text = await downstream.text();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { payload = { ok: false, raw: text }; }

    // MCP tool result: the JSON payload as text content; isError mirrors the
    // downstream HTTP status so a refusal (with its `reason`) reaches the caller.
    return rpc(id, {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      isError: !downstream.ok,
      structuredContent: payload,
    });
  }

  return rpcErr(id, -32601, `Method not found: ${method}`);
}
