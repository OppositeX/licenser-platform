import Link from 'next/link';

export const adminTheme = {
  bg: 'radial-gradient(at 30% 20%, #1e1b4b 0%, #0a0a0f 60%), #0a0a0f',
  card: '#14171f',
  border: '#1f2937',
  text: '#f1f5f9',
  muted: '#94a3b8',
  accent: 'linear-gradient(135deg,#a78bfa,#8b5cf6)',
};

export function AdminShell({ active, email, children }: { active: 'products' | 'licenses' | 'activations'; email: string; children: React.ReactNode }) {
  const navItem = (href: string, label: string, key: typeof active) => (
    <Link href={href} style={{
      color: active === key ? '#f1f5f9' : '#94a3b8',
      background: active === key ? '#1f2937' : 'transparent',
      padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: active === key ? 700 : 500,
      textDecoration: 'none',
    }}>{label}</Link>
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ borderBottom: '1px solid #1f2937', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Link href="/" style={{ color: '#f1f5f9', textDecoration: 'none', fontWeight: 800, fontSize: 16 }}>Licenser</Link>
          <nav style={{ display: 'flex', gap: 6 }}>
            {navItem('/admin/products', 'Products', 'products')}
            {navItem('/admin/licenses', 'Licenses', 'licenses')}
            {navItem('/admin/activations', 'Activations', 'activations')}
          </nav>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>{email}</span>
          <form action="/admin/logout" method="post" style={{ margin: 0 }}>
            <button style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #1f2937', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Sign out</button>
          </form>
        </div>
      </header>
      <main style={{ padding: '28px 28px 80px', maxWidth: 1120, margin: '0 auto' }}>{children}</main>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const palettes: Record<string, { bg: string; fg: string }> = {
    active:      { bg: '#0f2e1a', fg: '#86efac' },
    deactivated: { bg: '#2e1a0f', fg: '#fcd34d' },
    suspended:   { bg: '#2e1a0f', fg: '#fcd34d' },
    revoked:     { bg: '#3b0f1a', fg: '#fda4af' },
    expired:     { bg: '#3b0f1a', fg: '#fda4af' },
  };
  const p = palettes[status] ?? { bg: '#1f2937', fg: '#94a3b8' };
  return <span style={{ background: p.bg, color: p.fg, padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{status}</span>;
}
