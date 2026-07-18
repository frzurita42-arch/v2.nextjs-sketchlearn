'use client';
/* Generic, reusable gallery chrome: a filter row (search + optional All/Favorites
 * chips + an optional right slot for extra controls / the view menu) and a bottom
 * pager. Used on the Sandbox / Empty preview pages AND the real list pages so they
 * all carry the same one-row filter frame.
 *
 * Search + chips can be UNCONTROLLED (internal state — the preview pages) or
 * CONTROLLED via q/onQ + filter/onFilter (a page that does its own filtering). */
import { useState } from 'react';

export function GalleryFilterRow({
  q: qProp, onQ, placeholder = '🔍 Search by name, interest or keyword…',
  showChips = true, filter: filterProp, onFilter, right,
}: {
  q?: string; onQ?: (v: string) => void; placeholder?: string;
  showChips?: boolean; filter?: 'all' | 'fav'; onFilter?: (f: 'all' | 'fav') => void;
  right?: React.ReactNode;
}) {
  const [qState, setQState] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'fav'>('all');
  const q = qProp !== undefined ? qProp : qState;
  const setQ = onQ || setQState;
  const filter = filterProp !== undefined ? filterProp : filterState;
  const setFilter = onFilter || setFilterState;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      {/* The shared "card-like" paper input (global input[type=text] styling). */}
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        style={{ flex: '1 1 220px', minWidth: 0 }} />
      {showChips && (
        <>
          <button className={`btn small ${filter === 'all' ? 'green' : 'ghost'}`} onClick={() => setFilter('all')}>All</button>
          <button className={`btn small ${filter === 'fav' ? 'green' : 'ghost'}`} onClick={() => setFilter('fav')}>★ Favorites</button>
        </>
      )}
      {right}
    </div>
  );
}

export function GalleryPager({ page = 1, pages = 1, onPrev, onNext }: { page?: number; pages?: number; onPrev?: () => void; onNext?: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
      <button className="btn small ghost" disabled={page <= 1} onClick={onPrev}>‹ Prev</button>
      <span style={{ fontSize: 13 }}>Page {page} of {pages}</span>
      <button className="btn small ghost" disabled={page >= pages} onClick={onNext}>Next ›</button>
    </div>
  );
}
