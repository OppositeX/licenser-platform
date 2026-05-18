'use client';

import { useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';

export default function LoginPage({ searchParams }: { searchParams: { denied?: string } }) {
  const [email, setEmail] = useState('');
  const [sent, setSent]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const supa = browserClient();
    const { error } = await supa.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/admin/auth/callback' },
    });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '80px 28px' }}>
      <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Admin</div>
      <h1 style={{ fontSize: 32, margin: '20px 0 8px', letterSpacing: '-0.02em' }}>Licenser admin</h1>
      <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 28 }}>Sign in with your admin email. We&apos;ll send a magic link.</p>

      {searchParams?.denied === '1' && (
        <div style={{ background: '#3b0f1a', border: '1px solid #7f1d1d', color: '#fecaca', padding: '12px 14px', borderRadius: 8, marginBottom: 18, fontSize: 13 }}>
          That email is not on the admins list. Ask an existing admin to add it.
        </div>
      )}

      {sent ? (
        <div style={{ background: '#0f1f2e', border: '1px solid #1e3a5f', color: '#bfdbfe', padding: '14px 16px', borderRadius: 8, fontSize: 14 }}>
          Check <b>{email}</b> for a magic link.
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ background: '#14171f', border: '1px solid #1f2937', color: '#f1f5f9', borderRadius: 8, padding: '12px 14px', fontSize: 15 }}
          />
          <button disabled={busy} type="submit" style={{ background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Sending...' : 'Send magic link'}
          </button>
          {err && <div style={{ color: '#fda4af', fontSize: 13 }}>{err}</div>}
        </form>
      )}
    </main>
  );
}
