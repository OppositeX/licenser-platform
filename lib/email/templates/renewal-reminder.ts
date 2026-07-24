/**
 * Renewal / expiry reminder email. Sent to licenses approaching expiry that
 * are NOT auto-renewing (a healthy subscription's expiry keeps moving forward,
 * so it never lands in the reminder window).
 */
export interface RenewalEmailArgs {
  customerName?: string | null;
  productName: string;
  planName: string;
  licenseKeyPrefix: string;
  expiresAt: string;
  daysLeft: number;
  portalUrl?: string | null;
}

const accent = '#9336B3';
const bg = '#0a0a0f';
const card = '#14171f';
const border = '#1f2937';
const fg = '#f1f5f9';
const muted = '#94a3b8';

export function renderRenewalReminderEmail(args: RenewalEmailArgs): { subject: string; html: string; text: string } {
  const greet = args.customerName ? `Hi ${args.customerName.split(' ')[0]},` : 'Hi,';
  const when = new Date(args.expiresAt).toLocaleDateString();
  const dayPhrase = args.daysLeft <= 0 ? 'today' : args.daysLeft === 1 ? 'tomorrow' : `in ${args.daysLeft} days`;
  const subject = `Your ${args.productName} license expires ${dayPhrase}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${bg};color:${fg};font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <h1 style="margin:0 0 12px;font-size:24px;color:${fg};letter-spacing:-0.02em">Your license expires ${dayPhrase}</h1>
    <p style="color:${fg};font-size:15px;margin:0 0 18px">${greet} a heads-up that your <b>${args.productName}</b> license (${args.planName}) is set to expire on <b>${when}</b>.</p>
    <div style="background:${card};border:1px solid ${border};border-radius:10px;padding:16px;margin:0 0 18px">
      <div style="color:${muted};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">License</div>
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:15px;color:${fg}">${args.licenseKeyPrefix}…</div>
      <div style="color:${muted};font-size:12px;margin-top:6px">Expires ${when}</div>
    </div>
    <p style="color:${fg};font-size:14px;margin:0 0 8px">Renew to keep updates and support running without interruption.</p>
    ${args.portalUrl ? `<p style="margin:18px 0 0"><a href="${args.portalUrl}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700">Manage / renew</a></p>` : ''}
    <hr style="border:none;border-top:1px solid ${border};margin:28px 0 16px" />
    <p style="color:${muted};font-size:11px;margin:0">Sent by Licenser · Gloo Software. If your subscription already renews automatically, no action is needed.</p>
  </div>
</body></html>`;

  const text = `${greet}

Your ${args.productName} license (${args.planName}) expires ${dayPhrase} — on ${when}.
License: ${args.licenseKeyPrefix}…

Renew to keep updates and support running.${args.portalUrl ? `\nManage / renew: ${args.portalUrl}` : ''}

If your subscription already renews automatically, no action is needed.

— Gloo Software`;

  return { subject, html, text };
}
