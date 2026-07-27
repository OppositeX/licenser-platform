import Link from 'next/link';

export const adminTheme = {
  bg: 'radial-gradient(at 30% 20%, #1e1b4b 0%, #0a0a0f 60%), #0a0a0f',
  card: '#14171f',
  border: '#1f2937',
  text: '#f1f5f9',
  muted: '#94a3b8',
  accent: 'linear-gradient(135deg,#a78bfa,#8b5cf6)',
};

export type AdminNavKey =
  | 'dashboard'
  | 'analytics'
  | 'products'
  | 'plans'
  | 'licenses'
  | 'activations'
  | 'subscriptions'
  | 'releases'
  | 'feedback'
  | 'integrations'
  | 'webhooks'
  | 'sdk'
  | 'integrate'
  | 'migration'
  | 'logs'
  | 'settings';

const NAV: Array<{ key: AdminNavKey; label: string; href: string }> = [
  { key: 'dashboard',     label: 'Dashboard',     href: '/admin' },
  { key: 'analytics',     label: 'Analytics',     href: '/admin/analytics' },
  { key: 'products',      label: 'Products',      href: '/admin/products' },
  { key: 'plans',         label: 'Plans',         href: '/admin/plans' },
  { key: 'licenses',      label: 'Licenses',      href: '/admin/licenses' },
  { key: 'activations',   label: 'Activations',   href: '/admin/activations' },
  { key: 'subscriptions', label: 'Subscriptions', href: '/admin/subscriptions' },
  { key: 'releases',      label: 'Releases',      href: '/admin/releases' },
  { key: 'feedback',      label: 'Feedback',      href: '/admin/feedback' },
  { key: 'integrations',  label: 'Integrations',  href: '/admin/integrations' },
  { key: 'webhooks',      label: 'Webhooks',      href: '/admin/webhooks' },
  { key: 'sdk',           label: 'SDK',           href: '/admin/sdk' },
  { key: 'integrate',    label: 'Integrate',     href: '/admin/integrate' },
  { key: 'migration',     label: 'Migration',     href: '/admin/migration' },
  { key: 'logs',          label: 'Logs',          href: '/admin/logs' },
  { key: 'settings',      label: 'Settings',      href: '/admin/settings' },
];

