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
import { ViewAsBar } from '@/components/ui/ViewAsBar';
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
const RESTORABLE: ViewName[] = ['home', 'chat', 'stats', 'dashboard', 'cspath', 'feed', 'tools', 'slides', 'tool', 'toolbuilder'];

type NavEntry = { view: ViewName; tool: string | null; key?: string };

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

  // ── Scroll-position memory ────────────────────────────────────────────────
  // Remember where you were on each page so Back returns to that spot (not the
  // top). We key the saved scrollY by a per-history-entry id, save it when
  // leaving a page, and restore it after the destination renders (with retries,
  // since tool pages load asynchronously and grow taller over a few frames).
  const scrollByKey = useRef<Record<string, number>>({});
  const curScrollKey = useRef<string>('root');
  const newScrollKey = () => { try { return crypto.randomUUID(); } catch { return `k${Date.now()}${Math.random()}`; } };
  const restoreScroll = useCallback((y: number) => {
    if (!y || y <= 0) { window.scrollTo(0, 0); return; }
    let tries = 0;
    const tick = () => {
      window.scrollTo(0, y);
      tries += 1;
      // Keep trying until we actually reach y (the page may still be growing) or
      // we give up after ~1.5s of frames.
      if (Math.abs(window.scrollY - y) > 2 && tries < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // A couple of late retries for slow async content (images, fetched tools).
    setTimeout(() => window.scrollTo(0, y), 400);
    setTimeout(() => window.scrollTo(0, y), 900);
  }, []);
  // Opt out of the browser's own scroll restoration — we do it ourselves.
  useEffect(() => { try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch { /* ignore */ } }, []);

  useEffect(() => {
    setMounted(true);
    // Hydrate the session singleton from localStorage (same keys as the legacy SPA).
    const token = localStorage.getItem('sl_token');
    if (token) {
      API.token = token;
      try { API.user = JSON.parse(localStorage.getItem('sl_user') || 'null'); } catch { API.user = null; }
      setUser(API.user);
      // Re-verify the role against the server: it may have CHANGED since login (e.g.
      // a moderator who spent past zero was dropped back to a plain user, or an
      // admin granted tokens and promoted them). This keeps role-gated buttons in
      // sync after a refresh instead of trusting the cached login role forever.
      API.get('/api/me').then((me: any) => {
        if (!me?.username) return;
        const fresh = { username: me.username, role: me.role } as SessionUser;
        if (!API.user || API.user.role !== fresh.role || API.user.username !== fresh.username) {
          API.user = fresh;
          try { localStorage.setItem('sl_user', JSON.stringify(fresh)); } catch { /* ignore */ }
          setUser(fresh);
        }
      }).catch(() => { /* offline / expired token — keep the cached user */ });
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
    // Save where we are on the page we're LEAVING, so Back can return to this spot.
    try { scrollByKey.current[curScrollKey.current] = window.scrollY; } catch { /* ignore */ }
    setView(next);
    window.scrollTo(0, 0);   // a forward navigation always starts at the top
    // PUSH a browser history entry too so the native Back button also walks back.
    try {
      const key = newScrollKey();
      curScrollKey.current = key;
      const state: NavEntry = { view: next, tool: next === 'tool' ? (appState.activeTool?.slug || null) : null, key };
      window.history.pushState(state, '', urlFor(next));
    } catch { /* ignore */ }
  }, [setView]);

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
      // Save the scroll of the page we're leaving, then aim to restore the scroll
      // of the entry we're landing on (keyed by its history id).
      try { scrollByKey.current[curScrollKey.current] = window.scrollY; } catch { /* ignore */ }
      const destKey = st.key || 'root';
      curScrollKey.current = destKey;
      const targetY = scrollByKey.current[destKey] || 0;
      if (slug) {
        API.get(`/api/tools?slug=${encodeURIComponent(slug)}`).then((r: any) => {
          // tool→tool Back: the view string stays 'tool', so setView is a no-op and
          // nothing would re-render (the page would appear "stuck"). rerender() bumps
          // the keyed <main key={tool:slug}> so it remounts onto the restored tool.
          if (r?.tool) { appState.activeTool = r.tool; setView('tool'); rerender(); }
          restoreScroll(targetY);
        }).catch(() => { restoreScroll(targetY); });
      } else {
        setView(RESTORABLE.includes(v) ? v : 'tools');
        restoreScroll(targetY);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setView, rerender, restoreScroll]);

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
    tools: <ToolsView kind="repository" />,
    slides: <ToolsView kind="presentation" />,
    tool: <ToolRunnerView />,
    toolbuilder: <BuilderStudioView />,
    toolsettings: <ToolSettingsView />,
  };

  return (
    <AppContext.Provider value={{ view, nav, rerender, tick, user, login, logout, viewAs, setViewAs, eff: (owner?: string) => computeEff(user, viewAs, owner) }}>
      <Header />
      {/* "View as" preview bar — admins can render any page as a plain user, the
          creator (OP), or an admin would see it (client-side preview only; server
          permissions are unchanged). Resets to "You" when you change pages.
          Its own container (ViewAsBar) closing in a dashed rule. */}
      {user?.role === 'admin' && <ViewAsBar viewAs={viewAs} onSetViewAs={setViewAs} />}
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
      {/* (The global "← Back to …" bar was removed — navigation lives in the header.) */}
      {/* key={view} remounts only on a view switch (fresh state per view, like
          the legacy SPA); in-view rerender() updates in place. For the tool view
          the key also carries the active tool's slug, so opening a DIFFERENT tool
          while already on a tool page (e.g. "Make a lesson" from a repo's topic
          shelf) remounts the runner onto the new tool instead of staying put. */}
      <main id="app" key={view === 'tool' ? `tool:${appState.activeTool?.slug || ''}` : view}>
        <ErrorBoundary onHome={() => nav('tools')}>{views[view]}</ErrorBoundary>
      </main>
      <Footer />
    </AppContext.Provider>
  );
}
