/**
 * License-recovery email. Lists every license on file for the customer's
 * email so they can retrieve keys they've lost. Plain inline-CSS HTML.
 */
export interface RecoveryLicense {
  productName: string;
  planName: string;
  key: string;
  status: string;
  expiresAt?: string | null;
}
export interface RecoveryEmailArgs {
  customerName?: string | null;
  licenses: RecoveryLicense[];
  portalUrl?: string | null;
}

const accent = '#9336B3';
const bg = '#0a0a0f';
const card = '#14171f';
const border = '#1f2937';
const fg = '#f1f5f9';
const muted = '#94a3b8';

export function renderLicenseRecoveryEmail(args: RecoveryEmailArgs): { subject: string; html: string; text: string } {
  const greet = args.customerName ? `Hi ${args.customerName.split(' ')[0]},` : 'Hi,';
  const subject = args.licenses.length === 1 ? 'Your license key' : `Your ${args.licenses.length} license keys`;

  const rows = args.licenses.map((l) => {
    const meta = [l.planName, l.status, l.expiresAt ? `renews ${new Date(l.expiresAt).toLocaleDateString()}` : 'no expiry']
      .filter(Boolean).join(' · ');
    return `<div style="background:${card};border:1px solid ${border};border-radius:10px;padding:16px;margin:0 0 12px">
      <div style="color:${muted};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${l.productName}</div>
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:15px;color:${fg};word-break:break-all">${l.key}</div>
      <div style="color:${muted};font-size:12px;margin-top:6px">${meta}</div>
    </div>`;
  }).join('');

  const portalLine = args.portalUrl
    ? `<p style="color:${muted};font-size:13px;margin:20px 0 0">Manage your sites anytime at <a href="${args.portalUrl}" style="color:${accent};text-decoration:none">${args.portalUrl.replace(/^https?:\/\//, '')}</a>.</p>`
    : '';

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${bg};color:${fg};font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <h1 style="margin:0 0 12px;font-size:24px;color:${fg};letter-spacing:-0.02em">${subject}</h1>
    <p style="color:${fg};font-size:15px;margin:0 0 20px">${greet} here ${args.licenses.length === 1 ? 'is the license' : 'are the licenses'} on file for this email:</p>
    ${rows}
    ${portalLine}
    <p style="color:${muted};font-size:13px;margin:16px 0 0">If you didn't request this, you can ignore this email — no changes were made.</p>
    <hr style="border:none;border-top:1px solid ${border};margin:28px 0 16px" />
    <p style="color:${muted};font-size:11px;margin:0">Sent by Licenser · Gloo Software</p>
  </div>
</body></html>`;

  const text = `${greet}

Here ${args.licenses.length === 1 ? 'is the license' : 'are the licenses'} on file for this email:

${args.licenses.map((l) => `• ${l.productName} — ${l.planName} (${l.status})
  ${l.key}${l.expiresAt ? `\n  renews ${new Date(l.expiresAt).toLocaleDateString()}` : ''}`).join('\n\n')}
${args.portalUrl ? `\nManage your sites: ${args.portalUrl}` : ''}

If you didn't request this, ignore this email — no changes were made.

— Gloo Software`;

  return { subject, html, text };
}
