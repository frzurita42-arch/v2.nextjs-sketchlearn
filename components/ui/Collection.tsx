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
import { SectionHeader } from '@/components/ui/SectionHeader';
import { OutlineBox } from '@/components/ui/OutlineBox';
import { filterLabel } from '@/components/ui/GalleryChrome';
import { filterSelect } from '@/components/ui/CardViewMenu';
import { galleryLayout, CARD_SIZE_LABELS, CARD_IMG_LABELS } from '@/lib/card-size';

// The mutually-exclusive status filter: everything, only-my-favorites,
// only-liked-by-admin, or only-favorited-by-the-owner (OP).
export type FilterKey = 'all' | 'fav' | 'admin' | 'owner';

// Handed to renderGrid/renderRow so a card can read or switch the section's view
// (e.g. a repo card that toggles to rows on click). Ignored by callers that don't
// need it — the argument is optional.
export interface CollectionViewApi {
  view: 'grid' | 'row';
  setView: (v: 'grid' | 'row') => void;    // no-op while the display is locked
  locked: boolean;
  imgSize?: number;    // card IMAGE size (0=No image … 5=Cover) when a size menu is shown
}

export interface CollectionProps<T> {
  items: T[];
  id: (t: T) => string;
  searchText: (t: T) => string;            // haystack for the search box (name, @user…)
  time?: (t: T) => number;                 // ms timestamp for sorting (omit to hide sort)
  renderGrid: (t: T, view?: CollectionViewApi) => ReactNode;  // one card in grid mode
  renderRow: (t: T, view?: CollectionViewApi) => ReactNode;   // one card in rows mode
  favs?: Record<string, boolean>;          // provide to show the ★ favorites filter
  likedByAdmin?: (t: T) => boolean;        // provide to show the 🛡️ liked-by-admin filter
  likedByOwner?: (t: T) => boolean;        // provide to show the 💛 OP filter
  ownerLabel?: string;                     // override the 💛 OP button label
  ownerTitle?: string;                     // override the 💛 OP button tooltip
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
  // A 🔒 lock beside the grid/rows toggle. `viewLocked` disables switching (viewers
  // are stuck on the current view); only where `canLockView` is set (owner/admin)
  // is the lock clickable, and toggling it calls `onViewLockChange(locked, view)`.
  viewLocked?: boolean;
  canLockView?: boolean;
  onViewLockChange?: (locked: boolean, view: 'grid' | 'row') => void;
  gridMinPx?: number;                      // grid card min width (default 240)
  // A "bare" gallery-style filter row: NO dashed OutlineBox and NO "FILTERS &
  // DISPLAY" caption — just the plain "Filters" row used by the top-level Repos /
  // Slides galleries. Pairs with hideCount + sizePageKey to make a section match
  // the gallery look exactly.
  bareFilter?: boolean;
  hideCount?: boolean;                     // hide the "N items" line under the filter
  // When set, the section shows the gallery's LAYOUT + IMAGE size dropdowns
  // (List…Full / No image…Cover), persisted under this key, DEFAULTING to
  // List + Small. They drive the card layout and the image size (handed to the
  // card via viewApi.imgSize) and REPLACE the plain ▦/☰ toggle.
  sizePageKey?: string;
  extra?: ReactNode;                       // section-specific control (e.g. a category select)
  belowToolbar?: ReactNode;                // content on its own row directly BELOW the filter toolbar
  showRefresh?: boolean;                   // show the header 🔄 shuffle button (default true)
  bottomRule?: boolean;                    // draw a dashed rule BELOW the bottom pager (closes the section)
  emptyAll?: string;                       // message when there are no items at all
  emptyFiltered?: string;                  // message when filters hide everything
  emptyState?: ReactNode;                  // rich empty-state (e.g. a get-started CTA + example card); replaces the plain empty text when the gallery shows nothing
  loading?: boolean;                       // items still loading — show skeleton cards in the item area (title + banner + toolbar stay visible)
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
  favs, likedByAdmin, likedByOwner, ownerLabel = '💛 Moderators', ownerTitle = 'Only tools moderators favorited', perPage, storageKey, sortPrefKey,
  defaultFilter = 'all', canSaveFilter, onSaveFilter, defaultView = 'grid',
  viewLocked, canLockView, onViewLockChange, gridMinPx = 240,
  bareFilter, hideCount, sizePageKey,
  extra, belowToolbar, showRefresh = true, bottomRule, loading = false, emptyAll = 'Nothing here yet.', emptyFiltered = 'Nothing matches these filters.', emptyState,
  searchPlaceholder = '🔍 name / @user', maxWidth = 900, title,
  canEditTitle, onRenameTitle, onRemixTitle, remixingTitle, onRefresh, refreshing,
  banner, showCollapse, collapsed, onToggleCollapse,
}: CollectionProps<T>) {
  const [q, setQ] = useState('');
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
  const [locked, setLocked] = useState(!!viewLocked);
  useEffect(() => { setLocked(!!viewLocked); }, [viewLocked]);
  // Only a SERVER-confirmed lock snaps everyone onto the saved view. (Keying this
  // on the local `locked` used a stale defaultView, so locking on grid flipped the
  // display back to the old default even though grid is what got saved.)
  useEffect(() => { if (viewLocked) setView(defaultView); }, [viewLocked, defaultView]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (locked || !storageKey) return;
    try { const v = localStorage.getItem(storageKey); if (v === 'grid' || v === 'row') setView(v); } catch { /* ignore */ }
  }, [storageKey, locked]);
  const setViewP = (v: 'grid' | 'row') => { if (locked) return; setView(v); if (storageKey) { try { localStorage.setItem(storageKey, v); } catch { /* ignore */ } } };
  const toggleLock = () => { const next = !locked; setLocked(next); onViewLockChange?.(next, view); };

  // ── Layout + image size (only when sizePageKey is given) ──
  // Persisted per section under sizePageKey; DEFAULTS to List layout + Small image
  // so the section reads like the top-level gallery on first load.
  const sized = !!sizePageKey;
  const [layoutSize, setLayoutSize] = useState(0);   // 0 = List
  const [imgSizeV, setImgSizeV] = useState(1);       // 1 = Small
  useEffect(() => {
    if (!sizePageKey) return;
    try {
      const l = localStorage.getItem(`${sizePageKey}:layout`);
      const im = localStorage.getItem(`${sizePageKey}:img`);
      if (l !== null) setLayoutSize(Math.max(0, Math.min(5, parseInt(l, 10) || 0)));
      if (im !== null) setImgSizeV(Math.max(0, Math.min(5, parseInt(im, 10) || 0)));
    } catch { /* ignore */ }
  }, [sizePageKey]);
  const setLayoutSizeP = (v: number) => { setLayoutSize(v); if (sizePageKey) { try { localStorage.setItem(`${sizePageKey}:layout`, String(v)); } catch { /* ignore */ } } };
  const setImgSizeP = (v: number) => { setImgSizeV(v); if (sizePageKey) { try { localStorage.setItem(`${sizePageKey}:img`, String(v)); } catch { /* ignore */ } } };
  // When sized, the layout dropdown decides grid vs. rows (List → rows); otherwise
  // the plain ▦/☰ toggle governs it.
  const effView: 'grid' | 'row' = sized ? galleryLayout(layoutSize).view : view;
  const viewApi: CollectionViewApi = { view: effView, setView: setViewP, locked, imgSize: sized ? imgSizeV : undefined };

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
  // Dashed separator marking the END of one of the gallery's three containers
  // (header+banner · filters+display · cards). Constrained to the content width so
  // it lines up with the rows above/below it.
  const sectionRule = { ...wrap, borderTop: '2px dashed var(--ink)', opacity: 0.4, margin: '14px auto' } as const;
  // The pager (buttons + count). Like the Settings gallery, it only appears when
  // there's MORE THAN ONE page — a single/empty gallery shows no pager. And it's a
  // BOTTOM pager only (no top pager framing the empty state).
  const showPager = !!perPage && pageCount > 1;
  const pagerRow = showPager ? (
    <div style={{ ...wrap, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <button className="btn small" disabled={page === 0} onClick={() => goPage(page - 1)}>← Prev</button>
      <span style={{ fontSize: 13, opacity: 0.7 }}>Page {page + 1} / {pageCount}</span>
      <button className="btn small" disabled={page >= pageCount - 1} onClick={() => goPage(page + 1)}>Next →</button>
    </div>
  ) : null;
  const pagerBottom = pagerRow ? (<div><div style={fullDash} />{pagerRow}{bottomRule && <div style={fullDash} />}</div>) : null;

  return (
    <div>
      <div ref={topRef} style={{ scrollMarginTop: 8 }} />
      {/* ═══ Container 1: section header + how-to banner ═══
          The title row (✎ · 🎨 · 🔄 · 👁) and the how-to banner form one unit,
          closed off by a dashed rule below. */}
      <section aria-label="Section header and banner">
        {title && (
          <SectionHeader title={title} maxWidth={maxWidth}
            canEditTitle={canEditTitle} onRenameTitle={onRenameTitle} onRemixTitle={onRemixTitle} remixingTitle={remixingTitle}
            onRefresh={showRefresh ? doRefresh : undefined} refreshing={refreshing} refreshTitle="Shuffle into a fresh random order"
            showCollapse={showCollapse} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
        )}
        {!collapsed && banner}
      </section>
      {collapsed ? null : (<>
      {/* Closing dashed rule — end of the header + banner container. */}
      {(title || banner) && <div style={sectionRule} />}
      {/* ═══ Container 2: filters & display ═══ */}
      <section aria-label="Filters and display controls">
      {/* Toolbar — grouped in the labelled dashed OutlineBox (same look as the
          repo OWNER CONTROLS): search + status filters + sort + display toggle. */}
      {(() => {
        const controls = (<>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
            style={{ flex: '0 1 150px', maxWidth: 150, minWidth: 100 }} />
          {/* In the bare (gallery) look the `extra` control (the ⚙️ gear) moves to
              the far right end of the row; otherwise it sits next to the search. */}
          {!bareFilter && extra}
          {(favs || likedByAdmin || likedByOwner) && <button className={`btn small ${activeFilter === 'all' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('all')} title="Show everything">All</button>}
          {favs && <button className={`btn small ${activeFilter === 'fav' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('fav')} title="Only your favorites">★ Favorites</button>}
          {likedByAdmin && <button className={`btn small ${activeFilter === 'admin' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('admin')} title="Only tools an admin liked">🛡️ Admin</button>}
          {likedByOwner && <button className={`btn small ${activeFilter === 'owner' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('owner')} title={ownerTitle}>{ownerLabel}</button>}
          {time && <button className="btn small" onClick={cycleSort} title="Sort: newest ↔ oldest">{sortMode === 'newest' ? '↓ Newest' : '↑ Oldest'}</button>}
          {sized ? (
            /* Layout + image size dropdowns (List…Full / No image…Cover) — the same
               View menu the top-level gallery uses; they replace the ▦/☰ toggle. */
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flex: '0 0 auto' }}>
              <select title="View — card layout & size" aria-label="Card layout" value={layoutSize} onChange={(e) => setLayoutSizeP(parseInt(e.target.value, 10))} style={filterSelect}>
                {CARD_SIZE_LABELS.map((l, i) => <option key={l} value={i}>▦ {l}</option>)}
              </select>
              <select title="Image — how the picture is shown" aria-label="Card image" value={imgSizeV} onChange={(e) => setImgSizeP(parseInt(e.target.value, 10))} style={filterSelect}>
                {CARD_IMG_LABELS.map((l, i) => <option key={l} value={i}>🖼 {l}</option>)}
              </select>
            </span>
          ) : (<>
            {/* Grid / rows toggle — both available. When the display is locked the
                toggle is disabled (viewers stay on the owner's chosen view). */}
            <div style={{ display: 'inline-flex', border: '1.5px solid var(--ink)', borderRadius: 6, overflow: 'hidden' }}>
              <button className={`btn small ${view === 'grid' ? 'blue' : 'ghost'}`} style={{ borderRadius: 0, border: 'none' }} disabled={locked} title={locked ? 'Display locked' : 'Grid'} onClick={() => setViewP('grid')}>▦</button>
              <button className={`btn small ${view === 'row' ? 'blue' : 'ghost'}`} style={{ borderRadius: 0, border: 'none' }} disabled={locked} title={locked ? 'Display locked' : 'Rows'} onClick={() => setViewP('row')}>☰</button>
            </div>
            {/* 🔒 lock — enable/disable switching the display. Owner/admin only. */}
            {(canLockView || locked) && (
              <button disabled={!canLockView}
                title={locked ? (canLockView ? 'Display locked — click to let viewers switch' : 'The display was locked by the owner') : 'Lock the display so viewers can’t switch (owner/admin)'}
                onClick={toggleLock}
                style={{ background: 'none', border: 'none', cursor: canLockView ? 'pointer' : 'default', padding: '0 2px', fontSize: 15, lineHeight: 1, opacity: canLockView ? 1 : 0.55 }}>{locked ? '🔒' : '🔓'}</button>
            )}
          </>)}
          {/* Bare look only: the gear pinned to the far right end of the row. */}
          {bareFilter && extra && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center' }}>{extra}</span>}
        </>);
        // Bare (gallery) look: plain "Filters" caption + row, no dashed OutlineBox.
        return bareFilter ? (
          <div style={{ ...wrap, marginBottom: 8 }}>
            <span style={filterLabel}>Filters</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{controls}</div>
          </div>
        ) : (
          <OutlineBox title="FILTERS &amp; DISPLAY" maxWidth={maxWidth} style={{ marginBottom: 8 }}>{controls}</OutlineBox>
        );
      })()}
      {/* An optional row directly below the filter toolbar (e.g. Build a tool +
          category chips), before the item count. */}
      {belowToolbar && <div style={{ ...wrap, marginBottom: 8 }}>{belowToolbar}</div>}
      {!hideCount && (
      <div style={{ ...wrap, fontSize: 13, opacity: 0.6, marginBottom: 10, textAlign: 'center' }}>
        {filtered.length} item{filtered.length === 1 ? '' : 's'}
        {canSaveFilter && (favs || likedByAdmin || likedByOwner) && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>· your filter is saved as this page&apos;s default</span>}
      </div>
      )}
      </section>
      {/* Closing dashed rule — end of the filters container, right before the
          cards. When a pager is configured it already frames itself in dashes and
          serves as the divider instead. */}
      <div style={sectionRule} />

      {/* ═══ Container 3: the cards / nested items ═══ */}
      <section aria-label="Cards">
      {loading && items.length === 0 ? (
        // Skeleton cards while the data loads — the title, banner and toolbar above
        // are already on screen, so only this area shows a loading shimmer.
        <div style={sized
          ? { ...wrap, ...galleryLayout(layoutSize).container, alignItems: 'start' }
          : effView === 'grid'
          ? { ...wrap, display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinPx}px, 1fr))`, gap: 14, alignItems: 'start' }
          : { ...wrap, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
          {Array.from({ length: effView === 'grid' ? 6 : 3 }).map((_, i) => (
            // Each loading card shows the "writing pencil" animation (the same one
            // the slide generator uses) so it's clear the card's content is on its way.
            <div key={i} className="card sl-skeleton" aria-hidden style={{ height: effView === 'grid' ? 300 : 74, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="sl-pencil" style={{ fontSize: effView === 'grid' ? 34 : 22, opacity: 0.8, position: 'relative', zIndex: 1 }}>
                <span className="sl-pencil__line" />
                <span className="sl-pencil__tip">✏️</span>
              </span>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        emptyState ?? <p style={{ textAlign: 'center', opacity: 0.7 }}>{emptyAll}</p>
      ) : shown.length === 0 ? (
        emptyState ?? <p style={{ textAlign: 'center', opacity: 0.7 }}>{emptyFiltered}</p>
      ) : (
        <div style={sized
          ? { ...wrap, ...galleryLayout(layoutSize).container, alignItems: 'start' }
          // alignItems:start keeps each card at its own content height — without it
          // CSS grid stretches every card in a row to the tallest one, so a few
          // cards look "longer" than a full grid of them.
          : effView === 'grid'
          ? { ...wrap, display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinPx}px, 1fr))`, gap: 14, alignItems: 'start' }
          : { ...wrap, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
          {shown.map((t) => <div key={id(t)} style={{ minWidth: 0 }}>{effView === 'grid' ? renderGrid(t, viewApi) : renderRow(t, viewApi)}</div>)}
        </div>
      )}

      {/* Bottom pager — scrolls back up to the toolbar on Prev/Next */}
      {pagerBottom && <div style={{ marginTop: 14 }}>{pagerBottom}</div>}
      </section>
      </>)}
    </div>
  );
}
