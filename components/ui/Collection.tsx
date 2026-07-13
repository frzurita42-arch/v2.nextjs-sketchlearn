'use client';
/* The STANDARD list section used across the app (tool gallery, a tool's entries
 * feed, a lesson's rendition history, and future ones). It owns the whole
 * filter/assort/paginate toolbar so every section looks and behaves the same:
 *   search (by name / @user) · ★ my favorites · 🛡️ liked by admin ·
 *   grid ▦ / rows ☰ display · newest/oldest sort · a count · pagination.
 * Each caller only supplies its data accessors and how to render one item as a
 * grid card vs. a horizontal row. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API } from '@/lib/api';

// The mutually-exclusive status filter: everything, only-my-favorites,
// only-liked-by-admin, or only-favorited-by-the-owner (OP).
export type FilterKey = 'all' | 'fav' | 'admin' | 'owner';

export interface CollectionProps<T> {
  items: T[];
  id: (t: T) => string;
  searchText: (t: T) => string;            // haystack for the search box (name, @user…)
  time?: (t: T) => number;                 // ms timestamp for sorting (omit to hide sort)
  renderGrid: (t: T) => ReactNode;         // one card in grid mode
  renderRow: (t: T) => ReactNode;          // one card in rows mode
  favs?: Record<string, boolean>;          // provide to show the ★ favorites filter
  likedByAdmin?: (t: T) => boolean;        // provide to show the 🛡️ liked-by-admin filter
  likedByOwner?: (t: T) => boolean;        // provide to show the 💛 OP-favorited filter
  perPage?: number;                        // provide to paginate
  storageKey?: string;                     // localStorage key to persist the view mode
  sortPrefKey?: string;                    // when set, the sort order is saved per-user (DB) under this key
  // The active status filter (All / favorites / admin / OP) is mutually exclusive.
  // `defaultFilter` is the recorded page default (shown on load); when the viewer
  // may persist it (owner/admin), pass `canSaveFilter` + `onSaveFilter` so their
  // choice is saved for the whole page. Everyone else's choice is session-only and
  // resets to `defaultFilter` on refresh.
  defaultFilter?: FilterKey;
  canSaveFilter?: boolean;
  onSaveFilter?: (f: FilterKey) => void;
  defaultView?: 'grid' | 'row';
  gridMinPx?: number;                      // grid card min width (default 240)
  extra?: ReactNode;                       // section-specific control (e.g. a category select)
  emptyAll?: string;                       // message when there are no items at all
  emptyFiltered?: string;                  // message when filters hide everything
  searchPlaceholder?: string;
  maxWidth?: number;
  // A carousel-style section header (emoji + title, left-aligned) shown atop the
  // filter, with optional edit (✎) / AI-distort (🎨) / refresh (🔄) controls.
  title?: string;
  canEditTitle?: boolean;
  onRenameTitle?: (t: string) => void;
  onRemixTitle?: () => void;
  remixingTitle?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  // A how-to banner (e.g. an InstructionPlank) shown between the title header and
  // the filter toolbar, so every section reads: title → banner → filter → items.
  banner?: ReactNode;
  // 👁 hide/show toggle in the header. `showCollapse` renders it; it's clickable only
  // when `onToggleCollapse` is given (admin, home page), disabled otherwise. When
  // `collapsed`, the toolbar + items are hidden (only the admin ever renders it then).
  showCollapse?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// A deterministic shuffle keyed by a seed, so Refresh gives a fresh random order
// (no AI, no tokens) that stays stable across re-renders until the next Refresh.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = (seed || 1) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Collection<T>({
  items, id, searchText, time, renderGrid, renderRow,
  favs, likedByAdmin, likedByOwner, perPage, storageKey, sortPrefKey,
  defaultFilter = 'all', canSaveFilter, onSaveFilter, defaultView = 'grid', gridMinPx = 240,
  extra, emptyAll = 'Nothing here yet.', emptyFiltered = 'Nothing matches these filters.',
  searchPlaceholder = '🔍 name / @user', maxWidth = 900, title,
  canEditTitle, onRenameTitle, onRemixTitle, remixingTitle, onRefresh, refreshing,
  banner, showCollapse, collapsed, onToggleCollapse,
}: CollectionProps<T>) {
  const [q, setQ] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title || '');
  const saveTitle = () => { const v = titleDraft.trim(); if (v && onRenameTitle) onRenameTitle(v); setEditingTitle(false); };
  const hdrIcon = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 } as const;
  // One mutually-exclusive status filter (All is the neutral default). Whoever may
  // save it (owner/admin) writes the page default; others' picks are session-only.
  const [activeFilter, setActiveFilter] = useState<FilterKey>(defaultFilter);
  const touched = useRef(false);
  useEffect(() => { if (!touched.current) setActiveFilter(defaultFilter); }, [defaultFilter]);
  const pickFilter = (f: FilterKey) => {
    touched.current = true;
    const next: FilterKey = (activeFilter === f && f !== 'all') ? 'all' : f;
    setActiveFilter(next);
    if (canSaveFilter && onSaveFilter) onSaveFilter(next);
  };
  const [sortMode, setSortMode] = useState<'newest' | 'oldest'>('newest');   // default
  // A random-order seed set by Refresh; overrides the sort until a sort is picked.
  const [shuffle, setShuffle] = useState<number | null>(null);
  const [view, setView] = useState<'grid' | 'row'>(defaultView);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!storageKey) return;
    try { const v = localStorage.getItem(storageKey); if (v === 'grid' || v === 'row') setView(v); } catch { /* ignore */ }
  }, [storageKey]);
  const setViewP = (v: 'grid' | 'row') => { setView(v); if (storageKey) { try { localStorage.setItem(storageKey, v); } catch { /* ignore */ } } };

  // Per-user saved sort order (DB) for pages that opt in with sortPrefKey.
  useEffect(() => {
    if (!sortPrefKey) return;
    let cancelled = false;
    API.get('/api/prefs').then((r: any) => {
      const v = r?.prefs?.[`sort:${sortPrefKey}`];
      if (!cancelled && (v === 'newest' || v === 'oldest')) setSortMode(v);
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [sortPrefKey]);
  const cycleSort = () => {
    const next = sortMode === 'newest' ? 'oldest' : 'newest';
    setShuffle(null);   // choosing a sort clears the random order
    setSortMode(next);
    if (sortPrefKey) API.put('/api/prefs', { key: `sort:${sortPrefKey}`, value: next }).catch(() => { /* ignore */ });
  };
  // Refresh = a fresh RANDOM order of the cards (plus any caller reload).
  const doRefresh = () => { setShuffle(Math.floor(Math.random() * 1e9) + 1); onRefresh?.(); };

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    // Favorites / liked-by-admin / OP-favorited are all just extra filters,
    // combinable with each other and with the search + sort.
    let arr = items.filter((t) => {
      if (activeFilter === 'fav' && favs && !favs[id(t)]) return false;
      if (activeFilter === 'admin' && likedByAdmin && !likedByAdmin(t)) return false;
      if (activeFilter === 'owner' && likedByOwner && !likedByOwner(t)) return false;
      if (nq && !searchText(t).toLowerCase().includes(nq)) return false;
      return true;
    });
    if (shuffle != null) {
      arr = seededShuffle(arr, shuffle);            // Refresh → random order
    } else if (time) {
      arr = [...arr].sort((a, b) => (sortMode === 'newest' ? time(b) - time(a) : time(a) - time(b)));
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, activeFilter, sortMode, shuffle, favs]);

  const pageCount = perPage ? Math.max(1, Math.ceil(filtered.length / perPage)) : 1;
  useEffect(() => { setPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);
  useEffect(() => { setPage(0); }, [q, activeFilter, sortMode, shuffle]);
  const shown = perPage ? filtered.slice(page * perPage, page * perPage + perPage) : filtered;

  // On a page change, jump back up to the toolbar so the next page starts at the
  // same level (then scroll down to reach the bottom pager again).
  const topRef = useRef<HTMLDivElement>(null);
  const goTop = () => { try { topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ignore */ } };
  const goPage = (p: number) => { setPage(Math.max(0, Math.min(pageCount - 1, p))); goTop(); };

  const wrap = { maxWidth, margin: '0 auto' } as const;
  const fullDash = { borderTop: '2px dashed var(--ink)', opacity: 0.5, width: '100%' } as const;
  // A pager framed by full-page-width dashed rules, top and bottom.
  const pagerBlock = perPage && pageCount > 1 ? (
    <div>
      <div style={fullDash} />
      <div style={{ ...wrap, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '10px 0' }}>
        <button className="btn small" disabled={page === 0} onClick={() => goPage(page - 1)}>← Prev</button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Page {page + 1} / {pageCount}</span>
        <button className="btn small" disabled={page >= pageCount - 1} onClick={() => goPage(page + 1)}>Next →</button>
      </div>
      <div style={fullDash} />
    </div>
  ) : null;

  return (
    <div>
      <div ref={topRef} style={{ scrollMarginTop: 8 }} />
      {/* Section header — the same style as a carousel title (emoji + title, left-
          aligned) with edit / AI-distort / refresh. No slider buttons (the pager
          handles paging). */}
      {title && (
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8, flexWrap: 'wrap' }}>
          {editingTitle ? (
            <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleDraft(title); setEditingTitle(false); } }}
              onBlur={saveTitle} style={{ fontSize: 17, fontWeight: 700, padding: '2px 6px', borderRadius: 6, border: '1.5px solid var(--ink)', maxWidth: 320 }} />
          ) : (
            <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          )}
          {canEditTitle && !editingTitle && (
            <>
              <button title="Edit the title" style={hdrIcon} onClick={() => { setTitleDraft(title); setEditingTitle(true); }}>✎</button>
              {onRemixTitle && <button title="AI tap-mixer — reword the title" style={hdrIcon} disabled={!!remixingTitle} onClick={onRemixTitle}>{remixingTitle ? '…' : '🎨'}</button>}
            </>
          )}
          {!collapsed && <button className="btn small ghost" disabled={!!refreshing} onClick={doRefresh} title="Shuffle into a fresh random order">{refreshing ? '…' : '🔄 Refresh'}</button>}
          {/* 👁 visibility toggle — clickable only where a handler is given (admin,
              home page); disabled elsewhere. Collapsed = hidden from regular users. */}
          {showCollapse && (
            <button title={onToggleCollapse ? (collapsed ? 'Hidden from other users — click to show this section' : 'Hide this section from other users') : 'Section visibility (admin only, home page)'}
              style={{ ...hdrIcon, cursor: onToggleCollapse ? 'pointer' : 'default', opacity: collapsed ? 0.4 : 1 }}
              disabled={!onToggleCollapse} onClick={onToggleCollapse}>{'👁︎'}</button>
          )}
          {collapsed && <span style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.55 }}>Hidden from other users · click 👁 to show</span>}
        </div>
      )}
      {collapsed ? null : (<>
      {/* How-to banner sits between the title and the filter toolbar, so every
          section reads: title → banner → filter → items. */}
      {banner}
      {/* Toolbar */}
      <div style={{ ...wrap, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
          style={{ fontSize: 13, flex: '1 1 120px', maxWidth: 170, minWidth: 90, padding: '5px 9px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
        {extra}
        {(favs || likedByAdmin || likedByOwner) && <button className={`btn small ${activeFilter === 'all' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('all')} title="Show everything">All</button>}
        {favs && <button className={`btn small ${activeFilter === 'fav' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('fav')} title="Only your favorites">★ My favorites</button>}
        {likedByAdmin && <button className={`btn small ${activeFilter === 'admin' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('admin')} title="Only tools an admin liked">🛡️ Liked by admin</button>}
        {likedByOwner && <button className={`btn small ${activeFilter === 'owner' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('owner')} title="Only tools the creator (OP) favorited">💛 OP favorited</button>}
        {time && <button className="btn small" onClick={cycleSort} title="Sort: newest ↔ oldest">{sortMode === 'newest' ? '↓ Newest' : '↑ Oldest'}</button>}
        <div style={{ display: 'inline-flex', border: '1.5px solid var(--ink)', borderRadius: 6, overflow: 'hidden' }}>
          <button className={`btn small ${view === 'grid' ? 'blue' : 'ghost'}`} style={{ borderRadius: 0, border: 'none' }} title="Grid" onClick={() => setViewP('grid')}>▦</button>
          <button className={`btn small ${view === 'row' ? 'blue' : 'ghost'}`} style={{ borderRadius: 0, border: 'none' }} title="Rows" onClick={() => setViewP('row')}>☰</button>
        </div>
      </div>
      <div style={{ ...wrap, fontSize: 13, opacity: 0.6, marginBottom: 10, textAlign: 'center' }}>
        {filtered.length} item{filtered.length === 1 ? '' : 's'}
        {canSaveFilter && (favs || likedByAdmin || likedByOwner) && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>· your filter is saved as this page&apos;s default</span>}
      </div>

      {/* Top pager — right after the filter toolbar */}
      {pagerBlock && <div style={{ marginBottom: 12 }}>{pagerBlock}</div>}

      {/* Items */}
      {items.length === 0 ? (
        <p style={{ textAlign: 'center', opacity: 0.7 }}>{emptyAll}</p>
      ) : shown.length === 0 ? (
        <p style={{ textAlign: 'center', opacity: 0.7 }}>{emptyFiltered}</p>
      ) : (
        <div style={view === 'grid'
          ? { ...wrap, display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinPx}px, 1fr))`, gap: 14 }
          : { ...wrap, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
          {shown.map((t) => <div key={id(t)} style={{ minWidth: 0 }}>{view === 'grid' ? renderGrid(t) : renderRow(t)}</div>)}
        </div>
      )}

      {/* Bottom pager — scrolls back up to the toolbar on Prev/Next */}
      {pagerBlock && <div style={{ marginTop: 14 }}>{pagerBlock}</div>}
      </>)}
    </div>
  );
}
