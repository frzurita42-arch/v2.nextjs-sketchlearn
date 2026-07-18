'use client';
/* LayoutEditor — the owner/admin editor for a slide tool's PER-SLIDE layout (the
 * "proposed slide types") and its overall generation prompt. It loads the tool's
 * existing layout from the DB (lesson.pages + lesson.style), lets you edit each
 * slide's activity types + support components + paragraphs, add/remove slides, and
 * saves the whole thing back to the tool definition via /api/tools/settings. The
 * slide generator reads lesson.pages[n] and lesson.style, so these edits directly
 * steer what the AI makes on every future run. */
import { useMemo, useState } from 'react';
import { API } from '@/lib/api';

type Support = { images?: boolean; audio?: boolean; code?: boolean; tables?: boolean; formulas?: boolean };
type Page = {
  activityTypes: string[];
  support: Support;
  paragraphsPerSlide: number;
  paragraphLength: 'brief' | 'medium' | 'detailed';
  style: string;   // per-slide instructions ("this slide should…")
};

const ACTIVITIES: { id: string; label: string }[] = [
  { id: 'mcq', label: 'Multiple choice' },
  { id: 'fill-blank', label: 'Fill the blank' },
  { id: 'input', label: 'Typed answer' },
  { id: 'writing', label: 'Writing / worked answer' },
  { id: 'annotation', label: 'Annotation pad' },
  { id: 'code', label: 'Code box' },
];
const SUPPORTS: { id: keyof Support; label: string }[] = [
  { id: 'images', label: '🖼 Image' },
  { id: 'tables', label: '▦ Table' },
  { id: 'formulas', label: '∑ Formula' },
  { id: 'code', label: '{ } Code' },
  { id: 'audio', label: '🔊 Audio' },
];
const LENGTHS: Page['paragraphLength'][] = ['brief', 'medium', 'detailed'];

const cleanSup = (s: any): Support => ({ images: s?.images !== false, audio: !!s?.audio, code: !!s?.code, tables: !!s?.tables, formulas: !!s?.formulas });
const newPage = (base?: any): Page => ({
  activityTypes: Array.isArray(base?.activityTypes) && base.activityTypes.length ? base.activityTypes.slice() : ['mcq'],
  support: cleanSup(base?.support || { images: true }),
  paragraphsPerSlide: Math.max(1, Math.min(4, parseInt(base?.paragraphsPerSlide, 10) || 1)),
  paragraphLength: LENGTHS.includes(base?.paragraphLength) ? base.paragraphLength : 'medium',
  style: String(base?.style || ''),
});

