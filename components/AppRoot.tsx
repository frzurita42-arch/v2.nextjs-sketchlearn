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
import { BootLoader } from '@/components/ui/BootLoader';
import { Footer } from '@/components/layout/Footer';
import { LoginView } from '@/components/views/LoginView';
import { HomeView } from '@/components/views/HomeView';
import { PathView } from '@/components/flows/PathView';
import { SettingsView } from '@/components/flows/SettingsView';
import { GameView } from '@/components/game/GameView';
import { LanguageGameView } from '@/components/game/LanguageGameView';
import { ChatView } from '@/components/views/ChatView';
import { CoachRail } from '@/components/coach/CoachRail';
import { EmptyShellView } from '@/components/views/EmptyShellView';
import { SandboxView } from '@/components/views/SandboxView';
import { EmptyView } from '@/components/views/EmptyView';
import { CommentsView } from '@/components/views/CommentsView';
import { PresentationRunsView } from '@/components/views/PresentationRunsView';
import { AppSettingsView } from '@/components/views/AppSettingsView';
import { UsersView } from '@/components/views/UsersView';
import { ShellGallery } from '@/components/views/ShellGallery';
import { StatsView } from '@/components/views/StatsView';
import { DashboardView } from '@/components/views/DashboardView';
import { DiscussionSection } from '@/components/social/DiscussionSection';
import { CsPathView } from '@/components/views/CsPathView';
import { FeedView } from '@/components/views/FeedView';
import { ToolsView } from '@/components/views/ToolsView';
import { ToolRunnerView } from '@/components/views/ToolRunnerView';
import { BuilderStudioView } from '@/components/views/BuilderStudioView';
import { ToolSettingsView } from '@/components/views/ToolSettingsView';
import { ModeratorsView } from '@/components/views/ModeratorsView';
import { AboutView } from '@/components/views/AboutView';

// Views that can be restored from the URL on refresh (they fetch their own data
// or, for 'tool', reload from the ?tool=<slug>). Transient flow views (path,
// settings, activity, language, toolsettings) depend on in-memory state, so a
// refresh on those returns home instead of showing a broken screen.
const RESTORABLE: ViewName[] = ['chat', 'dashboard', 'tools', 'slides', 'tool', 'toolbuilder', 'toolsettings', 'moderators', 'sandbox', 'empty', 'presrun', 'appsettings', 'users', 'comments', 'about'];
// The only pages reachable now. The legacy built-in activities (Learning Path
// home, Cybersecurity Academy, Structured Explanations, Suggested Topic, Time
// Travel, the Feed, My stats…) are retired: any attempt to open them — a nav
// call, a stale ?view= URL, an old in-app link — is redirected to Slides.
const LIVE_VIEWS: ViewName[] = ['slides', 'tools', 'chat', 'dashboard', 'tool', 'toolbuilder', 'toolsettings', 'moderators', 'sandbox', 'empty', 'presrun', 'appsettings', 'users', 'comments', 'about'];
// The HOME page — where the app lands by default and where retired/unknown views
// redirect. Coach chat is the front page.
const HOME: ViewName = 'chat';
// Management / internal pages only an admin may open. Non-admins are redirected
// HOME (the nav links to these are hidden for them too).
const ADMIN_ONLY: ViewName[] = ['moderators', 'users', 'sandbox', 'empty', 'comments', 'appsettings', 'dashboard'];
const liveView = (v: ViewName): ViewName => (LIVE_VIEWS.includes(v) ? v : HOME);

type NavEntry = { view: ViewName; tool: string | null; key?: string };

