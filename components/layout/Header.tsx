'use client';
/* Top bar. Navigation now lives in the side rail, so the header just shows the
 * user's points/credits and the account controls. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';

export function Header({ chat }: { chat?: boolean } = {}) {
  const { user, logout, requireLogin } = useApp();
  const [balance, setBalance] = useState<number | null>(null);
  const [role, setRole] = useState('');
  useEffect(() => {
    if (!user) { setBalance(null); setRole(''); return; }
    API.get('/api/tokens').then((t: any) => { setBalance(typeof t?.balance === 'number' ? t.balance : null); setRole(String(t?.role || '')); }).catch(() => { /* ignore */ });
  }, [user?.username]);
  const points = user && (role === 'admin'
    ? <span title="Admin — unlimited credits" style={{ fontSize: 15, fontWeight: 700, color: 'var(--green,#7fb069)' }}>🎟 Unlimited</span>
    : <span title="Your remaining points" style={{ fontSize: 15, fontWeight: 700, color: (balance ?? 0) > 0 ? 'var(--green,#7fb069)' : 'var(--danger,#e4572e)' }}>🎟 {balance == null ? '…' : balance.toLocaleString()}</span>);
  return (
    // On the shell pages the header is thin and indented past the full-height side
    // nav (which carries the logo and overlaps this bar's left edge).
    <nav id="topbar" className="topbar" style={chat ? { paddingTop: 3, paddingBottom: 3, paddingLeft: 'calc(var(--chat-rail, 0px) + 16px)', fontSize: 13 } : undefined}>
      {!chat && <span className="brand">✏️ SketchLearn</span>}
      <div className="topbar-user" style={{ marginLeft: 'auto' }}>
        {user ? (<>
          {points}
          <span id="whoami">☺ {user.username}</span>
          <button id="logout-btn" className="btn small ghost" onClick={logout}>Sign out</button>
        </>) : (
          <button className="btn small primary" onClick={requireLogin}>Sign in / Create account</button>
        )}
      </div>
    </nav>
  );
}
