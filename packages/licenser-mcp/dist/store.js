import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
/**
 * Thin data layer for the MCP server. Talks to the same Supabase database the
 * Licenser platform uses, with the SERVICE-ROLE key (bypasses RLS). This is a
 * privileged surface — treat the env like an admin credential.
 */
let _client = null;
export function store() {
    if (_client)
        return _client;
    const url = process.env.LICENSER_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const key = process.env.LICENSER_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        '';
    if (!url || !key) {
        throw new Error('Missing Supabase config. Set LICENSER_SUPABASE_URL and LICENSER_SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    }
    _client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'X-Client-Info': 'licenser-mcp' } },
    });
    return _client;
}
/** Admin/manually-issued keys use the LIC- prefix (webhook-issued use LCR-). */
export function generateLicenseKey(prefix = 'LIC') {
    const seg = () => crypto.randomBytes(5).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
    return `${prefix}-${seg()}-${seg()}-${seg()}-${seg()}`;
}
async function productBySlug(slug) {
    const { data } = await store().from('products').select('id,slug,name').eq('slug', slug).maybeSingle();
    return data;
}
export async function listLicenses(args) {
    let q = store()
        .from('licenses')
        .select('id,key_prefix,customer_email,customer_name,status,max_activations,expires_at,grace_until,created_at,product_id,plan_id')
        .order('created_at', { ascending: false })
        .limit(Math.min(200, Math.max(1, args.limit ?? 50)));
    if (args.status)
        q = q.eq('status', args.status);
    if (args.email)
        q = q.ilike('customer_email', args.email);
    if (args.productSlug) {
        const p = await productBySlug(args.productSlug);
        if (!p)
            return [];
        q = q.eq('product_id', p.id);
    }
    const { data, error } = await q;
    if (error)
        throw error;
    return data ?? [];
}
export async function getLicense(args) {
    let q = store().from('licenses').select('*, products(slug,name), plans(slug,name,max_activations)');
    if (args.id)
        q = q.eq('id', args.id);
    else if (args.key)
        q = q.eq('key', args.key);
    else
        throw new Error('Provide key or id');
    const { data: license, error } = await q.maybeSingle();
    if (error)
        throw error;
    if (!license)
        return null;
    const { data: activations } = await store()
        .from('activations')
        .select('id,site_url,status,plugin_version,last_seen_at,activated_at')
        .eq('license_id', license.id)
        .order('activated_at', { ascending: false });
    return { ...license, activations: activations ?? [] };
}
export async function issueLicense(args) {
    const product = await productBySlug(args.productSlug);
    if (!product)
        throw new Error(`Unknown product slug "${args.productSlug}"`);
    let planId = null;
    let planMax = null;
    if (args.planSlug) {
        const { data: plan } = await store()
            .from('plans')
            .select('id,max_activations')
            .eq('product_id', product.id)
            .eq('slug', args.planSlug)
            .maybeSingle();
        if (!plan)
            throw new Error(`Unknown plan slug "${args.planSlug}" for product "${args.productSlug}"`);
        planId = plan.id;
        planMax = plan.max_activations;
    }
    const key = args.key ?? generateLicenseKey();
    const { data, error } = await store()
        .from('licenses')
        .insert({
        product_id: product.id,
        plan_id: planId,
        customer_email: args.customerEmail.toLowerCase(),
        customer_name: args.customerName ?? null,
        key,
        status: 'active',
        max_activations: args.maxActivations ?? planMax ?? 1,
        expires_at: args.expiresAt ?? null,
    })
        .select('id,key,key_prefix,status,max_activations,expires_at')
        .single();
    if (error)
        throw error;
    await store().from('events').insert({
        type: 'license.issued', license_id: data.id, product_id: product.id,
        data: { plan_slug: args.planSlug ?? null, by: 'mcp' },
    });
    return data; // includes the plaintext key — surface it once to the operator.
}
export async function setLicenseStatus(args) {
    const target = args.id ? { col: 'id', val: args.id } : { col: 'key', val: args.key };
    if (!target.val)
        throw new Error('Provide key or id');
    const { data, error } = await store()
        .from('licenses')
        .update({ status: args.status })
        .eq(target.col, target.val)
        .select('id,key_prefix,status')
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new Error('License not found');
    await store().from('events').insert({
        type: `license.${args.status}`, license_id: data.id, data: { by: 'mcp' },
    });
    return data;
}
export async function listActivations(args) {
    let licenseId = args.licenseId;
    if (!licenseId && args.key) {
        const { data } = await store().from('licenses').select('id').eq('key', args.key).maybeSingle();
        licenseId = data?.id;
    }
    if (!licenseId)
        throw new Error('Provide licenseId or key');
    const { data, error } = await store()
        .from('activations')
        .select('id,site_url,ip,status,plugin_version,wp_version,php_version,last_seen_at,activated_at')
        .eq('license_id', licenseId)
        .order('activated_at', { ascending: false });
    if (error)
        throw error;
    return data ?? [];
}
export async function deactivateActivation(args) {
    let id = args.activationId;
    if (!id && args.key && args.domain) {
        const { data: lic } = await store().from('licenses').select('id').eq('key', args.key).maybeSingle();
        if (!lic)
            throw new Error('License not found');
        const { data: act } = await store()
            .from('activations').select('id').eq('license_id', lic.id)
            .eq('site_url', args.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
            .maybeSingle();
        id = act?.id;
    }
    if (!id)
        throw new Error('Provide activationId, or key + domain');
    const { data, error } = await store()
        .from('activations').update({ status: 'deactivated' }).eq('id', id).select('id,site_url,status').maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new Error('Activation not found');
    return data;
}
export async function listProducts() {
    const { data, error } = await store().from('products').select('id,slug,name,version,github_repo').order('slug');
    if (error)
        throw error;
    return data ?? [];
}
export async function createProduct(args) {
    const { data, error } = await store()
        .from('products')
        .insert({ slug: args.slug, name: args.name, github_repo: args.githubRepo ?? null })
        .select('id,slug,name,github_repo')
        .single();
    if (error)
        throw error;
    return data;
}
export async function listPlans(args) {
    let productId;
    if (args.productSlug) {
        const p = await productBySlug(args.productSlug);
        if (!p)
            return [];
        productId = p.id;
    }
    let q = store().from('plans').select('id,product_id,slug,name,max_activations,price_cents,recurring').order('slug');
    if (productId)
        q = q.eq('product_id', productId);
    const { data, error } = await q;
    if (error)
        throw error;
    return data ?? [];
}
export async function listReleases(args) {
    let productId;
    if (args.productSlug) {
        const p = await productBySlug(args.productSlug);
        if (!p)
            return [];
        productId = p.id;
    }
    let q = store()
        .from('product_releases')
        .select('id,product_id,version,is_latest,download_url,released_at')
        .order('released_at', { ascending: false })
        .limit(50);
    if (productId)
        q = q.eq('product_id', productId);
    const { data, error } = await q;
    if (error)
        throw error;
    return data ?? [];
}
export async function recentEvents(limit = 25) {
    const { data, error } = await store()
        .from('events')
        .select('id,type,license_id,product_id,data,created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(200, Math.max(1, limit)));
    if (error)
        throw error;
    return data ?? [];
}
export async function validationStats(days = 7) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await store()
        .from('validation_log')
        .select('result')
        .gte('ts', since)
        .limit(10000);
    if (error)
        throw error;
    const counts = {};
    for (const r of (data ?? []))
        counts[r.result] = (counts[r.result] ?? 0) + 1;
    return { since, total: (data ?? []).length, by_result: counts };
}
/** Public validation via the live REST surface (real activate/seat semantics). */
export async function validate(args) {
    const base = process.env.LICENSER_BASE_URL || 'https://licenser-platform.vercel.app';
    const res = await fetch(`${base}/api/v2/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
    });
    return { http_status: res.status, body: await res.json().catch(() => null) };
}