export default function AppRoot() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setViewState] = useState<ViewName>(HOME);   // Coach chat is the home page
  const [tick, setTick] = useState(0);
  const [demo, setDemo] = useState(false);
  // Sign-in / create-account overlay (shown to guests who hit a gated action, or
  // who tap "Sign in"). Guests otherwise browse the app freely.
  const [authOpen, setAuthOpen] = useState(false);
  // "View as" preview (admins only) — render pages as a plain user / the OP / an
  // admin would see them, without changing the real session. Resets to self on
  // navigation so a preview never silently leaks across pages.
  const [viewAs, setViewAs] = useState<ViewAs>('self');

  // The in-app navigation trail — the reliable fallback for "Back" that does not
  // depend on the browser's history (which Next.js also manages). Each `nav`
  // pushes the page you're leaving; `back()` pops and returns to it.
  const viewRef = useRef<ViewName>(HOME);
  const navStack = useRef<NavEntry[]>([]);
  const setView = useCallback((v: ViewName) => { viewRef.current = v; setViewState(v); }, []);
  // For guests, nudge them to sign in on arrival and again after every 4 page
  // jumps. A ref mirrors `user` so the stable `nav` callback reads it without
  // going stale, and a counter tracks the jumps between nudges.
  const userRef = useRef<SessionUser | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  const guestJumps = useRef(0);

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

  // Open the sign-in overlay only for EXPLICIT gated actions (a guest pressing
  // play, etc.) and the arrival / every-4-navigations nudge — NOT automatically on
  // every 401. A guest browsing hits signed-in-only endpoints on many pages, and
  // auto-opening on those made the login pop up on every navigation.
  const requireLogin = useCallback(() => setAuthOpen(true), []);

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
    } else {
      // No token → a signed-out visitor. Nudge them to sign in on arrival (they
      // can dismiss and keep browsing; it returns after every 4 page jumps).
      setAuthOpen(true);
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

  const nav = useCallback((nextRaw: ViewName) => {
    // Retired pages redirect to Slides (the home page). Admin-only management pages
    // are also redirected HOME for non-admins.
    let next = liveView(nextRaw);
    if (ADMIN_ONLY.includes(next) && userRef.current?.role !== 'admin') next = HOME;
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
    // Guest nudge: after every 4 jumps to a different page, reopen the sign-in
    // overlay (dismissible). Signed-in users are never counted or nudged.
    if (next !== cur && !userRef.current) {
      guestJumps.current += 1;
      if (guestJumps.current >= 4) { guestJumps.current = 0; setAuthOpen(true); }
    }
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

  // Guard: a non-admin who lands on an admin-only page (a stale ?view= URL, a
  // restored view) is sent HOME. Real role is used so an admin previewing "View
  // as user" isn't kicked off the page. Placed with the other top-level hooks so
  // it runs on every render (no conditional-hook error).
  useEffect(() => {
    if (ADMIN_ONLY.includes(liveView(view)) && user?.role !== 'admin') nav(HOME);
  }, [view, user, nav]);

  // Browser Back/Forward: restore the view the history entry points at. Also pop
  // our in-app stack so the two stay roughly in sync.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = (e: PopStateEvent) => {
      const st = (e.state || {}) as Partial<NavEntry>;
      const params = new URLSearchParams(window.location.search);
      const slug = st.tool || params.get('tool');
      const v = (st.view || (params.get('view') as ViewName | null)) || HOME;
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
        setView(RESTORABLE.includes(v) ? v : HOME);
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
    setView(HOME);
    // Fresh sign-in starts on the home (Coach chat) page; drop any restored view/tool from the URL.
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
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('tool');
    const v = params.get('view') as ViewName | null;
    if (slug) {
      // A deep/shared tool link (also a stale ?tool=… URL kept across a redeploy).
      // Works for guests too now that they can browse tools.
      let cancelled = false;
      API.get(`/api/tools?slug=${encodeURIComponent(slug)}`).then((r: any) => {
        if (cancelled) return;
        if (!r?.tool) {
          // Tool gone/unreachable — fall back to the home page and clean the URL so
          // the visitor isn't stranded on a broken tool entry.
          setView(HOME);
          try { window.history.replaceState({ view: HOME, tool: null }, '', urlFor(HOME)); } catch { /* ignore */ }
          return;
        }
        appState.activeTool = r.tool; setView('tool'); rerender();
        // Put a home (Coach chat) entry BEHIND the tool so the browser Back button
        // leaves the tool page instead of bouncing straight back to it (a deep
        // link opens with no prior in-app entry, which made Back feel "stuck").
        try {
          window.history.replaceState({ view: HOME, tool: null, key: 'home' }, '', urlFor(HOME));
          const key = newScrollKey(); curScrollKey.current = key;
          window.history.pushState({ view: 'tool', tool: slug, key }, '', urlFor('tool'));
        } catch { /* ignore */ }
      }).catch(() => { if (!cancelled) setView(HOME); });
      return () => { cancelled = true; };
    }
    if (v && v !== 'tool' && RESTORABLE.includes(v)) setView(v);
    // Seed the current history entry with a state object so the first Back works.
    try { window.history.replaceState({ view: (v && RESTORABLE.includes(v) ? v : HOME), tool: null }, '', window.location.href); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // First paint (before hydration, incl. a cold serverless start after a deploy):
  // show the writing-pencil boot loader instead of a blank page.
  if (!mounted) return <BootLoader />;

  // NOTE: guests (no user) are NOT bounced to the login screen anymore — they can
  // browse the app with plain-user privileges. The sign-in / create-account screen
  // opens as an overlay when they tap "Sign in" or hit a gated action (see the
  // authOpen overlay in the main return).

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
    moderators: <ModeratorsView />,
    sandbox: <SandboxView />,
    empty: <EmptyView />,
    presrun: <PresentationRunsView />,
    appsettings: <AppSettingsView />,
    users: <UsersView />,
    comments: <CommentsView />,
    about: <AboutView />,
  };

  // The Coach chat + the main nav pages (Slides / Repos / Moderators / Dashboard)
  // share ONE fixed-viewport shell: full-height side-rail + thin header + thin
  // footer, with the content area filling the rest. Chat renders the conversation;
  // the others render an empty pane for now (real content lands there later).
  const lv = liveView(view);
  const isChat = lv === 'chat';
  const SHELL: Record<string, { emoji: string; name: string }> = {
    slides: { emoji: '🎞️', name: 'Slides' },
    tools: { emoji: '📁', name: 'Repos' },
    toolbuilder: { emoji: '🧩', name: 'Builder Studio' },
    moderators: { emoji: '🛡️', name: 'Moderators' },
    dashboard: { emoji: '🧑‍🏫', name: 'Dashboard' },
    sandbox: { emoji: '🧪', name: 'Sandbox' },
    empty: { emoji: '📭', name: 'Empty' },
    presrun: { emoji: '🎬', name: 'Presentation runs' },
    appsettings: { emoji: '⚙️', name: 'Settings' },
    users: { emoji: '👥', name: 'Users' },
    comments: { emoji: '💬', name: 'Comments' },
    about: { emoji: 'ℹ️', name: 'About us' },
    tool: { emoji: '▶️', name: 'Playing' },
  };
  const isShell = isChat || lv in SHELL;

  return (
    <AppContext.Provider value={{ view, nav, rerender, tick, user, login, logout, viewAs, setViewAs, eff: (owner?: string) => computeEff(user, viewAs, owner), requireLogin }}>
      <div style={isShell ? { display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' } : undefined}>
      <Header chat={isShell} />
      {/* Sign-in / create-account overlay for guests. Dismissible so they can keep
          browsing; closes automatically once they're signed in. */}
      {authOpen && !user && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto', padding: '3vh 12px' }}
          onClick={() => setAuthOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420 }}>
            {/* The ✕ lives INSIDE the card (via onClose) so it sits on the opaque
                card and nothing on the page shows through. Opens on Sign in. */}
            <LoginView onDone={() => setAuthOpen(false)} onClose={() => setAuthOpen(false)} initialMode="login" />
          </div>
        </div>
      )}
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
      <main id="app" key={view === 'tool' ? `tool:${appState.activeTool?.slug || ''}` : view}
        style={isShell ? { flex: 1, minHeight: 0, maxWidth: 'none', margin: 0, padding: 0, paddingLeft: 'var(--chat-rail, 0px)', border: 'none', overflow: 'hidden' } : undefined}>
        <ErrorBoundary onHome={() => nav(HOME)}>
          {isShell && !isChat
            ? (<><CoachRail />{
                lv === 'sandbox' ? <SandboxView />
                : lv === 'empty' ? <EmptyView />
                : lv === 'comments' ? <CommentsView />
                // The tool runner / lesson player, adapted into the shell working
                // column (dashed guide lines), scrolling within it.
                : lv === 'tool'
                  ? <div style={{ height: '100%', overflowY: 'auto' }}>
                      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
                        {views.tool}
                      </div>
                    </div>
                // Builder Studio uses the same shell working column so it matches
                // Slides/Repos/Tool with the side nav + dashed vertical limits.
                : lv === 'toolbuilder'
                  ? <div style={{ height: '100%', overflowY: 'auto' }}>
                      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
                        {views.toolbuilder}
                      </div>
                    </div>
                : lv === 'appsettings' ? <AppSettingsView />
                : lv === 'presrun' ? <PresentationRunsView />
                : lv === 'slides' ? <ShellGallery pageKey="slides" kind="presentation" title="🎞️ Slides gallery" subtitle="Every slide tool on the site" />
                : lv === 'tools' ? <ShellGallery pageKey="tools" kind="repository" title="📁 Repos gallery" subtitle="Every repository on the site" />
                // Moderators & Users self-manage their shell column; Dashboard scrolls in a wrapper.
                : lv === 'moderators' ? views.moderators
                : lv === 'users' ? views.users
                // About us scrolls inside the shell working column (dashed guide lines).
                : lv === 'about'
                  ? <div style={{ height: '100%', overflowY: 'auto' }}>
                      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
                        {views.about}
                      </div>
                    </div>
                : lv === 'dashboard'
                  ? <div style={{ height: '100%', overflowY: 'auto' }}>
                      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
                        {views.dashboard}
                        {/* The shared discussion/comment section — one container, sitting beneath the dashboard. */}
                        <div style={{ marginTop: 28 }}>
                          <DiscussionSection titleKey="dashboardDiscussionTitle" titleFallback="💬 Discussion"
                            collapseKey="dashboardDiscussionCollapsed"
                            targetType="tool" targetId="__dashboard__" maxWidth={840} />
                        </div>
                      </div>
                    </div>
                : <EmptyShellView emoji={SHELL[lv].emoji} name={SHELL[lv].name} />
              }</>)
            : views[lv]}
        </ErrorBoundary>
      </main>
      {isShell ? <Footer compact /> : <Footer />}
      </div>
    </AppContext.Provider>
  );
}
