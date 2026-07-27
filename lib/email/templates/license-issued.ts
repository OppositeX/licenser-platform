/**
 * License-issued email template. Plain HTML with inline CSS — no external
 * assets, no Tailwind, plays nicely with Gmail / Outlook clippers.
 *
 * PRODUCT-AWARE: the "get started" section adapts to the product kind so a
 * WordPress-plugin buyer (e.g. gloo-for-elementor) gets WP install steps, while
 * the CNVS runtime buyer gets the CDN / npm / SiteBuilder paths. Add new product
 * slugs to `installKind()` as needed.
 */

export interface LicenseEmailArgs {
  productName: string;
  productSlug: string;
  customerName?: string | null;
  licenseKey: string;
  planName: string;
  expiresAt?: string | null;
  trialDays?: number;
}

const accent = '#9336B3';         // Gloo magenta
const bg     = '#0a0a0f';
const card   = '#14171f';
const border = '#1f2937';
const fg     = '#f1f5f9';
const muted  = '#94a3b8';

type InstallKind = 'cnvs' | 'wordpress' | 'generic';

/** Which install instructions to show. CNVS is the JS runtime; the rest are
 *  WordPress plugins today, so WordPress is the sensible default. */
function installKind(productSlug: string): InstallKind {
  if (productSlug === 'cnvs-runtime') return 'cnvs';
  // gloo-for-elementor, wc-complimentary-products, and future WP plugins:
  return 'wordpress';
}

const codeBox = (inner: string) =>
  `<div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:${muted};background:${bg};padding:10px 12px;border-radius:6px;white-space:pre-wrap;word-break:break-all">${inner}</div>`;
const block = (title: string, body: string) =>
  `<div style="background:${card};border:1px solid ${border};border-radius:10px;padding:18px;margin:0 0 14px"><div style="font-weight:700;color:${fg};margin-bottom:8px">${title}</div>${body}</div>`;

function installHtml(kind: InstallKind, productName: string, key: string): string {
  if (kind === 'cnvs') {
    return `<h2 style="font-size:14px;color:${muted};text-transform:uppercase;letter-spacing:.06em;margin:28px 0 12px">Install</h2>
    ${block('CDN (fastest)', codeBox(`&lt;script src="https://cdn.cnvs.studio/v1/sdk.js" data-license="${key}"&gt;&lt;/script&gt;`))}
    ${block('npm (recommended for apps)', codeBox(`pnpm add @gloo-ooo/cnvs-runtime @gloo-ooo/cnvs-licenser

import { Cnvs } from '@gloo-ooo/cnvs-runtime'
const cnvs = new Cnvs({ license: '${key}' })
await cnvs.init()`))}
    ${block('SiteBuilder card', `<div style="color:${muted};font-size:13px">Open <b>Settings → CNVS</b> in SiteBuilder and paste your key. The card unlocks automatically.</div>`)}`;
  }
  // WordPress plugin
  return `<h2 style="font-size:14px;color:${muted};text-transform:uppercase;letter-spacing:.06em;margin:28px 0 12px">Get started</h2>
    ${block('1 · Install the plugin', `<div style="color:${muted};font-size:13px">Download <b>${productName}</b> from your account (or the download link in your order confirmation). In WordPress, go to <b>Plugins → Add New → Upload Plugin</b>, choose the .zip, and click <b>Activate</b>.</div>`)}
    ${block('2 · Activate your license', `<div style="color:${muted};font-size:13px">In wp-admin, open <b>${productName} → License</b>, paste the key above, and click <b>Activate</b>. Your premium features and automatic updates unlock immediately.</div>`)}`;
}

function installText(kind: InstallKind, productName: string, key: string): string {
  if (kind === 'cnvs') {
    return `Install paths:

1) CDN
   <script src="https://cdn.cnvs.studio/v1/sdk.js" data-license="${key}"></script>

2) npm
   pnpm add @gloo-ooo/cnvs-runtime @gloo-ooo/cnvs-licenser
   import { Cnvs } from '@gloo-ooo/cnvs-runtime'
   const cnvs = new Cnvs({ license: '${key}' })
   await cnvs.init()

3) SiteBuilder
   Settings → CNVS → paste your key.`;
  }
  return `Get started:

1) Install the plugin
   Download ${productName} from your account (or your order confirmation), then in
   WordPress go to Plugins → Add New → Upload Plugin, choose the .zip, and Activate.

2) Activate your license
   In wp-admin open ${productName} → License, paste the key above, and click Activate.
   Premium features and automatic updates unlock immediately.`;
}

export function renderLicenseIssuedEmail(args: LicenseEmailArgs): { subject: string; html: string; text: string } {
  const greet = args.customerName ? `Hi ${args.customerName.split(' ')[0]},` : 'Hi,';
  const kind = installKind(args.productSlug);
  const expiresLine = args.expiresAt
    ? args.trialDays && args.trialDays > 0
      ? `<p style="margin:0 0 8px;color:${muted};font-size:13px">Trial ends ${new Date(args.expiresAt).toLocaleDateString()} — your card will be charged then.</p>`
      : `<p style="margin:0 0 8px;color:${muted};font-size:13px">Renews ${new Date(args.expiresAt).toLocaleDateString()}.</p>`
    : '';

  const subject = `Your ${args.productName} license — ${args.planName}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${bg};color:${fg};font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">

    <div style="display:inline-block;padding:4px 12px;border-radius:999px;background:${accent};color:#fff;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:20px">${args.planName}</div>

    <h1 style="margin:0 0 12px;font-size:26px;color:${fg};letter-spacing:-0.02em">Welcome to ${args.productName}</h1>

    <p style="color:${fg};font-size:15px;margin:0 0 22px">${greet}</p>

    <p style="color:${fg};font-size:15px;margin:0 0 12px">Your license key is ready — here's how to get started:</p>

    <div style="background:${card};border:1px solid ${border};border-radius:10px;padding:18px;margin:18px 0">
      <div style="color:${muted};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">License key</div>
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:16px;color:${fg};word-break:break-all">${args.licenseKey}</div>
      ${expiresLine}
    </div>

    ${installHtml(kind, args.productName, args.licenseKey)}

    <p style="color:${muted};font-size:13px;margin:24px 0 0">Need help? Reply to this email or visit <a href="https://gloo.ooo/docs" style="color:${accent};text-decoration:none">gloo.ooo/docs</a>.</p>

    <hr style="border:none;border-top:1px solid ${border};margin:32px 0 16px" />
    <p style="color:${muted};font-size:11px;margin:0">Sent by Licenser · Gloo Software · This key is yours — keep it safe.</p>
  </div>
</body></html>`;

  const text = `${greet}

Welcome to ${args.productName} (${args.planName}).

Your license key:
  ${args.licenseKey}
${args.expiresAt ? (args.trialDays ? `Trial ends ${new Date(args.expiresAt).toLocaleDateString()} — card charged then.` : `Renews ${new Date(args.expiresAt).toLocaleDateString()}.`) : ''}

${installText(kind, args.productName, args.licenseKey)}

Docs: https://gloo.ooo/docs
Support: reply to this email.

— Gloo Software`;

  return { subject, html, text };
}
