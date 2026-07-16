'use client';
/* Client SPA shell. Ported from public/js/main.js + core/router.js.
 * Holds the current view + session, mirrors the legacy in-memory navigation
 * (confirm-on-leave-activity, scroll-to-top), and shows the demo-mode banner. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API, type SessionUser } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { AppContext, computeEff, type ViewName, type ViewAs } from '@/components/AppContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { LoginView } from '@/components/views/LoginView';
import { HomeView } from '@/components/views/HomeView';
import { PathView } from '@/components/flows/PathView';
import { SettingsView } from '@/components/flows/SettingsView';
import { GameView } from '@/components/game/GameView';
import { LanguageGameView } from '@/components/game/LanguageGameView';
import { ChatView } from '@/components/views/ChatView';
import { StatsView } from '@/components/views/StatsView';
import { DashboardView } from '@/components/views/DashboardView';
import { CsPathView } from '@/components/views/CsPathView';
import { FeedView } from '@/components/views/FeedView';
import { ToolsView } from '@/components/views/ToolsView';
import { ToolRunnerView } from '@/components/views/ToolRunnerView';
import { BuilderStudioView } from '@/components/views/BuilderStudioView';
import { ToolSettingsView } from '@/components/views/ToolSettingsView';

// Views that can be restored from the URL on refresh (they fetch their own data
// or, for 'tool', reload from the ?tool=<slug>). Transient flow views (path,
// settings, activity, language, toolsettings) depend on in-memory state, so a
// refresh on those returns home instead of showing a broken screen.
const RESTORABLE: ViewName[] = ['home', 'chat', 'stats', 'dashboard', 'cspath', 'feed', 'tools', 'tool', 'toolbuilder'];

// Friendly names for the "← Back to X" fallback button (the previous page in the
// series, e.g. Tools → Tool → Activity).
const VIEW_LABELS: Record<ViewName, string> = {
  home: 'Home', tools: 'Tools', tool: 'the tool', toolbuilder: 'the Studio',
  stats: 'My Stats', dashboard: 'Dashboard', chat: 'the Coach', feed: 'the Feed',
  cspath: 'the CS Path', path: 'the lesson', settings: 'Settings',
  activity: 'the activity', language: 'the activity', toolsettings: 'Tool Settings',
};

type NavEntry = { view: ViewName; tool: string | null };

export default function AppRoot() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setViewState] = useState<ViewName>('tools');   // Tools is the home page
  const [tick, setTick] = useState(0);
  const [demo, setDemo] = useState(false);
  // "View as" preview (admins only) — render pages as a plain user / the OP / an
  // admin would see them, without changing the real session. Resets to self on
  // navigation so a preview never silently leaks across pages.
  const [viewAs, setViewAs] = useState<ViewAs>('self');

  // The in-app navigation trail — the reliable fallback for "Back" that does not
  // depend on the browser's history (which Next.js also manages). Each `nav`
  // pushes the page you're leaving; `back()` pops and returns to it.
  const viewRef = useRef<ViewName>('tools');
  const navStack = useRef<NavEntry[]>([]);
  const setView = useCallback((v: ViewName) => { viewRef.current = v; setViewState(v); }, []);

  const rerender = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    setMounted(true);
    // Hydrate the session singleton from localStorage (same keys as the legacy SPA).
    const token = localStorage.getItem('sl_token');
    if (token) {
      API.token = token;
      try { API.user = JSON.parse(localStorage.getItem('sl_user') || 'null'); } catch { API.user = null; }
      setUser(API.user);
    }
  }, []);

  // Build the URL that represents a view (so a refresh or a Back walks to it).
  const urlFor = (next: ViewName) => {
    const url = new URL(window.location.href);
    if (RESTORABLE.includes(next)) {
      url.searchParams.set('view', next);
      if (next === 'tool' && appState.activeTool?.slug) url.searchParams.set('tool', appState.activeTool.slug);
      else url.searchParams.delete('tool');
    } else {
      url.searchParams.delete('view');
      url.searchParams.delete('tool');
    }
    return url.toString();
  };

  // Land on an entry (view, and reload its tool if it was a tool page). Does NOT
  // touch the nav stack — shared by back() and the browser popstate handler.
  const restore = useCallback((entry: NavEntry) => {
    appState.game = null;
    if (entry.tool) {
      API.get(`/api/tools?slug=${encodeURIComponent(entry.tool)}`).then((r: any) => {
        if (r?.tool) { appState.activeTool = r.tool; setView('tool'); }
      }).catch(() => { /* ignore */ });
    } else {
      setView(RESTORABLE.includes(entry.view) ? entry.view : 'tools');
    }
    window.scrollTo(0, 0);
    try { window.history.pushState(entry, '', urlFor(entry.view)); } catch { /* ignore */ }
  }, [setView]);

  const nav = useCallback((next: ViewName) => {
    if (appState.game && !appState.game.finished && next !== 'activity' &&
        !window.confirm('Leave the current activity? Your progress will be lost.')) return;
    const cur = viewRef.current;
    // Remember the page we're leaving so Back can return to it (the previous page
    // in the series). Only stack restorable pages (a refresh/return can rebuild
    // them) — transient in-memory screens (activity, settings…) are never targets.
    if (next !== cur && RESTORABLE.includes(cur)) {
      navStack.current.push({ view: cur, tool: cur === 'tool' ? (appState.activeTool?.slug || null) : null });
      if (navStack.current.length > 50) navStack.current.shift();
    }
    if (next !== 'activity') appState.game = null;
    if (next !== cur) setViewAs('self');   // never carry a preview across pages
    setView(next);
    window.scrollTo(0, 0);
    // PUSH a browser history entry too so the native Back button also walks back.
    try {
      const state: NavEntry = { view: next, tool: next === 'tool' ? (appState.activeTool?.slug || null) : null };
      window.history.pushState(state, '', urlFor(next));
    } catch { /* ignore */ }
  }, [setView]);

  // The Back button: go to the previous page in the series via the in-app stack
  // (reliable regardless of the browser). Falls back to Tools when the trail is empty.
  const back = useCallback(() => {
    if (appState.game && !appState.game.finished &&
        !window.confirm('Leave the current activity? Your progress will be lost.')) return;
    const prev = navStack.current.pop() || { view: 'tools' as ViewName, tool: null };
    restore(prev);
  }, [restore]);

  // Browser Back/Forward: restore the view the history entry points at. Also pop
  // our in-app stack so the two stay roughly in sync.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = (e: PopStateEvent) => {
      const st = (e.state || {}) as Partial<NavEntry>;
      const params = new URLSearchParams(window.location.search);
      const slug = st.tool || params.get('tool');
      const v = (st.view || (params.get('view') as ViewName | null)) || 'tools';
      if (navStack.current.length) navStack.current.pop();
      appState.game = null;
      if (slug) {
        API.get(`/api/tools?slug=${encodeURIComponent(slug)}`).then((r: any) => {
          if (r?.tool) { appState.activeTool = r.tool; setView('tool'); }
        }).catch(() => { /* ignore */ });
      } else {
        setView(RESTORABLE.includes(v) ? v : 'tools');
      }
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setView]);

  const login = useCallback((token: string, u: SessionUser) => {
    API.setSession(token, u);
    setUser(u);
    navStack.current = [];
    setView('tools');
    // Fresh sign-in starts on the home (Tools) page; drop any restored view/tool from the URL.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('tool');
      window.history.replaceState(null, '', url.toString());
    } catch { /* ignore */ }
  }, []);

  const logout = useCallback(async () => {
    try { await API.post('/api/logout'); } catch { /* ignore */ }
    API.clearSession();
    if (typeof window !== 'undefined') window.location.reload();
  }, []);

  // On load (once signed in) restore the view from the URL, so a refresh stays on
  // the same page. /?tool=<slug> (or ?view=tool) reloads that shared tool.
  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('tool');
    const v = params.get('view') as ViewName | null;
    if (slug) {
      let cancelled = false;
      API.get(`/api/tools?slug=${encodeURIComponent(slug)}`).then((r: any) => {
        if (!cancelled && r?.tool) {
          appState.activeTool = r.tool; setView('tool');
          try { window.history.replaceState({ view: 'tool', tool: slug }, '', window.location.href); } catch { /* ignore */ }
        }
      }).catch(() => { /* ignore */ });
      return () => { cancelled = true; };
    }
    if (v && v !== 'tool' && RESTORABLE.includes(v)) setView(v);
    // Seed the current history entry with a state object so the first Back works.
    try { window.history.replaceState({ view: (v && RESTORABLE.includes(v) ? v : 'tools'), tool: null }, '', window.location.href); } catch { /* ignore */ }
  }, [user]);

  // Demo-mode banner: show when the server has no AI provider connected.
  useEffect(() => {
    if (!user) return;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sl_demo_dismissed') === '1') return;
    let cancelled = false;
    API.get('/api/config').then((cfg: any) => {
      if (!cancelled && cfg && !cfg.aiEnabled) setDemo(true);
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [user]);

  if (!mounted) return <main id="app" />;

  if (!user) {
    return (
      <AppContext.Provider value={{ view, nav, rerender, tick, user, login, logout, viewAs, setViewAs, eff: (owner?: string) => computeEff(user, viewAs, owner) }}>
        <main id="app"><LoginView /></main>
      </AppContext.Provider>
    );
  }

  const backBtnStyle = { background: '#f9a03f', color: 'var(--ink)', borderColor: 'var(--ink)', fontWeight: 700 } as const;
  // "← Back to <previous page in the series>" — read live from the stack. (Stack
  // mutations are paired with a setView, so this recomputes each render.)
  const peek = navStack.current[navStack.current.length - 1];
  const backLabel = `← Back to ${peek ? VIEW_LABELS[peek.view] : 'Tools'}`;

  const views: Record<ViewName, React.ReactNode> = {
    home: <HomeView />,
    path: <PathView />,
    settings: <SettingsView />,
    activity: <GameView />,
    language: <LanguageGameView />,
    chat: <ChatView />,
    stats: <StatsView />,
    dashboard: <DashboardView />,
    cspath: <CsPathView />,
    feed: <FeedView />,
    tools: <ToolsView />,
    tool: <ToolRunnerView />,
    toolbuilder: <BuilderStudioView />,
    toolsettings: <ToolSettingsView />,
  };

  return (
    <AppContext.Provider value={{ view, nav, rerender, tick, user, login, logout, viewAs, setViewAs, eff: (owner?: string) => computeEff(user, viewAs, owner) }}>
      <Header />
      {/* "View as" preview bar — admins can render any page as a plain user, the
          creator (OP), or an admin would see it (client-side preview only; server
          permissions are unchanged). Resets to "You" when you change pages. */}
      {user?.role === 'admin' && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', margin: '6px 0 0', fontSize: 12 }}>
          <span style={{ opacity: 0.6, fontWeight: 700 }}>👁 View as</span>
          {/* The admin's own view IS "Admin" (mapped to the neutral `self`), so there
              is no separate "You". Admin can preview the page as a Guest (not signed
              in), a plain User, a Moderator, or (soon) a Languages / STEM view.
              Guest, Languages and STEM are placeholders for now — shown but disabled. */}
          {([
            ['guest', 'Guest', true, 'A visitor who is NOT signed in — coming soon'],
            ['user', 'User', false, 'As a plain signed-in visitor'],
            ['op', 'Moderators', false, 'As a moderator (the content owner)'],
            ['self', 'Admin', false, 'Your admin view'],
            ['languages', 'Languages', true, 'Language view — coming soon'],
            ['stem', 'STEM', true, 'STEM view — coming soon'],
          ] as [string, string, boolean, string][]).map(([v, label, disabled, title]) => (
            <button key={v} className={`btn small ${!disabled && viewAs === v ? 'blue' : 'ghost'}`}
              style={{ padding: '2px 10px', ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}
              disabled={disabled} onClick={disabled ? undefined : () => setViewAs(v as ViewAs)} title={title}>{label}</button>
          ))}
          {(viewAs === 'user' || viewAs === 'op') && <span style={{ opacity: 0.7, fontStyle: 'italic' }}>· previewing — controls reflect this role</span>}
          {(viewAs === 'languages' || viewAs === 'stem') && <span style={{ opacity: 0.7, fontStyle: 'italic' }}>· coming soon</span>}
        </div>
      )}
      {demo && (
        <div id="demo-banner" className="demo-banner">
          <span><b>Demo mode</b> — no AI provider is connected, so lessons, charts and suggestions use built-in placeholder content. Set <b>GEMINI_API_KEY</b> or <b>DEEPSEEK_API_KEY</b> in your deployment for real AI lessons.</span>
          <button
            id="demo-banner-x"
            aria-label="Dismiss"
            onClick={() => { try { sessionStorage.setItem('sl_demo_dismissed', '1'); } catch {} setDemo(false); }}
          >×</button>
        </div>
      )}
      {/* Global back bar — on every page EXCEPT the tool/presentation page (kept
          clean), a centered Back button that returns to the previous page in the
          series (falls back to Tools) under a full-width dashed rule. */}
      {view !== 'tool' && (
      <div style={{ margin: '6px 0 8px', textAlign: 'center' }}>
        <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.5, margin: '0 0 8px' }} />
        <button className="btn small" style={backBtnStyle} onClick={back}>{backLabel}</button>
      </div>
      )}
      {/* key={view} remounts only on a view switch (fresh state per view, like
          the legacy SPA); in-view rerender() updates in place. For the tool view
          the key also carries the active tool's slug, so opening a DIFFERENT tool
          while already on a tool page (e.g. "Make a lesson" from a repo's topic
          shelf) remounts the runner onto the new tool instead of staying put. */}
      <main id="app" key={view === 'tool' ? `tool:${appState.activeTool?.slug || ''}` : view}>
        <ErrorBoundary onHome={() => nav('tools')}>{views[view]}</ErrorBoundary>
      </main>
      {/* A second Back button at the very bottom, above the footer (hidden on the
          tool/presentation page). */}
      {view !== 'tool' && (
      <div style={{ margin: '10px 0 4px', textAlign: 'center' }}>
        <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.5, margin: '0 0 8px' }} />
        <button className="btn small" style={backBtnStyle} onClick={back}>{backLabel}</button>
      </div>
      )}
      <Footer />
    </AppContext.Provider>
  );
}
