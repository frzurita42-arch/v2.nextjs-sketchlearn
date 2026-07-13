'use client';
/* Client SPA shell. Ported from public/js/main.js + core/router.js.
 * Holds the current view + session, mirrors the legacy in-memory navigation
 * (confirm-on-leave-activity, scroll-to-top), and shows the demo-mode banner. */
import { useCallback, useEffect, useState } from 'react';
import { API, type SessionUser } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { AppContext, type ViewName } from '@/components/AppContext';
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

export default function AppRoot() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setView] = useState<ViewName>('tools');   // Tools is the home page
  const [tick, setTick] = useState(0);
  const [demo, setDemo] = useState(false);

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

  const nav = useCallback((next: ViewName) => {
    if (appState.game && !appState.game.finished && next !== 'activity' &&
        !window.confirm('Leave the current activity? Your progress will be lost.')) return;
    if (next !== 'activity') appState.game = null;
    setView(next);
    window.scrollTo(0, 0);
    // Persist the view to the URL so a refresh lands back on the same page.
    try {
      const url = new URL(window.location.href);
      if (RESTORABLE.includes(next)) {
        url.searchParams.set('view', next);
        if (next === 'tool' && appState.activeTool?.slug) url.searchParams.set('tool', appState.activeTool.slug);
        else url.searchParams.delete('tool');
      } else {
        url.searchParams.delete('view');
        url.searchParams.delete('tool');
      }
      window.history.replaceState(null, '', url.toString());
    } catch { /* ignore */ }
  }, []);

  const login = useCallback((token: string, u: SessionUser) => {
    API.setSession(token, u);
    setUser(u);
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
        if (!cancelled && r?.tool) { appState.activeTool = r.tool; setView('tool'); }
      }).catch(() => { /* ignore */ });
      return () => { cancelled = true; };
    }
    if (v && v !== 'tool' && RESTORABLE.includes(v)) setView(v);
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
      <AppContext.Provider value={{ view, nav, rerender, tick, user, login, logout }}>
        <main id="app"><LoginView /></main>
      </AppContext.Provider>
    );
  }

  const backBtnStyle = { background: '#f9a03f', color: 'var(--ink)', borderColor: 'var(--ink)', fontWeight: 700 } as const;

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
    <AppContext.Provider value={{ view, nav, rerender, tick, user, login, logout }}>
      <Header />
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
      {/* Global back bar — on every page, a centered orange Back button
          (→ home = Tools) under a full-width dashed rule, right under the header. */}
      <div style={{ margin: '6px 0 8px', textAlign: 'center' }}>
        <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.5, margin: '0 0 8px' }} />
        <button className="btn small" style={backBtnStyle} onClick={() => nav('tools')}>← Back</button>
      </div>
      {/* key={view} remounts only on a view switch (fresh state per view, like
          the legacy SPA); in-view rerender() updates in place. */}
      <main id="app" key={view}>
        <ErrorBoundary onHome={() => nav('tools')}>{views[view]}</ErrorBoundary>
      </main>
      {/* A second Back button at the very bottom, above the footer. */}
      <div style={{ margin: '10px 0 4px', textAlign: 'center' }}>
        <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.5, margin: '0 0 8px' }} />
        <button className="btn small" style={backBtnStyle} onClick={() => { nav('tools'); window.scrollTo(0, 0); }}>← Back</button>
      </div>
      <Footer />
    </AppContext.Provider>
  );
}
