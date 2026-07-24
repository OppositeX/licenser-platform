'use client';
import { useState } from 'react';

const c = { bg: '#0a0a0f', card: '#14171f', border: '#1f2937', fg: '#f1f5f9', muted: '#94a3b8', accent: '#8b5cf6' };

export default function RecoverPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      await fetch('/api/v1/recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch { /* generic response regardless */ }
    setState('done');
  }

  return (
    <div style={{ minHeight: '100vh', background: `radial-gradient(at 30% 0%, #1e1b4b 0%, ${c.bg} 55%), ${c.bg}`, color: c.fg, font: '14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '56px 20px 80px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 28 }}>Licenser <span style={{ color: c.muted, fontWeight: 500 }}>· Recover key</span></div>
        <h1 style={{ fontSize: 26, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Email me my license key</h1>
        <p style={{ color: c.muted, margin: '0 0 22px' }}>Enter the email you purchased with and we&apos;ll send every license on file.</p>

        {state === 'done' ? (
          <div style={{ background: '#0f2e1a', color: '#86efac', border: '1px solid #14532d', borderRadius: 12, padding: 20 }}>
            If that email has licenses on file, we&apos;ve emailed them. Check your inbox (and spam).
            <div style={{ marginTop: 14 }}><a href="/portal" style={{ color: c.accent, textDecoration: 'none' }}>← Back to the portal</a></div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20, display: 'grid', gap: 12 }}>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.fg, borderRadius: 8, padding: '11px 12px', fontSize: 14, width: '100%' }}
            />
            <button type="submit" disabled={state === 'sending'} style={{ background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: state === 'sending' ? 0.6 : 1 }}>
              {state === 'sending' ? 'Sending…' : 'Send my key'}
            </button>
          </form>
        )}
        <p style={{ color: c.muted, fontSize: 13, marginTop: 20 }}><a href="/portal" style={{ color: c.accent, textDecoration: 'none' }}>← Back to the portal</a></p>
      </div>
    </div>
  );
}
