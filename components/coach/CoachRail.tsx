'use client';
/* The shared Coach side-rail (Claude-style full-height left nav). It carries the
 * logo, New chat, the main page links, and the chat-history list, and it publishes
 * its width as the `--chat-rail` CSS var so the thin app header can indent past it.
 *
 * It runs in two modes:
 *  • CONTROLLED (on the Coach chat page) — ChatView passes the live sessions +
 *    handlers so clicking a history item switches the open chat in place.
 *  • STANDALONE (every other shell page) — it loads history itself and its actions
 *    navigate to the Coach chat (which restores the chosen session on mount). */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';
import { appState } from '@/lib/app-state';
import { type ChatSession, loadSessions, deleteSession, relTime } from '@/lib/chat-history';

export const RAIL_W = 250;
const COLLAPSED_COUNT = 6;

export function CoachRail({ active, sessions: sessionsProp, onNewChat, onOpenSession, onDeleteSession }: {
  active?: string;
  sessions?: ChatSession[];
  onNewChat?: () => void;
  onOpenSession?: (s: ChatSession) => void;
  onDeleteSession?: (id: string) => void;
}) {
  const app = useApp();
  const username = app.user?.username || null;
  // Which top-level nav group the current page belongs to. An open tool (view
  // 'tool') maps back to its gallery group: a repo → Repos ('tools'), any other
  // tool (a slide/lesson) → Slides ('slides'). Everything else is its own group.
  const activeGroup: string = app.view === 'tool'
    ? ((appState.activeTool?.definition?.archetype || appState.activeTool?.archetype) === 'repo' ? 'tools' : 'slides')
    : app.view;
  // Collapse state is shared via appState so it survives page switches.
  const open = appState.railOpen !== false;
  const setOpen = (v: boolean) => { appState.railOpen = v; app.rerender(); };
  // On small screens the rail is a fixed overlay covering the page, so after a
  // navigation collapse it back out of the way (a phone/tablet drawer). Desktop
  // keeps it pinned open.
  const closeIfSmall = () => { if (typeof window !== 'undefined' && window.innerWidth < 1024) setOpen(false); };
  const [expanded, setExpanded] = useState(false);
  const [ownSessions, setOwnSessions] = useState<ChatSession[]>([]);
  // The Admin nav group folds away so learner pages stay front and center; the
  // choice is remembered across visits (and it force-opens on an admin page).
  const [adminOpen, setAdminOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('sl_nav_admin_open') !== '0'; } catch { return true; }
  });
  const setAdminOpenPersist = (v: boolean) => {
    setAdminOpen(v);
    try { localStorage.setItem('sl_nav_admin_open', v ? '1' : '0'); } catch { /* ignore */ }
  };

  // Publish the rail width so the header indents past it (0 when collapsed).
  useEffect(() => {
    document.documentElement.style.setProperty('--chat-rail', open ? `${RAIL_W}px` : '0px');
    return () => { document.documentElement.style.setProperty('--chat-rail', '0px'); };
  }, [open]);

  // Standalone mode: load the history list ourselves (parent didn't provide it).
  useEffect(() => {
    if (sessionsProp) return;
    if (username) {
      API.get('/api/coach-chats').then((r: any) => setOwnSessions(Array.isArray(r?.sessions) ? r.sessions : loadSessions(username))).catch(() => setOwnSessions(loadSessions(username)));
    } else setOwnSessions(loadSessions(username));
  }, [username, sessionsProp]);

  const sessions = sessionsProp ?? ownSessions;
  const visible = expanded ? sessions : sessions.slice(0, COLLAPSED_COUNT);

  // Default (standalone) handlers navigate to the Coach chat, which restores the
  // chosen state on mount from appState.
  const doNew = onNewChat ?? (() => { appState.chatSessionId = null; appState.chat = []; app.nav('chat'); });
  const doOpen = onOpenSession ?? ((s: ChatSession) => { appState.chat = s.messages; appState.chatSessionId = s.id; app.nav('chat'); });
  const doDelete = onDeleteSession ?? ((id: string) => { const next = deleteSession(username, id); setOwnSessions(next); if (username) API.put('/api/coach-chats', { sessions: next }).catch(() => { /* stays local */ }); });

  if (!open) {
    return (
      <button title="Show the history panel" onClick={() => setOpen(true)}
        style={{ position: 'fixed', top: 8, left: 8, zIndex: 60, background: 'var(--card,#fff8ee)', border: '1.5px solid var(--ink)', borderRadius: 8, cursor: 'pointer', fontSize: 16, padding: '5px 9px', lineHeight: 1 }}>🗂 »</button>
    );
  }

  return (
    <aside className="grid-bg" style={{ position: 'fixed', top: 0, left: 0, height: '100dvh', width: RAIL_W, zIndex: 60, backgroundColor: 'var(--paper,#f7f3e9)', backgroundImage: 'linear-gradient(rgba(92,128,188,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(92,128,188,.09) 1px, transparent 1px)', backgroundSize: '26px 26px', borderRight: '2px dashed var(--line,#d9cfc0)', padding: '10px 12px 10px 18px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Logo at the TOP of the side nav (with the orange line) + collapse. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <button className="brand scribble-underline" onClick={() => { app.nav('chat'); closeIfSmall(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 20, fontWeight: 800, color: 'var(--ink)', padding: 0 }}>✏️ SketchLearn</button>
        <button title="Collapse the panel" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: 'var(--muted,#8a7f70)', padding: 0 }}>«</button>
      </div>
      {/* New chat is a plain action; the GREEN underline is reserved for the page
          indicator (it lights under whichever option is the current page). */}
      <button className="btn small ghost" onClick={() => { doNew(); closeIfSmall(); }}
        style={{ width: '100%', marginBottom: 8, display: 'flex', alignItems: 'center', textAlign: 'left', ...(app.view === 'chat' ? { borderBottom: '3px solid var(--green,#7fb069)' } : null) }}>
        <span>💬 Chat</span>
        {app.view === 'chat' && <span aria-hidden title="You’re on this section" style={{ marginLeft: 'auto', flex: '0 0 auto', width: 9, height: 9, borderRadius: '50%', background: 'var(--green,#7fb069)', boxShadow: '0 0 0 2px var(--paper,#f7f3e9)' }} />}
      </button>

      {/* Quick links to the main pages (Claude-style side nav), GROUPED by purpose
          so learner pages aren't mixed in with management tools. The current page —
          OR a sub-page of it (an open tool maps back to its gallery: a repo → Repos,
          a slide tool → Slides) — shows a green line underneath AND a green dot on
          the right, so you can see which group you're inside. Clicking any link
          navigates to that group's top-level gallery. The Admin group is collapsible
          (remembered across visits) and auto-opens while you're ON an admin page so
          the active indicator is never hidden. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {([
          { name: 'Learn', items: [{ v: 'slides', label: '🎞️ Slides' }, { v: 'tools', label: '📁 Repos' }] },
          { name: 'Explore', items: [{ v: 'presrun', label: '🎬 Presentation runs' }, { v: 'about', label: 'ℹ️ About us' }] },
          ...(app.eff().isAdmin ? [{ name: 'Admin', collapsible: true, items: [
            { v: 'dashboard', label: '🧑‍🏫 Dashboard' }, { v: 'users', label: '👥 Users' }, { v: 'moderators', label: '🛡️ Moderators' },
            { v: 'comments', label: '💬 Comments' }, { v: 'appsettings', label: '⚙️ Settings' }, { v: 'sandbox', label: '🧪 Sandbox' }, { v: 'empty', label: '📭 Empty' },
          ] }] : []),
        ] as { name: string; collapsible?: boolean; items: { v: string; label: string }[] }[]).map((g) => {
          const holdsActive = g.items.some((n) => activeGroup === n.v);
          const collapsed = !!g.collapsible && !adminOpen && !holdsActive;
          return (
            <div key={g.name}>
              {g.collapsible ? (
                <button onClick={() => setAdminOpenPersist(!adminOpen)} aria-expanded={!collapsed}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 2px', width: '100%', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--muted,#8a7f70)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  <span>{collapsed ? '▸' : '▾'}</span><span>{g.name}</span>
                </button>
              ) : (
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted,#8a7f70)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 0 2px' }}>{g.name}</div>
              )}
              {!collapsed && g.items.map((n) => {
                const isActive = activeGroup === n.v;
                return (
                  <button key={n.v} className="btn small ghost" onClick={() => { app.nav(n.v as never); closeIfSmall(); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', textAlign: 'left', marginBottom: 4, ...(isActive ? { borderBottom: '3px solid var(--green,#7fb069)' } : null) }}>
                    <span>{n.label}</span>
                    {isActive && <span aria-hidden title="You’re on this section" style={{ marginLeft: 'auto', flex: '0 0 auto', width: 9, height: 9, borderRadius: '50%', background: 'var(--green,#7fb069)', boxShadow: '0 0 0 2px var(--paper,#f7f3e9)' }} />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* The chat-history list belongs to the Coach chat only — on the other shell
          pages (Slides/Repos/…) the rail shows just the logo, New chat + nav links. */}
      {app.view === 'chat' && (<>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted,#8a7f70)', margin: '2px 0 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Chat history</div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sessions.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted,#8a7f70)' }}>No past chats yet. Say something and it’ll show up here.</p>}
        {visible.map((s) => {
          const isActive = s.id === active;
          return (
            <button key={s.id} onClick={() => doOpen(s)} title={s.title || 'New chat'}
              style={{ position: 'relative', width: '100%', minWidth: 0, textAlign: 'left', cursor: 'pointer', padding: '6px 26px 6px 8px', borderRadius: 8, background: 'var(--card,#fff8ee)', border: '1.5px solid var(--line,#e5dccb)', borderBottom: isActive ? '3px solid var(--green,#7fb069)' : '1.5px solid var(--line,#e5dccb)', font: 'inherit', color: 'inherit' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title || 'New chat'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted,#8a7f70)' }}>{relTime(s.ts)}</div>
              <span role="button" tabIndex={0} aria-label="Delete chat" title="Delete chat"
                onClick={(e) => { e.stopPropagation(); doDelete(s.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doDelete(s.id); } }}
                style={{ position: 'absolute', top: 6, right: 6, cursor: 'pointer', fontSize: 13, lineHeight: 1, color: 'var(--muted,#8a7f70)' }}>🗑</span>
            </button>
          );
        })}
        {sessions.length > COLLAPSED_COUNT && (
          <button className="btn small ghost" onClick={() => setExpanded((v) => !v)} style={{ alignSelf: 'flex-start', marginTop: 2, fontSize: 12 }}>
            {expanded ? '▲ Read less' : `▼ Read more (${sessions.length - COLLAPSED_COUNT})`}
          </button>
        )}
      </div>
      </>)}
    </aside>
  );
}
