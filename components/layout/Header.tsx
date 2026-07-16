'use client';
/* Top nav bar. Markup ported from public/index.html #topbar + core/layout.js.
 * Shown once a session is active. */
import { useApp } from '@/components/AppContext';

export function Header() {
  const { nav, user, logout } = useApp();
  return (
    <nav id="topbar" className="topbar">
      <button className="brand" onClick={() => nav('tools')}>✏️ SketchLearn</button>
      <div className="topbar-links">
        <button onClick={() => nav('tools')}>Repos</button>
        <button onClick={() => nav('slides')}>Slides</button>
        {/* Feed and My stats hidden for now — restore when needed.
        <button onClick={() => nav('feed')}>Feed</button>
        <button onClick={() => nav('stats')}>My stats</button>
        */}
        <button onClick={() => nav('chat')}>Coach chat</button>
        {user?.role === 'admin' && <button id="nav-dashboard" onClick={() => nav('dashboard')}>Dashboard</button>}
      </div>
      <div className="topbar-user">
        <span id="whoami">☺ {user?.username}</span>
        <button id="logout-btn" className="btn small ghost" onClick={logout}>Sign out</button>
      </div>
    </nav>
  );
}
