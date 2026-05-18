export default function Page() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '80px 28px' }}>
      <div style={{
        display: 'inline-block', padding: '4px 12px', borderRadius: 999,
        background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff',
        fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
      }}>Coming soon</div>
      <h1 style={{ fontSize: 42, margin: '20px 0 12px', letterSpacing: '-0.02em' }}>Licenser</h1>
      <p style={{ color: '#94a3b8', fontSize: 17, margin: '0 0 28px', lineHeight: 1.5 }}>
        Self-hosted license + update delivery for the Gloo plugin ecosystem.
        Replacing the WordPress install at <code style={{ background: '#14171f', padding: '2px 8px', borderRadius: 6, fontSize: 13 }}>licenser.d3v.co.il</code>.
      </p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 36 }}>
        <Card title="REST surface" body="Drop-in compatible with the existing Licenser SDK clients." />
        <Card title="Admin UI" body="Products, plans, licenses, activations, audit log — single dashboard." />
        <Card title="OAuth-first" body="GitHub OAuth for plugin auto-update releases. No PATs." />
      </div>
      <footer style={{ marginTop: 64, color: '#475569', fontSize: 12 }}>
        Build {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'} &middot; built by Gloo Software
      </footer>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      background: '#14171f', border: '1px solid #1f2937', borderRadius: 12,
      padding: '18px 20px',
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{title}</div>
      <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
