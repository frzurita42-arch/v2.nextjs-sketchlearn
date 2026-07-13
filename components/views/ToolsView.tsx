'use client';
/* Tool gallery: browse published tools (public + your own) and open them in the
 * runtime, or start the Builder chat to make a new one. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { toolCategory } from '@/lib/tool-category';
import { CategoryFilter } from '@/components/tools/CategoryFilter';
import { Collection, type FilterKey } from '@/components/ui/Collection';
import { ToolCard } from '@/components/tools/ToolCard';
import { AdminToolsCarousel } from '@/components/tools/AdminToolsCarousel';
import { Carousel } from '@/components/ui/Carousel';
import { InstructionPlank } from '@/components/activities/InstructionPlank';
import { useShelfTitle } from '@/components/tools/useShelfTitle';

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

export function ToolsView() {
  const app = useApp();
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');            // category chip (section-specific)
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setFavs(JSON.parse(localStorage.getItem('sl_tool_likes') || '{}')); } catch { /* ignore */ } }, []);
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
  // Real tools: owner or admin. Built-in examples: an admin may curate them
  // (title/description/thumbnail), saved as an override for everyone.
  const canEditCard = (t: any) => (t.tags || []).includes('example') ? app.user?.role === 'admin' : (app.user?.role === 'admin' || app.user?.username === t.owner);
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

  // Admin-editable page copy (heading + subtitle), saved for everyone.
  const isAdmin = app.user?.role === 'admin';
  // The gallery's section header (editable + AI-distort), persisted for everyone.
  const galleryHdr = useShelfTitle('galleryShelfTitle', '🖼️ Gallery');
  const [site, setSite] = useState<{ galleryTitle?: string; gallerySubtitle?: string; galleryFilter?: string; toolsShelfTitle?: string; picksShelfTitle?: string }>({});
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

  const HIDDEN_KEY = 'sl_hidden_examples';
  const loadHidden = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } };

  const load = async () => {
    setLoading(true);
    try {
      const r = await API.get('/api/tools');
      const hidden = loadHidden();
      setTools((Array.isArray(r?.tools) ? r.tools : []).filter((t: any) => !hidden.includes(t.slug)));
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
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

  // Category counts (for the filter chips) + the visible subset.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tools.length };
    for (const t of tools) { const k = toolCategory(t); c[k] = (c[k] || 0) + 1; }
    return c;
  }, [tools]);
  // Category is the section-specific filter; the standard Collection owns the rest.
  const catItems = filter === 'all' ? tools : tools.filter(t => toolCategory(t) === filter);
  // A dashed rule that separates gallery sections, matching the sketch theme.
  const Divider = () => <div style={{ maxWidth: 900, margin: '16px auto', borderTop: '2px dashed var(--ink)', opacity: 0.5 }} />;

  const open = (t: any) => { appState.activeTool = t; app.nav('tool'); };
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
    <ToolCard tool={t} view={view} onOpen={open} favs={favs} hideOpen={hideOpen}
      canEdit={canEditCard(t)} onEdit={setEditTool} onRemix={remix} mixing={!!mixing[t.slug]}
      onGenThumb={genThumb} onThumbPrompt={openImgPrompt} onUploadThumb={uploadThumb} thumbing={!!thumbing[t.slug]}
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
          {site.galleryTitle ? site.galleryTitle : <>Tool <span className="scribble-underline">gallery</span></>}
          {isAdmin && <button title="Edit heading (admin)" onClick={() => { setHeadingDraft(site.galleryTitle || 'Tool gallery'); setEditHeading('galleryTitle'); }} style={{ ...headIcon, fontSize: 15 }}>✎</button>}
          {isAdmin && <button title="AI tap-mixer — reword the heading" disabled={!!headMix.galleryTitle} onClick={() => remixHeading('galleryTitle')} style={{ ...headIcon, fontSize: 15 }}>{headMix.galleryTitle ? '…' : '🎨'}</button>}
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
          {site.gallerySubtitle || 'Open a tool, or build your own by describing it to the AI.'}
          {isAdmin && <button title="Edit subtitle (admin)" onClick={() => { setHeadingDraft(site.gallerySubtitle || 'Open a tool, or build your own by describing it to the AI.'); setEditHeading('gallerySubtitle'); }} style={{ ...headIcon, fontSize: 13 }}>✎</button>}
          {isAdmin && <button title="AI tap-mixer — reword the subtitle" disabled={!!headMix.gallerySubtitle} onClick={() => remixHeading('gallerySubtitle')} style={{ ...headIcon, fontSize: 13 }}>{headMix.gallerySubtitle ? '…' : '🎨'}</button>}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="btn small green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>
        <button className="btn small" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? <p style={{ textAlign: 'center', opacity: 0.7 }}>Loading…</p>
        : tools.length === 0 ? (
          <div className="card alt" style={{ maxWidth: 560, margin: '10px auto', padding: '18px 20px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 10px' }}>No tools yet. Be the first — describe a tool and the AI will assemble it.</p>
            <button className="btn green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>
          </div>
        ) : (
          <>
            <InstructionPlank settingKey="galleryBanner" defaultText="🖼️ Gallery — browse every tool. Search by name or @user, filter by favorites, liked by admin or OP favorited, switch grid or rows, sort newest/oldest, and page through. Refresh shuffles into a random order. Tap a card to open its tool." />
            <CategoryFilter value={filter} onChange={setFilter} counts={counts} />
            <Divider />
            <Collection
              {...galleryHdr} onRefresh={reloadTools}
              items={catItems}
              id={(t: any) => t.id}
              searchText={(t: any) => `${t.title || ''} ${t.owner || ''}`}
              time={(t: any) => new Date(t.createdAt || 0).getTime()}
              favs={favs}
              likedByAdmin={(t: any) => !!t.likedByAdmin}
              likedByOwner={(t: any) => !!t.likedByOwner}
              perPage={9}
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

      {/* Sliding shelves under the gallery, above the page's bottom Back button.
          The tool SYSTEM itself, then the platform's built-in admin-made tools.
          Each carousel draws its own dashed rule underneath. */}
      {!loading && tools.length > 0 && (
        <>
          <Carousel title={site.toolsShelfTitle || '🧰 Tools'} cardWidth={240} cardHeight={360}
            onRefresh={reloadTools} refreshing={refreshingTools}
            canEditTitle={isAdmin} onRenameTitle={(t) => saveShelf('toolsShelfTitle', t)}
            onRemixTitle={() => remixShelf('toolsShelfTitle', site.toolsShelfTitle || '🧰 Tools')} remixingTitle={!!headMix.toolsShelfTitle}
            banner={<InstructionPlank settingKey="toolsBanner" defaultText="🧰 Tools — every tool on the platform. Tap a card's picture or title to open its generator and create a new lesson. Owners & admins can edit the title, description and picture, or remove it. Use the slider buttons, or Refresh for a random order." />}>
            {catItems.map((t: any) => <div key={t.slug || t.id} style={{ height: '100%' }}>{card(t, 'grid', true)}</div>)}
          </Carousel>
          <div style={{ height: 8 }} />
          <AdminToolsCarousel max={10}
            title={site.picksShelfTitle || "🛠️ Admin's Made Tools"}
            canEditTitle={isAdmin} onRenameTitle={(t) => saveShelf('picksShelfTitle', t)}
            onRemixTitle={() => remixShelf('picksShelfTitle', site.picksShelfTitle || "🛠️ Admin's Made Tools")} remixingTitle={!!headMix.picksShelfTitle}
            banner={<InstructionPlank settingKey="adminToolsBanner" defaultText="🛠️ Admin's Made Tools — the platform's built-in activities (Learning Path, Suggested Topic, Time Travel, Structured Explanations, Language Learning). Open one to use its generator like any tool; the ♻️ icon starts a fresh generation, 📖 opens the original saved results, and 🗑 hides it. Slide or Refresh to reshuffle." />} />
        </>
      )}
    </>
  );
}
