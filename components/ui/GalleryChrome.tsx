'use client';
/* Generic, reusable gallery chrome: a filter row (search + All/Favorites chips +
 * an optional right slot for the view menu) and a bottom pager. Used on the
 * Sandbox / Empty preview pages so they carry the same frame as real galleries. */
import { useState } from 'react';

export function GalleryFilterRow({ right }: { right?: React.ReactNode }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'fav'>('all');
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      {/* The shared "card-like" input used across the site — global wobbly-bordered
          field (2.5px ink border, hand font, --wobble-2 radius). No flat override. */}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search by name, interest or keyword…"
        style={{ flex: '1 1 220px', minWidth: 0 }} />
      <button className={`btn small ${filter === 'all' ? 'green' : 'ghost'}`} onClick={() => setFilter('all')}>All</button>
      <button className={`btn small ${filter === 'fav' ? 'green' : 'ghost'}`} onClick={() => setFilter('fav')}>★ Favorites</button>
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
