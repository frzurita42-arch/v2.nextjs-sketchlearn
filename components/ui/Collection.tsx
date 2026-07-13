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
  title?: string;                          // a heading shown at the top of the filter (e.g. "Gallery", "History")
}

// "Algorithm" order: split the list into three thirds and round-robin one from
// each (first, middle, last, repeat) so the deck is evenly interleaved.
function interleaveThirds<T>(arr: T[]): T[] {
  const n = arr.length;
  if (n < 3) return arr;
  const t = Math.ceil(n / 3);
  const a = arr.slice(0, t), b = arr.slice(t, 2 * t), c = arr.slice(2 * t);
  const out: T[] = [];
  const max = Math.max(a.length, b.length, c.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
    if (i < c.length) out.push(c[i]);
  }
  return out;
}

export function Collection<T>({
  items, id, searchText, time, renderGrid, renderRow,
  favs, likedByAdmin, likedByOwner, perPage, storageKey, sortPrefKey,
  defaultFilter = 'all', canSaveFilter, onSaveFilter, defaultView = 'grid', gridMinPx = 240,
  extra, emptyAll = 'Nothing here yet.', emptyFiltered = 'Nothing matches these filters.',
  searchPlaceholder = '🔍 name / @user', maxWidth = 900, title,
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
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'algorithm'>('algorithm');   // default
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
      if (!cancelled && (v === 'newest' || v === 'oldest' || v === 'algorithm')) setSortMode(v);
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [sortPrefKey]);
  const cycleSort = () => {
    const order = ['newest', 'oldest', 'algorithm'] as const;
    const next = order[(order.indexOf(sortMode) + 1) % order.length];
    setSortMode(next);
    if (sortPrefKey) API.put('/api/prefs', { key: `sort:${sortPrefKey}`, value: next }).catch(() => { /* ignore */ });
  };

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
    if (sortMode === 'algorithm') {
      if (time) arr = [...arr].sort((a, b) => time(b) - time(a));   // base: newest-first
      arr = interleaveThirds(arr);
    } else if (time) {
      arr = [...arr].sort((a, b) => (sortMode === 'newest' ? time(b) - time(a) : time(a) - time(b)));
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, activeFilter, sortMode, favs]);

  const pageCount = perPage ? Math.max(1, Math.ceil(filtered.length / perPage)) : 1;
  useEffect(() => { setPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);
  useEffect(() => { setPage(0); }, [q, activeFilter, sortMode]);
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
      {/* Section name, sitting on top of the filter toolbar. */}
      {title && <div style={{ ...wrap, textAlign: 'center', marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.65 }}>{title}</span></div>}
      {/* Toolbar */}
      <div style={{ ...wrap, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
          style={{ fontSize: 13, flex: '1 1 120px', maxWidth: 170, minWidth: 90, padding: '5px 9px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
        {extra}
        {(favs || likedByAdmin || likedByOwner) && <button className={`btn small ${activeFilter === 'all' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('all')} title="Show everything">All</button>}
        {favs && <button className={`btn small ${activeFilter === 'fav' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('fav')} title="Only your favorites">★ My favorites</button>}
        {likedByAdmin && <button className={`btn small ${activeFilter === 'admin' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('admin')} title="Only tools an admin liked">🛡️ Liked by admin</button>}
        {likedByOwner && <button className={`btn small ${activeFilter === 'owner' ? 'blue' : 'ghost'}`} onClick={() => pickFilter('owner')} title="Only tools the creator (OP) favorited">💛 OP favorited</button>}
        {time && <button className="btn small" onClick={cycleSort} title="Sort: newest → oldest → algorithm (interleaved thirds)">{sortMode === 'newest' ? '↓ Newest' : sortMode === 'oldest' ? '↑ Oldest' : '🔀 Algorithm'}</button>}
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
    </div>
  );
}
