'use client';
/* Auth view — sign IN to an existing account, or CREATE a new one. Registration
 * also collects an email, date of birth and country. Rendered as a self-contained,
 * opaque card (with its own ✕) so it sits cleanly over the page as an overlay. */
import { useMemo, useRef, useState, useEffect } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';
import { COUNTRIES, flagOf } from '@/lib/countries';

// A searchable country dropdown: shows each country's flag + name, with a search
// box to filter to one directly. Stores the chosen country's NAME.
function CountrySelect({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const chosen = useMemo(() => COUNTRIES.find((c) => c.name === value), [value]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(s)) : COUNTRIES;
  }, [q]);
  // Close when clicking outside the control.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', textAlign: 'left', fontFamily: 'var(--font-hand)', fontSize: '1.05rem', color: chosen ? 'var(--ink)' : '#9a9488',
          padding: '10px 14px', background: '#fff', border: '2.5px solid var(--ink)', borderRadius: 'var(--wobble-2)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{chosen ? `${flagOf(chosen.code)}  ${chosen.name}` : 'Select your country'}</span>
        <span style={{ opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, padding: 8, maxHeight: 280, display: 'flex', flexDirection: 'column' }}>
          <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search country…"
            style={{ marginBottom: 6 }} />
          <div style={{ overflowY: 'auto' }}>
            {list.length === 0 && <div style={{ fontSize: 13, opacity: 0.6, padding: '6px 8px' }}>No match.</div>}
            {list.map((c) => (
              <button key={c.code} type="button" onClick={() => { onChange(c.name); setOpen(false); setQ(''); }}
                style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left', padding: '7px 8px', background: c.name === value ? 'rgba(0,0,0,0.06)' : 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>
                <span style={{ fontSize: 20 }}>{flagOf(c.code)}</span><span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LoginView({ onDone, onClose, initialMode }: { onDone?: () => void; onClose?: () => void; initialMode?: 'login' | 'register' } = {}) {
  const { login } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode || 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (mode === 'register' && password !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true); setErr('');
    try {
      const r = mode === 'login'
        ? await API.post('/api/login', { username: username.trim(), password })
        : await API.post('/api/register', { username: username.trim(), password, email: email.trim(), dob, country: country.trim() });
      login(r.token, { username: r.username, role: r.role });
      onDone?.();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') go(); };
  const canSubmit = mode === 'login'
    ? !!(username.trim() && password)
    : !!(username.trim() && password && confirm && email.trim() && dob && country.trim());

  return (
    <div className="auth-wrap" style={{ margin: 0 }}>
      <div className="card" style={{ position: 'relative', background: '#fff' }}>
        {onClose && (
          <button aria-label="Close" onClick={onClose}
            style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink)', lineHeight: 1 }}>✕</button>
        )}
        {/* Compact logo INSIDE the card, so nothing shows through above it. */}
        <div style={{ textAlign: 'center', margin: '2px 0 14px' }}>
          <h2 style={{ margin: 0 }}>✏️ <span className="scribble-underline">SketchLearn</span></h2>
          <p style={{ fontSize: 13, opacity: 0.7, margin: '4px 0 0' }}>AI-drawn lessons that adapt to every answer you give.</p>
        </div>

        {/* Sign in / Create account toggle (Sign in first). */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button className={`btn small ${mode === 'login' ? 'blue' : 'ghost'}`} style={{ flex: 1 }} onClick={() => { setMode('login'); setErr(''); }}>Sign in</button>
          <button className={`btn small ${mode === 'register' ? 'blue' : 'ghost'}`} style={{ flex: 1 }} onClick={() => { setMode('register'); setErr(''); }}>Create account</button>
        </div>

        <label className="field"><span>Username</span>
          <input type="text" id="login-user" autoComplete="username" value={username}
            onChange={e => setUsername(e.target.value)} onKeyDown={onKey} /></label>
        <label className="field"><span>Password</span>
          <input type="password" id="login-pass" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={onKey} /></label>

        {mode === 'register' && (<>
          <label className="field"><span>Confirm password</span>
            <input type="password" autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} onKeyDown={onKey} /></label>
          <label className="field"><span>Email</span>
            <input type="email" autoComplete="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} onKeyDown={onKey} />
            <span style={{ display: 'block', fontWeight: 'normal', fontSize: 12, color: 'var(--danger,#e4572e)', marginTop: 3 }}>no verification required</span>
          </label>
          <label className="field"><span>Date of birth</span>
            <input type="date" value={dob} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDob(e.target.value)} /></label>
          <label className="field"><span>Country</span>
            <CountrySelect value={country} onChange={setCountry} />
          </label>
        </>)}

        <p className="form-error" id="login-err">{err}</p>
        <button className="btn primary" id="login-btn" style={{ width: '100%' }} disabled={busy || !canSubmit} onClick={go}>
          {busy ? '…' : mode === 'login' ? 'Sign in →' : 'Create account →'}
        </button>
      </div>
    </div>
  );
}
