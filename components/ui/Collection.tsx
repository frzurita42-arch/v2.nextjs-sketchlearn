'use client';
/* The STANDARD list section used across the app (tool gallery, a tool's entries
 * feed, a lesson's rendition history, and future ones). It owns the whole
 * filter/assort/paginate toolbar so every section looks and behaves the same:
 *   search (by name / @user) · ★ my favorites · 🛡️ liked by admin ·
 *   grid ▦ / rows ☰ display · newest/oldest sort · a count · pagination.
 * Each caller only supplies its data accessors and how to render one item as a
 * grid card vs. a horizontal row. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface CollectionProps<T> {
  items: T[];
  id: (t: T) => string;
  searchText: (t: T) => string;            // haystack for the search box (name, @user…)
  time?: (t: T) => number;                 // ms timestamp for sorting (omit to hide sort)
  renderGrid: (t: T) => ReactNode;         // one card in grid mode
  renderRow: (t: T) => ReactNode;          // one card in rows mode
  favs?: Record<string, boolean>;          // provide to show the ★ favorites filter
  likedByAdmin?: (t: T) => boolean;        // provide to show the 🛡️ liked-by-admin filter
  perPage?: number;                        // provide to paginate
  storageKey?: string;                     // localStorage key to persist the view mode
  defaultView?: 'grid' | 'row';
  gridMinPx?: number;                      // grid card min width (default 240)
  extra?: ReactNode;                       // section-specific control (e.g. a category select)
  emptyAll?: string;                       // message when there are no items at all
  emptyFiltered?: string;                  // message when filters hide everything
  searchPlaceholder?: string;
  maxWidth?: number;
}

export function Collection<T>({
  items, id, searchText, time, renderGrid, renderRow,
  favs, likedByAdmin, perPage, storageKey, defaultView = 'grid', gridMinPx = 240,
  extra, emptyAll = 'Nothing here yet.', emptyFiltered = 'Nothing matches these filters.',
  searchPlaceholder = '🔍 name / @user', maxWidth = 900,
}: CollectionProps<T>) {
  const [q, setQ] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [view, setView] = useState<'grid' | 'row'>(defaultView);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!storageKey) return;
    try { const v = localStorage.getItem(storageKey); if (v === 'grid' || v === 'row') setView(v); } catch { /* ignore */ }
  }, [storageKey]);
  const setViewP = (v: 'grid' | 'row') => { setView(v); if (storageKey) { try { localStorage.setItem(storageKey, v); } catch { /* ignore */ } } };

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    const arr = items.filter((t) => {
      if (favOnly && favs && !favs[id(t)]) return false;
      if (adminOnly && likedByAdmin && !likedByAdmin(t)) return false;
      if (nq && !searchText(t).toLowerCase().includes(nq)) return false;
      return true;
    });
    if (time) arr.sort((a, b) => (newestFirst ? time(b) - time(a) : time(a) - time(b)));
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, favOnly, adminOnly, newestFirst, favs]);

  const pageCount = perPage ? Math.max(1, Math.ceil(filtered.length / perPage)) : 1;
  useEffect(() => { setPage((p) => Math.min(p, pageCount - 1)); }, [pageCount]);
  useEffect(() => { setPage(0); }, [q, favOnly, adminOnly, newestFirst]);
  const shown = perPage ? filtered.slice(page * perPage, page * perPage + perPage) : filtered;

  // On a page change, jump back up to the toolbar so the next page starts at the
  // same level (then scroll down to reach the bottom pager again).
  const topRef = useRef<HTMLDivElement>(null);
  const goTop = () => { try { topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ignore */ } };
  const goPage = (p: number) => { setPage(Math.max(0, Math.min(pageCount - 1, p))); goTop(); };

  const wrap = { maxWidth, margin: '0 auto' } as const;
  const pager = perPage && pageCount > 1 ? (
    <div style={{ ...wrap, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
      <button className="btn small" disabled={page === 0} onClick={() => goPage(page - 1)}>← Prev</button>
      <span style={{ fontSize: 13, opacity: 0.7 }}>Page {page + 1} / {pageCount}</span>
      <button className="btn small" disabled={page >= pageCount - 1} onClick={() => goPage(page + 1)}>Next →</button>
    </div>
  ) : null;

  return (
    <div>
      <div ref={topRef} style={{ scrollMarginTop: 8 }} />
      {/* Toolbar */}
      <div style={{ ...wrap, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
          style={{ fontSize: 13, flex: '1 1 120px', maxWidth: 170, minWidth: 90, padding: '5px 9px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
        {extra}
        {favs && <button className={`btn small ${favOnly ? 'blue' : 'ghost'}`} onClick={() => setFavOnly((v) => !v)} title="Only your favorites">★ My favorites</button>}
        {likedByAdmin && <button className={`btn small ${adminOnly ? 'blue' : 'ghost'}`} onClick={() => setAdminOnly((v) => !v)} title="Only tools an admin liked">🛡️ Liked by admin</button>}
        {time && <button className="btn small" onClick={() => setNewestFirst((v) => !v)} title="Toggle sort order">{newestFirst ? '↓ Newest' : '↑ Oldest'}</button>}
        <div style={{ display: 'inline-flex', border: '1.5px solid var(--ink)', borderRadius: 6, overflow: 'hidden' }}>
          <button className={`btn small ${view === 'grid' ? 'blue' : 'ghost'}`} style={{ borderRadius: 0, border: 'none' }} title="Grid" onClick={() => setViewP('grid')}>▦</button>
          <button className={`btn small ${view === 'row' ? 'blue' : 'ghost'}`} style={{ borderRadius: 0, border: 'none' }} title="Rows" onClick={() => setViewP('row')}>☰</button>
        </div>
      </div>
      <div style={{ ...wrap, fontSize: 13, opacity: 0.6, marginBottom: 10, textAlign: 'center' }}>{filtered.length} item{filtered.length === 1 ? '' : 's'}</div>

      {/* Top pager — right after the filter toolbar */}
      {pager && <div style={{ marginBottom: 12 }}>{pager}</div>}

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
      {pager && <div style={{ marginTop: 14 }}>{pager}</div>}
    </div>
  );
}
