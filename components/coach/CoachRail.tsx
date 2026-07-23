'use client';
/* The shared Coach side-rail (full-height left nav) — styled as a sleek DARK
 * panel (bold brand, flat rounded nav items with hover/active states) against
 * the app's paper-sketch content area. It carries the logo, New chat, the main
 * page links, and the chat-history list, and it publishes its width as the
 * `--chat-rail` CSS var so the thin app header can indent past it.
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

// The dark-rail palette, kept together so the whole panel retunes from one spot.
const RAIL_BG = '#141519';
const RAIL_TEXT = '#cfcdc6';
const RAIL_MUTED = 'rgba(255,255,255,0.4)';

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
      <button title="Show the navigation panel" onClick={() => setOpen(true)}
        style={{ position: 'fixed', top: 8, left: 8, zIndex: 60, background: RAIL_BG, color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, cursor: 'pointer', fontSize: 16, padding: '5px 10px', lineHeight: 1 }}>🗂 »</button>
    );
  }

  const sectionLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, color: RAIL_MUTED, textTransform: 'uppercase', letterSpacing: 1, padding: '8px 10px 3px' };

  return (
    <aside style={{ position: 'fixed', top: 0, left: 0, height: '100dvh', width: RAIL_W, zIndex: 60, background: RAIL_BG, color: RAIL_TEXT, borderRight: '1px solid rgba(255,255,255,0.08)', padding: '12px 10px', display: 'flex', flexDirection: 'column', minHeight: 0, boxSizing: 'border-box' }}>
      {/* Flat, rounded nav items with hover + active states (needs real CSS, not
          inline styles). Scoped by the sl-rail- prefix so nothing leaks out. */}
      <style>{`
        .sl-rail-link{display:flex;align-items:center;gap:2px;width:100%;text-align:left;background:transparent;border:none;color:${RAIL_TEXT};font:inherit;font-size:13.5px;font-weight:600;padding:8px 10px;border-radius:10px;cursor:pointer;transition:background 120ms ease,color 120ms ease;}
        .sl-rail-link:hover{background:rgba(255,255,255,0.08);color:#fff;}
        .sl-rail-link.active{background:rgba(127,176,105,0.18);color:#fff;}
        .sl-rail-card{position:relative;width:100%;min-width:0;text-align:left;cursor:pointer;padding:7px 26px 7px 10px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);font:inherit;color:${RAIL_TEXT};transition:background 120ms ease;}
        .sl-rail-card:hover{background:rgba(255,255,255,0.1);color:#fff;}
        .sl-rail-card.active{border-color:rgba(127,176,105,0.7);background:rgba(127,176,105,0.14);color:#fff;}
      `}</style>

      {/* Bold brand at the top + collapse. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, padding: '0 4px' }}>
        <button onClick={() => { app.nav('chat'); closeIfSmall(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 19, fontWeight: 800, color: '#fff', padding: 0, letterSpacing: 0.2 }}>✏️ SketchLearn</button>
        <button title="Collapse the panel" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: RAIL_MUTED, padding: 0 }}>«</button>
      </div>

      {/* Chat — the home action, framed as a bordered pill so it reads as the
          primary "start here" button; the green fill marks it while you're on it. */}
      <button className={`sl-rail-link${app.view === 'chat' ? ' active' : ''}`} onClick={() => { doNew(); closeIfSmall(); }}
        style={{ border: '1px solid rgba(255,255,255,0.18)', marginBottom: 6 }}>
        <span>💬 Chat</span>
        {app.view === 'chat' && <span aria-hidden title="You’re on this section" style={{ marginLeft: 'auto', flex: '0 0 auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--green,#7fb069)' }} />}
      </button>

      {/* Quick links GROUPED by purpose so learner pages aren't mixed in with
          management tools. The current page — OR a sub-page of it (an open tool
          maps back to its gallery: a repo → Repos, a slide tool → Slides) — gets
          the filled active state + a green dot. The Admin group is collapsible
          (remembered across visits) and auto-opens while you're ON an admin page
          so the active indicator is never hidden. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
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
                  style={{ ...sectionLabel, background: 'none', border: 'none', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{collapsed ? '▸' : '▾'}</span><span>{g.name}</span>
                </button>
              ) : (
                <div style={sectionLabel}>{g.name}</div>
              )}
              {!collapsed && g.items.map((n) => {
                const isActive = activeGroup === n.v;
                return (
                  <button key={n.v} className={`sl-rail-link${isActive ? ' active' : ''}`} onClick={() => { app.nav(n.v as never); closeIfSmall(); }}>
                    <span>{n.label}</span>
                    {isActive && <span aria-hidden title="You’re on this section" style={{ marginLeft: 'auto', flex: '0 0 auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--green,#7fb069)' }} />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* The chat-history list belongs to the Coach chat only — on the other shell
          pages (Slides/Repos/…) the rail shows just the logo, Chat + nav links. */}
      {app.view === 'chat' && (<>
      <div style={{ ...sectionLabel, padding: '2px 10px 6px' }}>Chat history</div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {sessions.length === 0 && <p style={{ fontSize: 12, color: RAIL_MUTED, padding: '0 10px' }}>No past chats yet. Say something and it’ll show up here.</p>}
        {visible.map((s) => {
          const isActive = s.id === active;
          return (
            <button key={s.id} className={`sl-rail-card${isActive ? ' active' : ''}`} onClick={() => doOpen(s)} title={s.title || 'New chat'}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title || 'New chat'}</div>
              <div style={{ fontSize: 10.5, color: RAIL_MUTED }}>{relTime(s.ts)}</div>
              <span role="button" tabIndex={0} aria-label="Delete chat" title="Delete chat"
                onClick={(e) => { e.stopPropagation(); doDelete(s.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doDelete(s.id); } }}
                style={{ position: 'absolute', top: 7, right: 8, cursor: 'pointer', fontSize: 13, lineHeight: 1, color: RAIL_MUTED }}>🗑</span>
            </button>
          );
        })}
        {sessions.length > COLLAPSED_COUNT && (
          <button className="sl-rail-link" onClick={() => setExpanded((v) => !v)} style={{ fontSize: 12, width: 'auto', alignSelf: 'flex-start' }}>
            {expanded ? '▲ Read less' : `▼ Read more (${sessions.length - COLLAPSED_COUNT})`}
          </button>
        )}
      </div>
      </>)}
    </aside>
  );
}
