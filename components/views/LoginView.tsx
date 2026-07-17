'use client';
/* Auth view — sign IN to an existing account, or CREATE a new one. Registration
 * also collects an email, date of birth and country. */
import { useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';

export function LoginView({ onDone, initialMode }: { onDone?: () => void; initialMode?: 'login' | 'register' } = {}) {
  const { login } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode || 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
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
    : !!(username.trim() && password && email.trim() && dob && country.trim());

  return (
    <div className="auth-wrap">
      <div className="auth-logo">
        <h1>✏️ <span className="scribble-underline">SketchLearn</span></h1>
        <p>AI-drawn lessons that adapt to every answer you give.</p>
      </div>
      <div className="card">
        {/* Sign in / Create account toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
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
          <label className="field"><span>Email</span>
            <input type="email" autoComplete="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} onKeyDown={onKey} /></label>
          <label className="field"><span>Date of birth</span>
            <input type="date" value={dob} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDob(e.target.value)} /></label>
          <label className="field"><span>Country</span>
            <input type="text" list="country-list" placeholder="Your country" value={country}
              onChange={e => setCountry(e.target.value)} onKeyDown={onKey} />
            <datalist id="country-list">
              {['United States', 'United Kingdom', 'Canada', 'Australia', 'Mexico', 'Spain', 'France', 'Germany', 'Italy', 'Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Japan', 'China', 'India', 'Nigeria', 'South Africa', 'Egypt'].map(c => <option key={c} value={c} />)}
            </datalist>
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