export function LayoutEditor({ slug, def, onClose, onSaved }: {
  slug: string; def: any; onClose: () => void; onSaved: (nextDef: any) => void;
}) {
  const lesson = def?.lesson || {};
  // Load the existing layout. If the tool has no per-slide pages yet (e.g. built
  // from the coach chat), synthesise one page PER slide from the lesson-wide
  // activity/support settings so the editor shows the tool's real layout, never empty.
  const initialPages = useMemo<Page[]>(() => {
    if (Array.isArray(lesson.pages) && lesson.pages.length) return lesson.pages.map((p: any) => newPage(p));
    const count = Math.max(1, Math.min(30, parseInt(lesson.totalSlides, 10) || 5));
    const base = { activityTypes: lesson.activityTypes, support: lesson.support, paragraphsPerSlide: lesson.paragraphsPerSlide, paragraphLength: lesson.paragraphLength };
    return Array.from({ length: count }, () => newPage(base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pages, setPages] = useState<Page[]>(initialPages);
  const [style, setStyle] = useState<string>(String(lesson.style || ''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const setPage = (i: number, patch: Partial<Page>) => setPages((ps) => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const toggleAct = (i: number, id: string) => setPage(i, { activityTypes: pages[i].activityTypes.includes(id) ? pages[i].activityTypes.filter((x) => x !== id) : [...pages[i].activityTypes, id] });
  const toggleSup = (i: number, id: keyof Support) => setPage(i, { support: { ...pages[i].support, [id]: !pages[i].support[id] } });
  const addSlide = () => setPages((ps) => [...ps, newPage(ps[ps.length - 1])]);
  const removeSlide = (i: number) => setPages((ps) => ps.length > 1 ? ps.filter((_, j) => j !== i) : ps);
  const moveSlide = (i: number, dir: -1 | 1) => setPages((ps) => {
    const j = i + dir; if (j < 0 || j >= ps.length) return ps;
    const n = ps.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const save = async () => {
    setBusy(true); setMsg('Saving…');
    // Persist every slide's layout + the whole prompt into the tool definition.
    const cleanPages = pages.map((p) => ({
      activityTypes: p.activityTypes.length ? p.activityTypes : ['mcq'],
      support: p.support,
      paragraphsPerSlide: p.paragraphsPerSlide,
      paragraphLength: p.paragraphLength,
      style: p.style.trim() || undefined,
    }));
    const nextDef = { ...def, lesson: { ...lesson, style: style.trim(), pages: cleanPages, totalSlides: cleanPages.length } };
    try {
      const r: any = await API.put('/api/tools/settings', { slug, definition: nextDef });
      if (r?.error) { setMsg(r.error); setBusy(false); return; }
      setMsg('Saved ✓ — the generator will use this layout.');
      onSaved(r?.tool?.definition || nextDef);
      setTimeout(() => onClose(), 700);
    } catch (e: any) { setMsg(e?.message || 'Could not save.'); setBusy(false); }
  };

  const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 11.5, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
    border: '1.5px solid var(--ink)', background: on ? 'var(--yellow,#fdf0a6)' : 'transparent', fontWeight: on ? 700 : 400,
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto', padding: '3vh 12px' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 720, padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <b style={{ fontSize: 16 }}>✏️ Edit layout &amp; activities</b>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 10px' }}>
          Each row is one slide of the presentation. Pick the activity types and support components the AI must put on that slide. The generator follows this layout for every run, at random across the slides, and double-checks each slide against it.
        </p>

        {/* Overall generation prompt — the WHOLE guidance, saved to the DB. */}
        <label className="field" style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>📎 Overall prompt / guidance (used on every slide)</span>
          <textarea value={style} onChange={(e) => setStyle(e.target.value)} disabled={busy}
            placeholder="The full generation prompt: the course/unit outline, the teaching approach, the kinds of activities and visuals to use, tone, constraints… Saved in full and fed into every slide."
            style={{ width: '100%', minHeight: 110, fontSize: 13, marginTop: 4 }} maxLength={6000} />
          <span style={{ fontSize: 10, opacity: 0.5 }}>{style.trim().length}/6000 — the whole prompt is saved.</span>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pages.map((p, i) => (
            <div key={i} style={{ border: '1.5px solid var(--ink)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <b style={{ fontSize: 13 }}>Slide {i + 1}</b>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  <button className="btn small ghost" title="Move up" disabled={i === 0} onClick={() => moveSlide(i, -1)} style={{ padding: '0 8px' }}>↑</button>
                  <button className="btn small ghost" title="Move down" disabled={i === pages.length - 1} onClick={() => moveSlide(i, 1)} style={{ padding: '0 8px' }}>↓</button>
                  <button className="btn small ghost" title="Remove slide" disabled={pages.length <= 1} onClick={() => removeSlide(i)} style={{ padding: '0 8px' }}>🗑</button>
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, margin: '2px 0' }}>Activities</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                {ACTIVITIES.map((a) => <span key={a.id} onClick={() => toggleAct(i, a.id)} style={chip(p.activityTypes.includes(a.id))}>{a.label}</span>)}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, margin: '2px 0' }}>Support / visuals</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                {SUPPORTS.map((s) => <span key={s.id} onClick={() => toggleSup(i, s.id)} style={chip(!!p.support[s.id])}>{s.label}</span>)}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 12 }}>Paragraphs
                  <select value={p.paragraphsPerSlide} onChange={(e) => setPage(i, { paragraphsPerSlide: parseInt(e.target.value, 10) })} style={{ marginLeft: 4 }}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>Length
                  <select value={p.paragraphLength} onChange={(e) => setPage(i, { paragraphLength: e.target.value as Page['paragraphLength'] })} style={{ marginLeft: 4 }}>
                    {LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              </div>
              <input value={p.style} onChange={(e) => setPage(i, { style: e.target.value })} placeholder="Optional: what THIS slide should teach/show (extra instruction for the AI)"
                style={{ width: '100%', fontSize: 12, marginTop: 6, padding: '5px 8px', borderRadius: 8, border: '1.5px solid var(--ink)' }} maxLength={2000} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn small ghost" onClick={addSlide}>＋ Add slide</button>
          <span style={{ flex: 1 }} />
          {msg && <span style={{ fontSize: 12, opacity: 0.75 }}>{msg}</span>}
          <button className="btn small ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn small green" disabled={busy} onClick={save}>{busy ? 'Saving…' : '💾 Save layout'}</button>
        </div>
      </div>
    </div>
  );
}
