'use client';
/* Top nav bar. Markup ported from public/index.html #topbar + core/layout.js.
 * Shown once a session is active. */
import { useApp } from '@/components/AppContext';
import { appState } from '@/lib/app-state';

export function Header({ chat }: { chat?: boolean } = {}) {
  const { nav, user, logout, view, requireLogin } = useApp();
  // The current page gets an orange underline (the same orange as the ✏️ pencil)
  // so you always know where you are. A tool opened from a gallery keeps THAT
  // gallery highlighted: a slide presentation keeps Slides, a repository keeps
  // Repos (by the open tool's archetype).
  const toolIsSlide = view === 'tool' && appState.activeTool?.archetype === 'lesson';
  const isActive = (v: string) =>
    view === v
    || (v === 'slides' && toolIsSlide)
    || (v === 'tools' && view === 'tool' && !toolIsSlide);
  const active = { borderBottom: '3px solid var(--orange)', borderRadius: 0, paddingBottom: 3, color: 'var(--ink)' } as const;
  const link = (v: string, label: string, id?: string) => (
    <button id={id} onClick={() => nav(v as never)} style={isActive(v) ? active : undefined} aria-current={isActive(v) ? 'page' : undefined}>{label}</button>
  );
  return (
    // On the Coach chat page the header is thin and indented past the full-height
    // side nav (which carries the logo and overlaps this bar's left edge).
    <nav id="topbar" className="topbar" style={chat ? { paddingTop: 3, paddingBottom: 3, paddingLeft: 'calc(var(--chat-rail, 0px) + 16px)', fontSize: 13 } : undefined}>
      {!chat && <button className="brand" onClick={() => nav('chat')}>✏️ SketchLearn</button>}
      <div className="topbar-links">
        {/* Coach chat is the home page. */}
        {link('chat', 'Coach chat')}
        {link('slides', 'Slides')}
        {link('tools', 'Repos')}
        {/* Public directory of moderators — open to everyone, even guests. */}
        {link('moderators', 'Moderators')}
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