export function AdminShell({ active, email, children }: { active: AdminNavKey; email: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '220px 1fr' }}>
      <aside style={{ borderRight: '1px solid #1f2937', padding: '20px 14px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', background: '#0a0a0f' }}>
        <Link href="/" style={{ color: '#f1f5f9', textDecoration: 'none', fontWeight: 800, fontSize: 16, display: 'block', padding: '4px 10px 18px' }}>Licenser</Link>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} style={{
              color: active === n.key ? '#f1f5f9' : '#94a3b8',
              background: active === n.key ? '#1f2937' : 'transparent',
              padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: active === n.key ? 700 : 500,
              textDecoration: 'none',
            }}>{n.label}</Link>
          ))}
        </nav>
      </aside>
      <div>
        <header style={{ borderBottom: '1px solid #1f2937', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{email}</span>
          <form action="/admin/logout" method="post" style={{ margin: 0 }}>
            <button style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #1f2937', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Sign out</button>
          </form>
        </header>
        <main style={{ padding: '28px 28px 80px', maxWidth: 1180 }}>{children}</main>
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const palettes: Record<string, { bg: string; fg: string }> = {
    active:      { bg: '#0f2e1a', fg: '#86efac' },
    deactivated: { bg: '#2e1a0f', fg: '#fcd34d' },
    suspended:   { bg: '#2e1a0f', fg: '#fcd34d' },
    grace:       { bg: '#2e1a0f', fg: '#fcd34d' },
    revoked:     { bg: '#3b0f1a', fg: '#fda4af' },
    expired:     { bg: '#3b0f1a', fg: '#fda4af' },
    error:       { bg: '#3b0f1a', fg: '#fda4af' },
    warn:        { bg: '#2e1a0f', fg: '#fcd34d' },
    info:        { bg: '#0f1a2e', fg: '#93c5fd' },
    ok:          { bg: '#0f2e1a', fg: '#86efac' },
    received:    { bg: '#0f1a2e', fg: '#93c5fd' },
    ignored:     { bg: '#1f2937', fg: '#cbd5e1' },
    connected:   { bg: '#0f2e1a', fg: '#86efac' },
    disconnected:{ bg: '#3b0f1a', fg: '#fda4af' },
    configured:  { bg: '#0f2e1a', fg: '#86efac' },
    'not-configured': { bg: '#1f2937', fg: '#94a3b8' },
  };
  const p = palettes[status] ?? { bg: '#1f2937', fg: '#94a3b8' };
  return <span style={{ background: p.bg, color: p.fg, padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{status}</span>;
}

export const ui = {
  card: { background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, padding: 20 } as React.CSSProperties,
  list: { background: '#14171f', border: '1px solid #1f2937', borderRadius: 12, overflow: 'hidden' } as React.CSSProperties,
  row:  { padding: '14px 22px', borderBottom: '1px solid #1f2937', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' } as React.CSSProperties,
  inp:  { background: '#0a0a0f', border: '1px solid #1f2937', color: '#f1f5f9', borderRadius: 8, padding: '10px 12px', fontSize: 13, width: '100%', display: 'block' } as React.CSSProperties,
  inpSm:{ background: '#0a0a0f', border: '1px solid #1f2937', color: '#f1f5f9', borderRadius: 6, padding: '6px 8px', fontSize: 12 } as React.CSSProperties,
  btn:  { background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { background: 'transparent', color: '#cbd5e1', border: '1px solid #1f2937', padding: '8px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' } as React.CSSProperties,
  btnDanger:{ background: 'transparent', color: '#fda4af', border: '1px solid #7f1d1d', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,
  btnWarn:  { background: 'transparent', color: '#fcd34d', border: '1px solid #78350f', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,
  h1:   { fontSize: 28, letterSpacing: '-0.02em', margin: '0 0 20px' } as React.CSSProperties,
  h2:   { fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px', fontWeight: 700 } as React.CSSProperties,
  label:{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 6, display: 'block' } as React.CSSProperties,
  pre:  { background: '#0a0a0f', border: '1px solid #1f2937', borderRadius: 8, padding: 14, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', color: '#cbd5e1', overflow: 'auto', margin: 0 } as React.CSSProperties,
  // Form grid: 2 columns on wide screens, 1 column on narrow. minmax(0,1fr) prevents children from forcing width.
  formGrid: { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' } as React.CSSProperties,
  inlineFormGrid: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', alignItems: 'end' } as React.CSSProperties,
};

export function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ ...ui.card, marginBottom: 18 }}>
      {title && <h2 style={{ ...ui.h2, marginBottom: subtitle ? 4 : 12 }}>{title}</h2>}
      {subtitle && <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 14px' }}>{subtitle}</p>}
      {children}
    </section>
  );
}

export function ProductPicker({ products, selected, basePath }: { products: Array<{ id: string; name: string }>; selected: string | null; basePath: string }) {
  return (
    <form method="get" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
      <select name="product" defaultValue={selected ?? ''} style={ui.inp}>
        <option value="">Select product…</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="submit" style={ui.btn}>Switch</button>
      {selected && <Link href={basePath} style={ui.btnGhost}>Clear</Link>}
    </form>
  );
}

/**
 * URL-driven off-canvas drawer. Mount it always on the page; it renders only
 * when `open` is true. Close = Link back to a URL without the trigger param,
 * so no client JS or React state is required.
 */
export function Drawer({ open, title, subtitle, closeHref, children }: {
  open: boolean;
  title: string;
  subtitle?: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <Link href={closeHref} aria-label="Close" className="lic-drawer-backdrop" style={{ display: 'block' }} />
      <aside className="lic-drawer">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20, letterSpacing: '-0.01em' }}>{title}</h2>
          <Link href={closeHref} aria-label="Close" style={{
            color: '#94a3b8', textDecoration: 'none', fontSize: 24, lineHeight: 1,
            padding: '4px 10px', border: '1px solid #1f2937', borderRadius: 8,
          }}>×</Link>
        </header>
        {subtitle && <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 18px' }}>{subtitle}</p>}
        <div style={{ marginTop: subtitle ? 0 : 14 }}>{children}</div>
      </aside>
    </>
  );
}

export function FlashFromQuery({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  const msg = ok ?? error ?? '';
  const isErr = !!error;
  return (
    <div style={{
      background: isErr ? '#3b0f1a' : '#0f2e1a',
      color: isErr ? '#fda4af' : '#86efac',
      border: `1px solid ${isErr ? '#7f1d1d' : '#14532d'}`,
      borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 13,
    }}>{msg}</div>
  );
}
