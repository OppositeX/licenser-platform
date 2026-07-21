#!/usr/bin/env node
/**
 * Licenser MCP server. Exposes the Licenser platform's admin + read operations
 * as MCP tools so an agent can operate the licensing backend directly.
 *
 * Transport: stdio. Config via env (see README):
 *   LICENSER_SUPABASE_URL / LICENSER_SUPABASE_SERVICE_ROLE_KEY  (required, privileged)
 *   LICENSER_BASE_URL                                           (optional, for validate)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as db from './store.js';
const server = new McpServer({ name: 'licenser', version: '0.1.0' });
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (e) => ({
    isError: true,
    content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
});
// Glue: register a tool with a zod shape and a handler. Args are validated by
// the SDK against `shape` at call time; typed loosely here to avoid the SDK's
// generic-inference friction on the registration overload.
function tool(name, description, shape, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
handler) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool(name, description, shape, async (args) => {
        try {
            return ok(await handler(args));
        }
        catch (e) {
            return fail(e);
        }
    });
}
// ---- Read ----------------------------------------------------------------
tool('licenser_list_licenses', 'List licenses, optionally filtered by status, product slug, or customer email.', {
    status: z.enum(['active', 'suspended', 'revoked', 'expired']).optional(),
    product_slug: z.string().optional(),
    email: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
}, (a) => db.listLicenses({ status: a.status, productSlug: a.product_slug, email: a.email, limit: a.limit }));
tool('licenser_get_license', 'Get one license (by full key or id) with its plan, product, and activations.', {
    key: z.string().optional(),
    id: z.string().optional(),
}, (a) => db.getLicense({ key: a.key, id: a.id }));
tool('licenser_list_activations', 'List activation rows (domains) for a license, by license id or key.', {
    license_id: z.string().optional(),
    key: z.string().optional(),
}, (a) => db.listActivations({ licenseId: a.license_id, key: a.key }));
tool('licenser_list_products', 'List all products.', {}, () => db.listProducts());
tool('licenser_list_plans', 'List plans, optionally for one product slug.', {
    product_slug: z.string().optional(),
}, (a) => db.listPlans({ productSlug: a.product_slug }));
tool('licenser_list_releases', 'List product releases (newest first), optionally for one product slug.', {
    product_slug: z.string().optional(),
}, (a) => db.listReleases({ productSlug: a.product_slug }));
tool('licenser_recent_events', 'Recent activity events (issued/activated/revoked/webhooks).', {
    limit: z.number().int().min(1).max(200).optional(),
}, (a) => db.recentEvents(a.limit ?? 25));
tool('licenser_validation_stats', 'Validation-call counts grouped by result over the last N days.', {
    days: z.number().int().min(1).max(90).optional(),
}, (a) => db.validationStats(a.days ?? 7));
// ---- Write (admin) -------------------------------------------------------
tool('licenser_issue_license', 'Issue a new license. Returns the plaintext key ONCE — surface it to the operator; it is only stored hashed-of-record as key_prefix.', {
    product_slug: z.string(),
    customer_email: z.string(),
    plan_slug: z.string().optional(),
    customer_name: z.string().optional(),
    max_activations: z.number().int().min(1).optional(),
    expires_at: z.string().describe('ISO 8601, or omit for no expiry').optional(),
    key: z.string().describe('Preserve a specific key (e.g. Appsero import); omit to auto-generate').optional(),
}, (a) => db.issueLicense({
    productSlug: a.product_slug, planSlug: a.plan_slug, customerEmail: a.customer_email,
    customerName: a.customer_name, maxActivations: a.max_activations, expiresAt: a.expires_at, key: a.key,
}));
tool('licenser_set_license_status', 'Set a license status (active/suspended/revoked/expired), by key or id.', {
    status: z.enum(['active', 'suspended', 'revoked', 'expired']),
    key: z.string().optional(),
    id: z.string().optional(),
}, (a) => db.setLicenseStatus({ key: a.key, id: a.id, status: a.status }));
tool('licenser_deactivate_activation', 'Free an activation slot, by activation id or (key + domain).', {
    activation_id: z.string().optional(),
    key: z.string().optional(),
    domain: z.string().optional(),
}, (a) => db.deactivateActivation({ activationId: a.activation_id, key: a.key, domain: a.domain }));
tool('licenser_create_product', 'Create a product.', {
    slug: z.string(),
    name: z.string(),
    github_repo: z.string().describe('owner/repo for release webhooks').optional(),
}, (a) => db.createProduct({ slug: a.slug, name: a.name, githubRepo: a.github_repo }));
// ---- Public verify -------------------------------------------------------
tool('licenser_validate', 'Run a real validation against the live /api/v2/validate endpoint.', {
    key: z.string(),
    slug: z.string().optional(),
    domain: z.string().optional(),
}, (a) => db.validate({ key: a.key, slug: a.slug, domain: a.domain }));
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Logs go to stderr so stdout stays a clean MCP channel.
    console.error('licenser-mcp: ready on stdio');
}
main().catch((e) => {
    console.error('licenser-mcp: fatal', e);
    process.exit(1);
});
