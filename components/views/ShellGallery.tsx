'use client';
/* The new shell-layout gallery, recycling the site's real components: the shared
 * <ToolCard> for the cards (Open button hidden — the picture/title still open it),
 * a favorites filter + search bar, gallery pagination, and the shared <PagedTable>
 * for the data table below a divider. Used by the Slides and Repos pages. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { ToolCard } from '@/components/tools/ToolCard';
import { PagedTable, type Cell } from '@/components/ui/PagedTable';
import { loadLikes, saveLikes } from '@/lib/tool-likes';
import { useCardSize, useImgSize, galleryLayout } from '@/lib/card-size';
import { CardViewMenu } from '@/components/ui/CardViewMenu';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { StorageModeBadge } from '@/components/ui/StorageModeBadge';
import { RepoChatComposer } from '@/components/ui/RepoChatComposer';
import { filterLabel } from '@/components/ui/GalleryChrome';
import { GallerySkeleton } from '@/components/ui/GallerySkeleton';

const GALLERY_PER_PAGE = 6;

// Edit a card's title + description (type, or ✦ write each with AI). Ported from
// ToolsView so the cards here have the same editor.
function CardEditor({ tool, onClose, onSaved }: { tool: any; onClose: () => void; onSaved: (title: string, description: string) => void }) {
  const [title, setTitle] = useState<string>(tool.title || '');
  const [desc, setDesc] = useState<string>(tool.description || '');
  const [busy, setBusy] = useState<'' | 'title' | 'description' | 'save'>('');
  const ai = async (field: 'title' | 'description') => {
    setBusy(field);
    try { const r: any = await API.post('/api/tools/describe', { slug: tool.slug, field }); if (r?.text) { if (field === 'title') setTitle(r.text); else setDesc(r.text); } else if (r?.error) alert(r.error); }
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
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>Edit card</b><button className="btn small ghost" onClick={onClose}>✕</button></div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>TITLE <button className="btn small blue" disabled={busy === 'title'} onClick={() => ai('title')} style={{ padding: '0 6px' }}>{busy === 'title' ? '…' : '✦ AI'}</button></div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', fontSize: 15, marginBottom: 8 }} />
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>DESCRIPTION <button className="btn small blue" disabled={busy === 'description'} onClick={() => ai('description')} style={{ padding: '0 6px' }}>{busy === 'description' ? '…' : '✦ AI'}</button></div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} style={{ width: '100%', minHeight: 70, fontSize: 14, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn small ghost" onClick={onClose}>Cancel</button>
          <button className="btn small green" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

type Kind = 'presentation' | 'repository';
const isKind = (t: any, kind: Kind) => {
  const a = t?.archetype || t?.definition?.archetype;
  return kind === 'presentation' ? a === 'lesson' : a !== 'lesson';
};
function fmtDate(v: any): string { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(); }
function unitCount(t: any, kind: Kind): number {
  if (kind === 'presentation') return Number(t?.definition?.lesson?.totalSlides || t?.definition?.lesson?.pages?.length || 0) || 0;
  return Number(t?.definition?.cards?.length || t?.definition?.entries?.length || 0) || 0;
}

export function ShellGallery({ kind, title, subtitle, topSlot, topSlotLabel, pageKey }: { kind: Kind; title: string; subtitle: string; topSlot?: React.ReactNode; topSlotLabel?: string; pageKey?: string }) {
  const app = useApp();
  const isGuest = !app.user;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  // Show everything by default so new repos are visible immediately; Favorites
  // remains available as a narrower view.
  const [filter, setFilter] = useState<'all' | 'fav' | 'mine'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');   // date created: newest / oldest first
  const [page, setPage] = useState(1);
  const [editTool, setEditTool] = useState<any>(null);
  const [thumbing, setThumbing] = useState<Record<string, boolean>>({});
  const [imgPromptTool, setImgPromptTool] = useState<any>(null);
  const [imgPromptText, setImgPromptText] = useState('');
  const cardSize = useCardSize(pageKey);
  const imgMode = useImgSize(pageKey);
  const layout = galleryLayout(cardSize);

  const patchTool = (slug: string, patch: any) => setTools((ts) => ts.map((t) => t.slug === slug ? { ...t, ...patch } : t));
  const isExample = (t: any) => (t.tags || []).includes('example');
  const canEdit = (t: any) => app.eff(t.owner).canEdit;

  // Thumbnail (image) controls — regenerate with AI, custom prompt, upload, 🎲 emoji.
  const genThumb = async (t: any, instruction?: string) => {
    setThumbing((m) => ({ ...m, [t.slug]: true }));
    try { const r: any = await API.post('/api/tools/thumbnail', { slug: t.slug, instruction: instruction || '' }); if (r?.thumbnail) patchTool(t.slug, { thumbnail: r.thumbnail }); else if (r?.error) alert(r.error); }
    catch (e: any) { alert(e?.message || 'Could not generate a thumbnail.'); }
    setThumbing((m) => { const n = { ...m }; delete n[t.slug]; return n; });
  };
  const openImgPrompt = (t: any) => { setImgPromptText(''); setImgPromptTool(t); };
  const diceThumb = async (t: any) => {
    setThumbing((m) => ({ ...m, [t.slug]: true }));
    try { const r: any = await API.post('/api/tools/thumbnail', { slug: t.slug, emoji: 'random' }); if (r?.thumbnail) patchTool(t.slug, { thumbnail: r.thumbnail }); else if (r?.error) alert(r.error); }
    catch (e: any) { alert(e?.message || 'Could not change the emoji.'); }
    setThumbing((m) => { const n = { ...m }; delete n[t.slug]; return n; });
  };
  const uploadThumb = async (t: any, file: File) => {
    if (!/^image\//.test(file.type)) { alert('Please choose an image file.'); return; }
    if (file.size > 8_000_000) { alert('Please pick an image under 8 MB.'); return; }
    setThumbing((m) => ({ ...m, [t.slug]: true }));
    try {
      let url = '';
      try { const up: any = await API.upload('/api/upload', file); if (up?.url) url = up.url; } catch { /* fall back to data URL */ }
      if (!url) url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.readAsDataURL(file); });
      const r: any = await API.post('/api/tools/thumbnail', { slug: t.slug, image: url }); if (r?.thumbnail) patchTool(t.slug, { thumbnail: r.thumbnail }); else if (r?.error) alert(r.error);
    } catch (e: any) { alert(e?.message || 'Could not upload the image.'); }
    setThumbing((m) => { const n = { ...m }; delete n[t.slug]; return n; });
  };
  const del = async (t: any) => {
    if (isExample(t)) { alert('Built-in examples cannot be deleted.'); return; }
    if (!confirm(`Delete “${t.title}”? This can't be undone.`)) return;
    try { await API.del(`/api/tools?slug=${encodeURIComponent(t.slug)}`); setTools((ts) => ts.filter((x) => x.slug !== t.slug)); }
    catch (e: any) { alert(e?.message || 'Could not delete.'); }
  };

  useEffect(() => { setFavs(loadLikes()); }, [app.user?.username]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (kind === 'presentation') {
          // Slides tab should always show the full lesson-tool inventory:
          // built-in lesson examples plus user-created lessons when available.
          const r = await API.get('/api/tools?archetype=lesson&limit=200');
          if (!alive) return;
          const all = Array.isArray(r?.tools) ? r.tools : [];
          setTools(all.filter((t: any) => isKind(t, kind)));
          return;
        }

        const r = await API.get('/api/tools');
        if (!alive) return;
        const all = Array.isArray(r?.tools) ? r.tools : [];
        setTools(all.filter((t: any) => isKind(t, kind)));
      } catch {
        if (!alive) return;
        if (kind === 'presentation') {
          // Last-resort fallback: generic list then keep only lesson tools.
          try {
            const fallback = await API.get('/api/tools?limit=200');
            if (!alive) return;
            const all = Array.isArray(fallback?.tools) ? fallback.tools : [];
            setTools(all.filter((t: any) => isKind(t, kind)));
            return;
          } catch {
            setTools([]);
            return;
          }
        }
        setTools([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [kind]);

  const toggleFav = (t: any) => {
    setFavs((prev) => {
      const next = { ...prev }; const now = !next[t.slug];
      if (now) next[t.slug] = true; else delete next[t.slug];
      saveLikes(next); API.post('/api/tools/like', { slug: t.slug, liked: now }).catch(() => { /* ignore */ });
      return next;
    });
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = tools.filter((t) => {
      if (filter === 'fav' && !favs[t.slug]) return false;
      if (filter === 'mine' && t.owner !== app.user?.username) return false;
      if (term) {
        const hay = `${t.title || ''} ${t.description || ''} ${(t.tags || []).join(' ')} ${t.owner || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const ts = (t: any) => { const d = new Date(t?.createdAt || 0).getTime(); return isNaN(d) ? 0 : d; };
    return list.sort((a, b) => (sort === 'newest' ? ts(b) - ts(a) : ts(a) - ts(b)));
  }, [tools, filter, favs, q, app.user?.username, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / GALLERY_PER_PAGE));
  const shown = useMemo(() => filtered.slice((page - 1) * GALLERY_PER_PAGE, page * GALLERY_PER_PAGE), [filtered, page]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  useEffect(() => { setPage(1); }, [filter, q]);

  const openTool = async (t: any) => {
    try { const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(t.slug)}`); appState.activeTool = r?.tool || t; }
    catch { appState.activeTool = t; }
    app.nav('tool');
  };

  const openBuilder = () => {
    if (!app.user) { app.requireLogin(); return; }
    appState.builderSeed = { artifact: kind } as any;
    app.nav('toolbuilder');
  };

  // A random suggestion for the empty-state skeleton (stable while the list is stable).
  const skelRec = useMemo(() => (tools.length ? tools[Math.floor(Math.random() * tools.length)] : null), [tools]);

  const unitLabel = kind === 'presentation' ? 'Slides' : 'Cards';
  const rows: Cell[][] = filtered.map((t) => [
    t.title || 'Untitled', t.owner || '—', unitCount(t, kind) || '—',
    t.visibility || '—', t.aiGenerated ? '✦' : '', Number(t.likeCount || 0), fmtDate(t.createdAt), t.slug,
  ]);

  const filters: { key: 'all' | 'fav' | 'mine'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'fav', label: '★ Favorites' },
    ...(isGuest ? [] : [{ key: 'mine' as const, label: 'Mine' }]),
  ];

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <PageHeaderBar pageKey={pageKey} title={title} subtitle={`${subtitle}${tools.length ? ` — ${tools.length} total` : ''}.`} />

        {/* Repos gallery only: a display-only chat composer (the future "create a
            repository from a description" interface). Sits directly BELOW the title
            and ABOVE the DB-mode badge. Not wired up yet — presentation only. */}
        {kind === 'repository' && <RepoChatComposer />}

        <StorageModeBadge />

        {/* Search + favorites/mine filters. The optional topSlot (e.g. the slide
            settings form) opens from the ⚙️ gear here as a popup, not inline. */}
        <span style={filterLabel}>Filters</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search by name or keyword…"
            style={{ flex: '1 1 150px', minWidth: 0, maxWidth: 300 }} />
          {filters.map((f) => (
            <button key={f.key} className={`btn small ${filter === f.key ? 'green' : 'ghost'}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
          {/* Sort by date created — newest (descending) / oldest (ascending). */}
          <select value={sort} onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')} title="Sort by date created" aria-label="Sort by date created"
            style={{ fontSize: 13, padding: '4px 6px', width: 'auto', flex: '0 0 auto', minWidth: 0 }}>
            <option value="newest">🕒 Newest</option>
            <option value="oldest">🕒 Oldest</option>
          </select>
          {topSlot ? (
            <button className="btn small ghost" title={topSlotLabel || 'Settings'} aria-label={topSlotLabel || 'Settings'}
              onClick={() => setSettingsOpen(true)} style={{ fontSize: 16, padding: '0 9px' }}>⚙️</button>
          ) : kind === 'repository' ? (
            // A settings gear for visual parity with a repo's own filter row — but
            // the gallery has no page-level settings, so it's inactive (icon only).
            <button className="btn small ghost" disabled title="Settings live on each repository’s own page" aria-label="Settings (unavailable here)"
              style={{ fontSize: 16, padding: '0 9px', opacity: 0.5, cursor: 'default' }}>⚙️</button>
          ) : null}
          {pageKey && <CardViewMenu pageKey={pageKey} />}
        </div>

        {topSlot && settingsOpen && (
          <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: '100%', margin: '32px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button className="btn small ghost" onClick={() => setSettingsOpen(false)} style={{ background: 'var(--card,#fff8ee)' }}>✕ Close</button>
              </div>
              {topSlot}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center', color: 'var(--muted,#8a7f70)', padding: '48px 0' }}>
            <span className="sl-pencil" style={{ fontSize: 30, color: 'var(--ink)' }} aria-hidden><span className="sl-pencil__line" /><span className="sl-pencil__tip">✏️</span></span>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          // Empty (e.g. no favorites yet) → the shared gallery skeleton: the pencil
          // "make/play one" card + a random suggestion + pager (like Settings › Galleries).
          <GallerySkeleton cardSize={cardSize} imgMode={imgMode} recommended={skelRec} onBuild={openBuilder} onOpen={openTool} />
        ) : (
          <>
            <div style={{ ...layout.container, alignItems: 'stretch' }}>
              {shown.map((t) => {
                const editable = canEdit(t);
                return (
                  <ToolCard key={t.slug} tool={t} view={layout.view} hideOpen onOpen={openTool} imageMode={imgMode}
                    favs={isGuest ? {} : favs} onToggleFav={isGuest ? undefined : toggleFav}
                    canEdit={editable} onEdit={editable ? setEditTool : undefined}
                    onGenThumb={editable ? genThumb : undefined} onThumbPrompt={editable ? openImgPrompt : undefined}
                    onUploadThumb={editable ? uploadThumb : undefined} onDice={editable ? diceThumb : undefined}
                    thumbing={!!thumbing[t.slug]}
                    canRemove={editable && !isExample(t)} isExample={isExample(t)} onRemove={editable ? del : undefined} />
                );
              })}
            </div>

            {pageCount > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
                <button className="btn small ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
                <span style={{ fontSize: 13 }}>Page {page} of {pageCount}</span>
                <button className="btn small ghost" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next ›</button>
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '2px dashed var(--line,#d9cfc0)', margin: '26px 0 18px' }} />

            <h3 style={{ margin: '0 0 10px' }}>All {kind === 'presentation' ? 'slides' : 'repos'} — table</h3>
            <PagedTable
              headers={['Title', 'Owner', unitLabel, 'Visibility', 'AI', 'Likes', 'Created', 'Slug']}
              rows={rows}
              empty="Nothing to show."
            />
          </>
        )}
      </div>

      {/* Edit title + description modal. */}
      {editTool && <CardEditor tool={editTool} onClose={() => setEditTool(null)} onSaved={(title, description) => patchTool(editTool.slug, { title, description })} />}
      {/* Custom-image prompt modal. */}
      {imgPromptTool && (
        <div onClick={() => setImgPromptTool(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>Custom image for “{imgPromptTool.title}”</b><button className="btn small ghost" onClick={() => setImgPromptTool(null)}>✕</button></div>
            <textarea value={imgPromptText} onChange={(e) => setImgPromptText(e.target.value)} placeholder="Describe the image to draw…" style={{ width: '100%', minHeight: 70, fontSize: 14, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn small ghost" onClick={() => setImgPromptTool(null)}>Cancel</button>
              <button className="btn small green" disabled={!!thumbing[imgPromptTool.slug]} onClick={() => { const t = imgPromptTool; setImgPromptTool(null); genThumb(t, imgPromptText.trim()); }}>{thumbing[imgPromptTool.slug] ? 'Generating…' : '🎨 Generate'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
