'use client';
/* The shared "Customise per page" popup: pick pages, then set their card layout,
 * card image, and header size independently of the global defaults. Used from the
 * Settings page and from each page's header bar. */
import { useState } from 'react';
import {
  CARD_SIZE_LABELS, CARD_IMG_LABELS, CARD_PAGES,
  loadGlobalCardSize, loadGlobalImgSize, hasPageOverride,
  setPageCardSize, setPageImgSize, clearPageCardSize, clearPageImgSize,
} from '@/lib/card-size';
import {
  TITLE_MIN, TITLE_MAX, SUB_MIN, SUB_MAX, loadGlobalTitleSize,
  setPageTitleSize, setPageSubSize, clearPageHeader,
} from '@/lib/header-size';

// One uniform "header size" slider drives the title; the subtitle scales with it.
export const subOf = (t: number) => Math.max(SUB_MIN, Math.min(SUB_MAX, Math.round(t * 0.46)));

const sel: React.CSSProperties = { width: '100%', padding: '7px 9px', fontSize: 13, borderRadius: 8, border: '1.5px solid var(--ink)', background: 'var(--card,#fff8ee)', font: 'inherit', cursor: 'pointer' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 4px', display: 'block' };

function Dropdown({ label, labels, value, onChange }: { label: string; labels: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ minWidth: 140 }}><span style={lbl}>{label}</span>
      <select value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} style={sel}>
        {labels.map((l, i) => <option key={l} value={i}>{l}</option>)}
      </select>
    </div>
  );
}

export function PerPagePopup({ onClose }: { onClose: () => void }) {
  const [sel2, setSel] = useState<Record<string, boolean>>({});
  const [layout, setLayout] = useState<number>(() => loadGlobalCardSize());
  const [img, setImg] = useState<number>(() => loadGlobalImgSize());
  const [tSize, setT] = useState<number>(() => loadGlobalTitleSize());
  const chosen = CARD_PAGES.filter((p) => sel2[p.key]).map((p) => p.key);
  const allOn = chosen.length === CARD_PAGES.length;
  const toggle = (k: string) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => setSel(allOn ? {} : Object.fromEntries(CARD_PAGES.map((p) => [p.key, true])));
  const apply = () => { chosen.forEach((k) => { setPageCardSize(k, layout); setPageImgSize(k, img); setPageTitleSize(k, tSize); setPageSubSize(k, subOf(tSize)); }); onClose(); };
  const resetChosen = () => { chosen.forEach((k) => { clearPageCardSize(k); clearPageImgSize(k); clearPageHeader(k); }); onClose(); };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b>Customise per page</b><button className="btn small ghost" onClick={onClose}>✕</button></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontWeight: 700 }}><input type="checkbox" checked={allOn} onChange={toggleAll} /> All pages</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', margin: '0 0 12px 18px' }}>
          {CARD_PAGES.map((p) => (
            <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!sel2[p.key]} onChange={() => toggle(p.key)} /> {p.label}{hasPageOverride(p.key) ? ' •' : ''}
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Dropdown label="Layout" labels={CARD_SIZE_LABELS} value={layout} onChange={setLayout} />
          <Dropdown label="Image" labels={CARD_IMG_LABELS} value={img} onChange={setImg} />
        </div>
        <div style={{ marginTop: 10 }}>
          <span style={lbl}>Header size — {tSize}px</span>
          <input type="range" min={TITLE_MIN} max={TITLE_MAX} value={tSize} onChange={(e) => setT(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--green,#7fb069)' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn small ghost" disabled={!chosen.length} onClick={resetChosen}>Reset selected</button>
          <button className="btn small green" disabled={!chosen.length} onClick={apply}>Apply to selected ({chosen.length})</button>
        </div>
      </div>
    </div>
  );
}
