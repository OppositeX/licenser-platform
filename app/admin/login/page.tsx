'use client';

import { useEffect, useState, use } from 'react';
import { browserClient } from '@/lib/supabase/browser';

type Mode = 'password' | 'magic';

export default function LoginPage(props: { searchParams: Promise<{ denied?: string }> }) {
  const searchParams = use(props.searchParams);
  const [mode, setMode]   = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [sent, setSent]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);
  const [isLocal, setIsLocal] = useState(false);
  useEffect(() => {
    setIsLocal(typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
  }, []);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const supa = browserClient();
    const { error } = await supa.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    window.location.href = '/admin';
  }

  async function submitMagic(e: React.FormEvent) {
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

  async function signInWithGoogle() {
    setBusy(true); setErr(null);
    const supa = browserClient();
    const { error } = await supa.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/admin/auth/callback' },
    });
    if (error) { setErr(error.message); setBusy(false); }
  }

  const inputStyle: React.CSSProperties = {
    background: '#14171f', border: '1px solid #1f2937', color: '#f1f5f9',
    borderRadius: 8, padding: '12px 14px', fontSize: 15,
  };
  const primaryBtnStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', border: 'none',
    borderRadius: 8, padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer',
  };

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '80px 28px' }}>
      <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: 'linear-gradient(135deg,#a78bfa,#8b5cf6)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>Admin</div>
      <h1 style={{ fontSize: 32, margin: '20px 0 8px', letterSpacing: '-0.02em' }}>Licenser admin</h1>
      <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 28 }}>Sign in to manage products, licenses, and activations.</p>

      {searchParams?.denied === '1' && (
        <div style={{ background: '#3b0f1a', border: '1px solid #7f1d1d', color: '#fecaca', padding: '12px 14px', borderRadius: 8, marginBottom: 18, fontSize: 13 }}>
          That email is not on the admins list. Ask an existing admin to add it.
        </div>
      )}

      {isLocal && (
        <div style={{ background: '#1e3a5f', border: '1px solid #1e40af', color: '#bfdbfe', padding: '12px 14px', borderRadius: 8, marginBottom: 18, fontSize: 12, lineHeight: 1.5 }}>
          <strong>LOCAL dev</strong> — Google OAuth will bounce you to production unless
          <code style={{ background: '#0f1e3a', padding: '1px 6px', borderRadius: 4, margin: '0 4px' }}>http://localhost:3000/admin/auth/callback</code>
          is added to Supabase → Auth → URL Configuration → Redirect URLs. Use email + password below to test locally without that.
        </div>
      )}

      <button onClick={signInWithGoogle} disabled={busy} style={{
        width: '100%', background: '#ffffff', color: '#0f172a', border: 'none', borderRadius: 8,
        padding: '12px 16px', fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18,
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.85a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.7-3.89 2.7-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.46-.8 5.95-2.18l-2.92-2.26c-.81.54-1.84.86-3.03.86-2.33 0-4.31-1.57-5.01-3.69H.97v2.32A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.99 10.73a5.4 5.4 0 0 1 0-3.46V4.95H.97a9 9 0 0 0 0 8.1l3.02-2.32z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.43 1.34l2.58-2.58A9 9 0 0 0 .97 4.95l3.02 2.32C4.69 5.15 6.67 3.58 9 3.58z" />
        </svg>
        Sign in with Google
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#475569', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', margin: '18px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#1f2937' }} /> or <div style={{ flex: 1, height: 1, background: '#1f2937' }} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: '#0f1217', border: '1px solid #1f2937', borderRadius: 8, padding: 4 }}>
        <button type="button" onClick={() => { setMode('password'); setSent(false); setErr(null); }} style={{
          flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          background: mode === 'password' ? '#1f2937' : 'transparent',
          color: mode === 'password' ? '#f1f5f9' : '#94a3b8', border: 'none', cursor: 'pointer',
        }}>Email + password</button>
        <button type="button" onClick={() => { setMode('magic'); setSent(false); setErr(null); }} style={{
          flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          background: mode === 'magic' ? '#1f2937' : 'transparent',
          color: mode === 'magic' ? '#f1f5f9' : '#94a3b8', border: 'none', cursor: 'pointer',
        }}>Magic link</button>
      </div>

      {mode === 'password' ? (
        <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" style={inputStyle} />
          <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)} placeholder="password" autoComplete="current-password" minLength={6} style={inputStyle} />
          <button disabled={busy} type="submit" style={primaryBtnStyle}>{busy ? 'Signing in...' : 'Sign in'}</button>
          {err && <div style={{ color: '#fda4af', fontSize: 13 }}>{err}</div>}
        </form>
      ) : sent ? (
        <div style={{ background: '#0f1f2e', border: '1px solid #1e3a5f', color: '#bfdbfe', padding: '14px 16px', borderRadius: 8, fontSize: 14 }}>
          Check <b>{email}</b> for a magic link.
        </div>
      ) : (
        <form onSubmit={submitMagic} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" style={inputStyle} />
          <button disabled={busy} type="submit" style={primaryBtnStyle}>{busy ? 'Sending...' : 'Send magic link'}</button>
          {err && <div style={{ color: '#fda4af', fontSize: 13 }}>{err}</div>}
        </form>
      )}
    </main>
  );
}
