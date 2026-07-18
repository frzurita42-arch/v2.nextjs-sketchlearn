'use client';
/* A sticky note (shown next to the WhatsApp coupon note) that highlights the
 * token packages you can buy, as an editable bullet list. An admin can edit the
 * packages (tokens + price + note) in a popup; the list is stored in
 * site_settings (key tokenPackages) so it persists and everyone sees it. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { estimateLessonTokens } from '@/lib/cost-estimate';

type Pkg = { tokens: number; usd: number; note: string };

// The reference "lesson" used to price packages: a 5-slide presentation. Each
// slide ≈ a teaching passage + question, one AI image, and a support visual
// (table/diagram); read-aloud audio is generated on demand (and cached), so it's
// not part of this base estimate.
const LESSON_SLIDES = 5;
const perLesson = Math.max(1, estimateLessonTokens({ slides: LESSON_SLIDES }));
const perSlide = Math.max(1, perLesson / LESSON_SLIDES);
const lessonsFor = (tokens: number) => Math.max(1, Math.round((Number(tokens) || 0) / perLesson));
const slidesFor = (tokens: number) => Math.max(1, Math.round((Number(tokens) || 0) / perSlide));   // 1 AI image per slide
const DEFAULT_PACKAGES: Pkg[] = [
  { tokens: 5000, usd: 5, note: `≈ ${lessonsFor(5000)} slide lessons` },
  { tokens: 10000, usd: 9, note: `≈ ${lessonsFor(10000)} slide lessons` },
  { tokens: 20000, usd: 16, note: `≈ ${lessonsFor(20000)} slide lessons` },
  { tokens: 50000, usd: 35, note: `≈ ${lessonsFor(50000)} slide lessons` },
];
const fmt = (n: number) => (Number(n) || 0).toLocaleString();

export function TokenPackagesNote() {
  const isAdmin = API.user?.role === 'admin';
  const [pkgs, setPkgs] = useState<Pkg[]>(DEFAULT_PACKAGES);
  const [edit, setEdit] = useState<Pkg[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    API.get('/api/site-settings').then((r: any) => {
      const raw = r?.settings?.tokenPackages;
      if (!raw) return;
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(p) && p.length) setPkgs(p.map((x: any) => ({ tokens: Math.max(0, Math.trunc(Number(x.tokens) || 0)), usd: Math.max(0, Number(x.usd) || 0), note: String(x.note || '').slice(0, 60) })));
      } catch { /* keep defaults */ }
    }).catch(() => { /* keep defaults */ });
  }, []);

  const save = async (next: Pkg[]) => {
    setBusy(true);
    setPkgs(next);
    try { await API.put('/api/site-settings', { key: 'tokenPackages', value: JSON.stringify(next) }); } catch { /* optimistic */ }
    setBusy(false); setEdit(null);
  };

  return (
    <div className="slide-comp comp-sticky sticky-yellow" style={{ transform: 'rotate(1deg)', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <b className="sticky-title" style={{ display: 'block' }}>🎟 Token packages</b>
        {isAdmin && <button title="Edit packages" onClick={() => setEdit(pkgs.map((p) => ({ ...p })))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✎</button>}
      </div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
        {pkgs.map((p, i) => (
          <li key={i}>
            <b>{fmt(p.tokens)} tokens</b> — ${Number(p.usd).toFixed(2)}{p.note ? <span style={{ opacity: 0.75 }}> · {p.note}</span> : null}
            <div style={{ fontSize: 11, opacity: 0.7 }}>≈ {fmt(lessonsFor(p.tokens))} presentations · {fmt(slidesFor(p.tokens))} slides · {fmt(slidesFor(p.tokens))} images</div>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 11, opacity: 0.7, margin: '6px 0 0' }}>
        A <b>slide lesson</b> ≈ a {LESSON_SLIDES}-slide presentation: about {LESSON_SLIDES} AI images, {LESSON_SLIDES} teaching passages with questions, and a few tables/diagrams. Read-aloud audio is generated on demand. Request a package by coupon on WhatsApp (see the note beside this one).
      </p>

      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b>Edit token packages</b><button className="btn small ghost" onClick={() => setEdit(null)}>✕</button></div>
            {edit.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <input type="number" min={0} value={p.tokens} onChange={(e) => setEdit((es) => es!.map((x, j) => j === i ? { ...x, tokens: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } : x))} style={{ width: 100 }} title="tokens" />
                <span style={{ opacity: 0.6 }}>tokens · $</span>
                <input type="number" min={0} step="0.01" value={p.usd} onChange={(e) => setEdit((es) => es!.map((x, j) => j === i ? { ...x, usd: Math.max(0, Number(e.target.value) || 0) } : x))} style={{ width: 80 }} title="price USD" />
                <input type="text" value={p.note} placeholder="note (e.g. ≈ 3 lessons)" onChange={(e) => setEdit((es) => es!.map((x, j) => j === i ? { ...x, note: e.target.value.slice(0, 60) } : x))} style={{ flex: '1 1 140px', minWidth: 120 }} />
                <button className="btn small ghost" title="Remove" onClick={() => setEdit((es) => es!.filter((_, j) => j !== i))}>🗑</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn small ghost" onClick={() => setEdit((es) => [...es!, { tokens: 1000, usd: 1, note: '' }])}>＋ Add package</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn small ghost" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn small green" disabled={busy} onClick={() => save(edit)}>{busy ? '…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
