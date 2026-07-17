'use client';
/* Top nav bar. Markup ported from public/index.html #topbar + core/layout.js.
 * Shown once a session is active. */
import { useApp } from '@/components/AppContext';

export function Header() {
  const { nav, user, logout, view, requireLogin } = useApp();
  // The current page gets an orange underline (the same orange as the ✏️ pencil)
  // so you always know where you are. A tool opened from a gallery keeps that
  // gallery highlighted.
  const isActive = (v: string) => view === v || (v === 'tools' && view === 'tool');
  const active = { borderBottom: '3px solid var(--orange)', borderRadius: 0, paddingBottom: 3, color: 'var(--ink)' } as const;
  const link = (v: string, label: string, id?: string) => (
    <button id={id} onClick={() => nav(v as never)} style={isActive(v) ? active : undefined} aria-current={isActive(v) ? 'page' : undefined}>{label}</button>
  );
  return (
    <nav id="topbar" className="topbar">
      <button className="brand" onClick={() => nav('tools')}>✏️ SketchLearn</button>
      <div className="topbar-links">
        {link('tools', 'Repos')}
        {link('slides', 'Slides')}
        {/* Feed and My stats hidden for now — restore when needed. */}
        {link('chat', 'Coach chat')}
        {/* Everyone signed in can open the Dashboard now — a plain user sees only
            their 🎟 token window, a moderator their own work, an admin everything. */}
        {user && link('dashboard', 'Dashboard', 'nav-dashboard')}
      </div>
      <div className="topbar-user">
        {user ? (<>
          <span id="whoami">☺ {user.username}</span>
          <button id="logout-btn" className="btn small ghost" onClick={logout}>Sign out</button>
        </>) : (
          <button className="btn small primary" onClick={requireLogin}>Sign in / Create account</button>
        )}
      </div>
    </nav>
  );
}
