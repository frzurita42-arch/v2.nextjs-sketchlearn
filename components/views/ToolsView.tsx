'use client';
/* Tool gallery: browse published tools (public + your own) and open them in the
 * runtime, or start the Builder chat to make a new one. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { perPageOf } from '@/lib/page-settings';
import { useApp } from '@/components/AppContext';
import { CommentSection } from '@/components/social/CommentSection';
import { type FilterKey } from '@/components/ui/Collection';
import { GallerySection } from '@/components/ui/GallerySection';
import { ToolCard } from '@/components/tools/ToolCard';
import { AdminToolsCarousel } from '@/components/tools/AdminToolsCarousel';
import { Carousel } from '@/components/ui/Carousel';
import { InstructionPlank } from '@/components/activities/InstructionPlank';

// Edit a card's title + description (type manually or ✦ write each with AI).
function CardEditor({ tool, onClose, onSaved }: { tool: any; onClose: () => void; onSaved: (title: string, description: string) => void }) {
  const [title, setTitle] = useState<string>(tool.title || '');
  const [desc, setDesc] = useState<string>(tool.description || '');
  const [busy, setBusy] = useState<'' | 'title' | 'description' | 'save'>('');
  const ai = async (field: 'title' | 'description') => {
    setBusy(field);
    try { const r = await API.post('/api/tools/describe', { slug: tool.slug, field }); if (r?.text) { if (field === 'title') setTitle(r.text); else setDesc(r.text); } else if (r?.error) alert(r.error); }
    catch { alert('AI unavailable — type it instead.'); }
    setBusy('');
  };
  const save = async () => {
    setBusy('save');
    const t = title.trim() || tool.title; const d = desc.trim();
    try { await API.post('/api/tools/rename', { slug: tool.slug, title: t, description: d }); onSaved(t, d); onClose(); }
    catch (e: any) { alert(e?.message || 'Save failed'); setBusy(''); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>Edit card</b><button className="btn small ghost" onClick={onClose}>✕</button></div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>TITLE <button className="btn small blue" disabled={busy === 'title'} onClick={() => ai('title')} style={{ padding: '0 6px' }}>{busy === 'title' ? '…' : '✦ AI'}</button></div>
        <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', fontSize: 15, marginBottom: 8 }} />
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>DESCRIPTION <button className="btn small blue" disabled={busy === 'description'} onClick={() => ai('description')} style={{ padding: '0 6px' }}>{busy === 'description' ? '…' : '✦ AI'}</button></div>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} style={{ width: '100%', minHeight: 70, fontSize: 14, marginBottom: 8 }} />
        <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>✦ AI writes from what the tool does — not just the prompt.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn small ghost" onClick={onClose}>Cancel</button>
          <button className="btn small green" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// Module-level cache of the gallery list, so re-visiting the home/Tools page
// (SPA navigation) shows the same content INSTANTLY and just revalidates in the
// background — instead of a blank "Loading…" every time.
let toolsCache: any[] | null = null;

// The platform now has TWO home galleries: a Repositories page (the default home)
// and a Slides page (accessible from the header). Each shows only its own kind, so
// a slide deck (archetype 'lesson') is a "presentation"/Slide; EVERYTHING else
// (repo, app, generator…) is a "repository". `kind` selects which page this is.
type GalleryKind = 'repository' | 'presentation';
// Temporarily hide the "Admin's Made Tools" shelf on the tools page. Flip to true
// to bring it back.
const SHOW_ADMIN_TOOLS = false;
// The Tools carousel under the gallery is hidden so each page is a clean
// "title banner → filters → gallery → comments" layout. Flip to true to restore.
const SHOW_TOOLS_CAROUSEL = false;
const galleryCategory = (t: any): GalleryKind => {
  const arch = t?.archetype || t?.definition?.archetype;
  return arch === 'lesson' ? 'presentation' : 'repository';
};

export function ToolsView({ kind = 'repository' }: { kind?: GalleryKind }) {
  const app = useApp();
  const isSlides = kind === 'presentation';
  const [tools, setTools] = useState<any[]>(() => toolsCache || []);
  const [loading, setLoading] = useState(() => toolsCache === null);
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setFavs(JSON.parse(localStorage.getItem('sl_tool_likes') || '{}')); } catch { /* ignore */ } }, []);
  // Favorite / unfavorite a tool straight from its gallery card. Kept in the same
  // `sl_tool_likes` store the tool page uses, so the ★ Favorites filter and the
  // per-card star stay in sync everywhere, and the like is recorded server-side.
  const toggleFav = (t: any) => {
    const slug = t.slug;
    setFavs(prev => {
      const next = { ...prev };
      const nowFav = !next[slug];
      if (nowFav) next[slug] = true; else delete next[slug];
      try { localStorage.setItem('sl_tool_likes', JSON.stringify(next)); } catch { /* ignore */ }
      API.post('/api/tools/like', { slug, liked: nowFav }).catch(() => { /* ignore */ });
      // When an admin favorites, reflect it in the 🛡️ Admin filter immediately
      // (the server likedByAdmin flag only refreshes on the next list fetch).
      if (app.user?.role === 'admin') setTools(ts => ts.map(x => x.slug === slug ? { ...x, likedByAdmin: nowFav } : x));
      return next;
    });
  };
  const [editTool, setEditTool] = useState<any>(null);    // card being edited (title+desc)
  const [mixing, setMixing] = useState<Record<string, boolean>>({});   // per-slug remix spinner
  const [thumbing, setThumbing] = useState<Record<string, boolean>>({});  // per-slug thumbnail spinner
  const [imgPromptTool, setImgPromptTool] = useState<any>(null);          // tool awaiting a custom image prompt
  const [imgPromptText, setImgPromptText] = useState('');
  const genThumb = async (t: any, instruction?: string) => {
    setThumbing(m => ({ ...m, [t.slug]: true }));
    try {
      const r = await API.post('/api/tools/thumbnail', { slug: t.slug, instruction: instruction || '' });
      if (r?.thumbnail) patchTool(t.slug, { thumbnail: r.thumbnail });
      else if (r?.error) alert(r.error);
    } catch (e: any) { alert(e?.message || 'Could not generate a thumbnail.'); }
    setThumbing(m => { const n = { ...m }; delete n[t.slug]; return n; });
  };
  const openImgPrompt = (t: any) => { setImgPromptText(''); setImgPromptTool(t); };
  // 🎲 swap the tool's emoji thumbnail for a new random one.
  const diceThumb = async (t: any) => {
    setThumbing(m => ({ ...m, [t.slug]: true }));
    try {
      const r = await API.post('/api/tools/thumbnail', { slug: t.slug, emoji: 'random' });
      if (r?.thumbnail) patchTool(t.slug, { thumbnail: r.thumbnail });
      else if (r?.error) alert(r.error);
    } catch (e: any) { alert(e?.message || 'Could not change the emoji.'); }
    setThumbing(m => { const n = { ...m }; delete n[t.slug]; return n; });
  };
  // Upload a custom image file as the thumbnail (blob store, data-URL fallback).
  const uploadThumb = async (t: any, file: File) => {
    if (!/^image\//.test(file.type)) { alert('Please choose an image file.'); return; }
    if (file.size > 8_000_000) { alert('Please pick an image under 8 MB.'); return; }
    setThumbing(m => ({ ...m, [t.slug]: true }));
    try {
      let url = '';
      try { const up = await API.upload('/api/upload', file); if (up?.url) url = up.url; } catch { /* fall back to data URL */ }
      if (!url) url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.readAsDataURL(file); });
      const r = await API.post('/api/tools/thumbnail', { slug: t.slug, image: url });
      if (r?.thumbnail) patchTool(t.slug, { thumbnail: r.thumbnail });
      else if (r?.error) alert(r.error);
    } catch (e: any) { alert(e?.message || 'Could not upload the image.'); }
    setThumbing(m => { const n = { ...m }; delete n[t.slug]; return n; });
  };
  const patchTool = (slug: string, patch: any) => setTools(ts => ts.map(t => t.slug === slug ? { ...t, ...patch } : t));
  // The gallery lists many owners, so the admin "View as" preview maps to: an
  // owner-less effective admin flag (gEff), plus each card's REAL ownership —
  // suppressed in the plain-"user" preview so a visitor edits nothing.
  const gEff = app.eff();
  // "Build a tool" is available to Moderators and Admins (not plain users, and
  // not in the User "View as" preview).
  const canBuild = gEff.isAdmin || gEff.isModerator || gEff.viewAs === 'op';
  // Real tools: owner or admin. Built-in examples: an admin may curate them
  // (title/description/thumbnail), saved as an override for everyone.
  const canEditCard = (t: any) => {
    const example = (t.tags || []).includes('example');
    const realOwner = !!app.user?.username && app.user.username === t.owner;
    if (example) return gEff.isAdmin;
    // Owner editing applies only in your REAL view (or the Admin preview) — never
    // in the downgraded User / Moderators previews, where you're simulating
    // someone who does NOT own this content. So the Moderators view shows a
    // moderator's real experience: no edit controls on cards they didn't create.
    const ownerCanEdit = (gEff.viewAs === 'self' || gEff.viewAs === 'admin') && realOwner;
    return gEff.isAdmin || ownerCanEdit;
  };
  const remix = async (t: any) => {
    setMixing(m => ({ ...m, [t.slug]: true }));
    try {
      const r = await API.post('/api/tools/remix', { slug: t.slug });
      if (r?.title || r?.description) {
        await API.post('/api/tools/rename', { slug: t.slug, title: r.title || t.title, description: r.description ?? t.description });
        patchTool(t.slug, { title: r.title || t.title, description: r.description ?? t.description });
      } else if (r?.error) alert(r.error);
    } catch (e: any) { alert(e?.message || 'Could not remix.'); }
    setMixing(m => { const n = { ...m }; delete n[t.slug]; return n; });
  };

  // Admin-editable page copy (heading + subtitle), saved for everyone. Follows
  // the "View as" preview so an admin can see the non-admin gallery.
  const isAdmin = gEff.isAdmin;
  const [site, setSite] = useState<{ galleryTitle?: string; gallerySubtitle?: string; galleryFilter?: string; toolsShelfTitle?: string; picksShelfTitle?: string; galleryCollapsed?: string; toolsCollapsed?: string; adminToolsCollapsed?: string; [k: string]: string | undefined }>({});
  const [editHeading, setEditHeading] = useState<null | 'galleryTitle' | 'gallerySubtitle'>(null);
  const [headingDraft, setHeadingDraft] = useState('');
  useEffect(() => { API.get('/api/site-settings').then((r: any) => setSite(r?.settings || {})).catch(() => { /* ignore */ }); }, []);
  const saveHeading = async (key: 'galleryTitle' | 'gallerySubtitle', val: string) => {
    setEditHeading(null);
    const v = val.trim();
    setSite(s => ({ ...s, [key]: v }));
    try { await API.put('/api/site-settings', { key, value: v }); } catch { /* ignore */ }
  };
  const [headMix, setHeadMix] = useState<Record<string, boolean>>({});
  const remixHeading = async (key: 'galleryTitle' | 'gallerySubtitle') => {
    const cur = key === 'galleryTitle' ? (site.galleryTitle || 'Tool gallery') : (site.gallerySubtitle || 'Open a tool, or build your own by describing it to the AI.');
    setHeadMix(m => ({ ...m, [key]: true }));
    try {
      const r = await API.post('/api/site-settings/remix', { text: cur, kind: key === 'galleryTitle' ? 'title' : 'subtitle' });
      if (r?.text) await saveHeading(key, r.text); else if (r?.error) alert(r.error);
    } catch { alert('Could not remix.'); }
    setHeadMix(m => { const n = { ...m }; delete n[key]; return n; });
  };
  const headIcon = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 6 } as const;

  // Editable, admin-saved titles for the two carousels ("shelves").
  const saveShelf = async (key: 'toolsShelfTitle' | 'picksShelfTitle', val: string) => {
    const v = val.trim(); if (!v) return;
    setSite(s => ({ ...s, [key]: v }));
    try { await API.put('/api/site-settings', { key, value: v }); } catch { /* ignore */ }
  };
  const remixShelf = async (key: 'toolsShelfTitle' | 'picksShelfTitle', cur: string) => {
    setHeadMix(m => ({ ...m, [key]: true }));
    try {
      const r = await API.post('/api/site-settings/remix', { text: cur, kind: 'title' });
      if (r?.text) await saveShelf(key, r.text); else if (r?.error) alert(r.error);
    } catch { alert('Could not remix.'); }
    setHeadMix(m => { const n = { ...m }; delete n[key]; return n; });
  };

  // Home-page section visibility. The admin's 👁 toggle hides a section from every
  // regular user (the admin still sees it, collapsed, so it can be brought back) —
  // giving a different home layout per admin choice. Persisted in site settings.
  const galleryCollapsed = site.galleryCollapsed === '1';
  const toolsCollapsed = site.toolsCollapsed === '1';
  const adminToolsCollapsed = site.adminToolsCollapsed === '1';
  const toggleCollapse = async (key: 'galleryCollapsed' | 'toolsCollapsed' | 'adminToolsCollapsed', cur: boolean) => {
    const next = cur ? '' : '1';
    setSite(s => ({ ...s, [key]: next }));
    try { await API.put('/api/site-settings', { key, value: next }); } catch { /* ignore */ }
  };

  const HIDDEN_KEY = 'sl_hidden_examples';
  const loadHidden = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } };

  const load = async () => {
    // Only show the full-page spinner on the very first load (no cache yet);
    // otherwise keep the cached list visible and refresh it silently.
    if (toolsCache === null) setLoading(true);
    try {
      const r = await API.get('/api/tools');
      const hidden = loadHidden();
      const next = (Array.isArray(r?.tools) ? r.tools : []).filter((t: any) => !hidden.includes(t.slug));
      toolsCache = next;
      setTools(next);
    } catch { /* keep whatever we have */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // Keep the module cache in step with edits/deletes so a revisit shows the real
  // current list (not a stale copy) before the background refresh returns.
  useEffect(() => { if (!loading) toolsCache = tools; }, [tools, loading]);
  // Reload the tools WITHOUT the full-page loading flag, so the carousel (and its
  // Refresh button) stays mounted and just shows the spinner.
  const [refreshingTools, setRefreshingTools] = useState(false);
  const reloadTools = async () => {
    setRefreshingTools(true);
    try {
      const r = await API.get('/api/tools');
      const hidden = loadHidden();
      setTools((Array.isArray(r?.tools) ? r.tools : []).filter((t: any) => !hidden.includes(t.slug)));
    } catch { /* ignore */ }
    setRefreshingTools(false);
  };

  // This page shows ONLY its own kind: the Repositories home shows repos/apps/etc.;
  // the Slides page shows presentations (lesson decks). Standalone presentations
  // GENERATED inside a tool still live on that tool's own page, not here.
  const catItems = useMemo(() => tools.filter(t => galleryCategory(t) === kind), [tools, kind]);

  // The Collection's ★ Favorites filter keys by the item id (t.id), but our
  // favorites store (sl_tool_likes, shared with the tool page + the per-card star)
  // is keyed by SLUG. Remap slug→id so the filter actually matches — this is why
  // the Favorites filter was showing an empty gallery.
  const favsById = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const t of tools) if (favs[t.slug]) m[t.id] = true;
    return m;
  }, [tools, favs]);

  // The gallery list carries a LIGHT tool (heavy embedded media stripped for a fast
  // gallery), so fetch the FULL definition by slug before opening the tool page —
  // the player/repo view then mounts with all its images/saved deck intact.
  // "Build a repository" / "Build a presentation" — open the Builder Studio (the
  // tool that makes them) pre-toggled to THIS page's artifact type.
  const openBuilder = () => {
    appState.builderSeed = { artifact: isSlides ? 'presentation' : 'repository' } as any;
    app.nav('toolbuilder');
  };
  const open = async (t: any) => {
    if (!t?.slug) { appState.activeTool = t; app.nav('tool'); return; }
    try { const r = await API.get(`/api/tools?slug=${encodeURIComponent(t.slug)}`); appState.activeTool = r?.tool || t; }
    catch { appState.activeTool = t; }
    app.nav('tool');
  };

  const isExample = (t: any) => (t.tags || []).includes('example');
  const mineToDelete = (t: any) => !isExample(t) && (app.user?.role === 'admin' || app.user?.username === t.owner);
  // Every card gets a 🗑: the owner/admin truly deletes their tool; anyone else
  // (or an example) hides it from their own gallery.
  const canRemove = (_t: any) => true;
  const del = async (t: any) => {
    if (!mineToDelete(t)) {
      const hidden = Array.from(new Set([...loadHidden(), t.slug]));
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)); } catch { /* ignore */ }
      setTools(ts => ts.filter(x => x.slug !== t.slug));
      return;
    }
    if (!confirm(`Delete “${t.title}”? This can't be undone.`)) return;
    try { await API.del(`/api/tools?slug=${encodeURIComponent(t.slug)}`); setTools(ts => ts.filter(x => x.slug !== t.slug)); } catch (e: any) { alert(e?.message || 'Could not delete.'); }
  };

  // One card via the shared ToolCard, wired with this view's owner/admin handlers.
  // `hideOpen` (used in the carousel) drops the Open button — image + title open it.
  const card = (t: any, view: 'grid' | 'row', hideOpen?: boolean) => (
    <ToolCard tool={t} view={view} onOpen={open} favs={favs} onToggleFav={toggleFav} hideOpen={hideOpen}
      canEdit={canEditCard(t)} onEdit={setEditTool} onRemix={remix} mixing={!!mixing[t.slug]}
      onGenThumb={genThumb} onThumbPrompt={openImgPrompt} onUploadThumb={uploadThumb} onDice={diceThumb} thumbing={!!thumbing[t.slug]}
      canRemove={canRemove(t)} isExample={isExample(t)} onRemove={del} />
  );

  return (
    <>
      {editTool && <CardEditor tool={editTool} onClose={() => setEditTool(null)} onSaved={(title, description) => patchTool(editTool.slug, { title, description })} />}
      {imgPromptTool && (
        <div onClick={() => setImgPromptTool(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: '100%', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>Custom image for “{imgPromptTool.title}”</b><button className="btn small ghost" onClick={() => setImgPromptTool(null)}>✕</button></div>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 6px' }}>Describe what to show. Your idea is blended with the tool&apos;s theme and the everyday-scene style into one image.</p>
            <textarea value={imgPromptText} onChange={e => setImgPromptText(e.target.value)} autoFocus placeholder="e.g. a teacher jogging at sunrise, thinking about grading" style={{ width: '100%', minHeight: 64, fontSize: 14, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn small ghost" onClick={() => setImgPromptTool(null)}>Cancel</button>
              <button className="btn small green" disabled={!!thumbing[imgPromptTool.slug]} onClick={() => { const t = imgPromptTool; setImgPromptTool(null); genThumb(t, imgPromptText.trim()); }}>{thumbing[imgPromptTool.slug] ? 'Generating…' : '🎨 Generate'}</button>
            </div>
          </div>
        </div>
      )}
      {editHeading === 'galleryTitle' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', maxWidth: 620, margin: '0 auto' }}>
          <input value={headingDraft} onChange={e => setHeadingDraft(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveHeading('galleryTitle', headingDraft); if (e.key === 'Escape') setEditHeading(null); }}
            style={{ fontSize: 24, fontWeight: 700, padding: '4px 8px', borderRadius: 8, border: '2px solid var(--ink)', width: '100%', maxWidth: 460 }} />
          <button className="btn small green" onClick={() => saveHeading('galleryTitle', headingDraft)}>Save</button>
          <button className="btn small ghost" onClick={() => setEditHeading(null)}>✕</button>
        </div>
      ) : (
        <h1 className="view-title">
          {isSlides
            ? (site.slideGalleryTitle ? <span className="scribble-underline">{site.slideGalleryTitle}</span> : <>🎞️ <span className="scribble-underline">Slides</span></>)
            : (site.galleryTitle ? <span className="scribble-underline">{site.galleryTitle}</span> : <>Tool <span className="scribble-underline">gallery</span></>)}
          {isAdmin && !isSlides && <button title="Edit heading (admin)" onClick={() => { setHeadingDraft(site.galleryTitle || 'Tool gallery'); setEditHeading('galleryTitle'); }} style={{ ...headIcon, fontSize: 15 }}>✎</button>}
          {isAdmin && !isSlides && <button title="AI tap-mixer — reword the heading" disabled={!!headMix.galleryTitle} onClick={() => remixHeading('galleryTitle')} style={{ ...headIcon, fontSize: 15 }}>{headMix.galleryTitle ? '…' : '🎨'}</button>}
        </h1>
      )}
      {editHeading === 'gallerySubtitle' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', maxWidth: 620, margin: '4px auto' }}>
          <input value={headingDraft} onChange={e => setHeadingDraft(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveHeading('gallerySubtitle', headingDraft); if (e.key === 'Escape') setEditHeading(null); }}
            style={{ fontSize: 14, padding: '4px 8px', borderRadius: 8, border: '2px solid var(--ink)', width: '100%', maxWidth: 460 }} />
          <button className="btn small green" onClick={() => saveHeading('gallerySubtitle', headingDraft)}>Save</button>
          <button className="btn small ghost" onClick={() => setEditHeading(null)}>✕</button>
        </div>
      ) : (
        <p className="view-sub" style={{ textAlign: 'center' }}>
          {isSlides ? (site.slideGallerySubtitle || 'Browse every slide presentation — open one to play it.') : (site.gallerySubtitle || 'Open a tool, or build your own by describing it to the AI.')}
          {isAdmin && !isSlides && <button title="Edit subtitle (admin)" onClick={() => { setHeadingDraft(site.gallerySubtitle || 'Open a tool, or build your own by describing it to the AI.'); setEditHeading('gallerySubtitle'); }} style={{ ...headIcon, fontSize: 13 }}>✎</button>}
          {isAdmin && !isSlides && <button title="AI tap-mixer — reword the subtitle" disabled={!!headMix.gallerySubtitle} onClick={() => remixHeading('gallerySubtitle')} style={{ ...headIcon, fontSize: 13 }}>{headMix.gallerySubtitle ? '…' : '🎨'}</button>}
        </p>
      )}
      {(!loading && tools.length === 0) ? (
          <div className="card alt" style={{ maxWidth: 560, margin: '10px auto', padding: '18px 20px', textAlign: 'center' }}>
            <p style={{ margin: isAdmin ? '0 0 10px' : 0 }}>{isAdmin ? 'No tools yet. Be the first — describe a tool and the AI will assemble it.' : 'No tools yet.'}</p>
            {isAdmin && <button className="btn green" onClick={openBuilder}>＋ Build a {isSlides ? 'presentation' : 'repository'}</button>}
          </div>
        ) : (!loading && galleryCollapsed && !isAdmin) ? null : (
          <>
            {/* Same shared container as the History feed: title → banner → filter →
                [Build a tool + category chips] → items. Build a tool and the
                All/Presentations/Repositories chips now sit on their own row BELOW
                the filter toolbar (via belowToolbar). */}
            <GallerySection
              titleKey="galleryShelfTitle" titleFallback="🖼️ Gallery"
              bannerKey="galleryBanner" bannerDefault="🖼️ Gallery — browse every tool. Search by name or @user, filter by favorites, liked by admin or Moderators, switch grid or rows, sort newest/oldest, and page through. Tap a card to open its tool."
              showRefresh={false}
              belowToolbar={canBuild
                ? <div style={{ display: 'flex', justifyContent: 'center' }}><button className="btn small green" onClick={openBuilder}>＋ Build a {isSlides ? 'presentation' : 'repository'}</button></div>
                : undefined}
              showCollapse collapsed={galleryCollapsed}
              onToggleCollapse={isAdmin ? () => toggleCollapse('galleryCollapsed', galleryCollapsed) : undefined}
              loading={loading}
              items={loading ? [] : catItems}
              id={(t: any) => t.id}
              searchText={(t: any) => `${t.title || ''} ${t.owner || ''}`}
              time={(t: any) => new Date(t.createdAt || 0).getTime()}
              favs={favsById}
              likedByAdmin={(t: any) => !!t.likedByAdmin}
              likedByOwner={(t: any) => !!app.user?.username && t.owner === app.user.username}
              ownerLabel="💛 Moderators"
              ownerTitle="Only tools you created (you moderate)"
              perPage={perPageOf(isSlides ? site.slidePerPage : site.repoPerPage)}
              storageKey="sl_tools_view"
              sortPrefKey="gallery"
              defaultFilter={(['all', 'fav', 'admin', 'owner'].includes(site.galleryFilter || '') ? site.galleryFilter : 'all') as FilterKey}
              canSaveFilter={isAdmin}
              onSaveFilter={(f) => { setSite(s => ({ ...s, galleryFilter: f })); API.put('/api/site-settings', { key: 'galleryFilter', value: f }).catch(() => { /* ignore */ }); }}
              emptyFiltered="No tools match these filters."
              emptyAll="No tools in this category yet."
              renderGrid={(t: any) => card(t, 'grid')}
              renderRow={(t: any) => card(t, 'row')}
            />
          </>
        )}

      {/* Sliding shelves under the gallery — hidden (SHOW_TOOLS_CAROUSEL) so each
          page stays a clean title → filters → gallery → comments layout. */}
      {SHOW_TOOLS_CAROUSEL && !loading && tools.length > 0 && (
        <>
          {(toolsCollapsed && !isAdmin) ? null : (
            <Carousel title={site.toolsShelfTitle || '🧰 Tools'} cardWidth={240} cardHeight={360}
              onRefresh={reloadTools} refreshing={refreshingTools}
              canEditTitle={isAdmin} onRenameTitle={(t) => saveShelf('toolsShelfTitle', t)}
              onRemixTitle={() => remixShelf('toolsShelfTitle', site.toolsShelfTitle || '🧰 Tools')} remixingTitle={!!headMix.toolsShelfTitle}
              showCollapse collapsed={toolsCollapsed}
              onToggleCollapse={isAdmin ? () => toggleCollapse('toolsCollapsed', toolsCollapsed) : undefined}
              banner={<InstructionPlank settingKey="toolsBanner" defaultText="🧰 Tools — every tool on the platform. Tap a card's picture or title to open its generator and create a new lesson. Owners & admins can edit the title, description and picture, or remove it. Use the slider buttons, or Refresh for a random order." />}>
              {catItems.map((t: any) => <div key={t.slug || t.id} style={{ height: '100%' }}>{card(t, 'grid', true)}</div>)}
            </Carousel>
          )}
          {/* "Admin's Made Tools" section hidden for now (restore by flipping
              SHOW_ADMIN_TOOLS to true). */}
          {SHOW_ADMIN_TOOLS && (adminToolsCollapsed && !isAdmin) ? null : SHOW_ADMIN_TOOLS ? (
            <>
              <div style={{ height: 8 }} />
              <AdminToolsCarousel max={10}
                title={site.picksShelfTitle || "🛠️ Admin's Made Tools"}
                canEditTitle={isAdmin} onRenameTitle={(t) => saveShelf('picksShelfTitle', t)}
                onRemixTitle={() => remixShelf('picksShelfTitle', site.picksShelfTitle || "🛠️ Admin's Made Tools")} remixingTitle={!!headMix.picksShelfTitle}
                showCollapse collapsed={adminToolsCollapsed}
                onToggleCollapse={isAdmin ? () => toggleCollapse('adminToolsCollapsed', adminToolsCollapsed) : undefined}
                banner={<InstructionPlank settingKey="adminToolsBanner" defaultText="🛠️ Admin's Made Tools — the platform's built-in activities (Learning Path, Suggested Topic, Time Travel, Structured Explanations, Language Learning). Open one to use its generator like any tool; the ♻️ icon starts a fresh generation, 📖 opens the original saved results, and 🗑 hides it. Slide or Refresh to reshuffle." />} />
            </>
          ) : null}
        </>
      )}

      {/* Page-wide discussion — a comment section shared by everyone browsing this
          gallery (one thread per page: repositories vs slides). The dashed rule sits
          at the BOTTOM of the section, not the top. */}
      <div style={{ maxWidth: 820, margin: '18px auto 0' }}>
        <h3 style={{ textAlign: 'center', margin: '0 0 10px' }}>{(isSlides ? site.slideDiscussionTitle : site.repoDiscussionTitle) || '💬 Discussion'}</h3>
        <CommentSection targetType="tool" targetId={isSlides ? '__gallery_slides__' : '__gallery_repos__'} />
        <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.45, marginTop: 12 }} />
      </div>
    </>
  );
}
