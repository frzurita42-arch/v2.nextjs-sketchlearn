'use client';
/* App settings (new shell layout). First setting: CARD SIZE. A slider sets a size;
 * "Apply to all pages" makes it universal (and clears per-page overrides). A popup
 * lets you customise the size PER PAGE — pick any galleries (or All) and apply just
 * to those. Every gallery renders the same shared card, so one change updates them
 * all (or only the pages you chose). */
import { useState } from 'react';
import {
  CARD_SIZE_LABELS, CARD_PAGES, loadGlobalCardSize, loadCardSize, hasPageOverride,
  applyCardSizeAll, setPageCardSize, clearPageCardSize,
} from '@/lib/card-size';

const HINTS = [
  'Compact horizontal rows — one per line.',
  'Small grid — many per row.',
  'Medium grid — the default.',
  'Large grid — fewer, bigger tiles.',
  'Feed — one big card per row (Instagram-style).',
];

function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <>
      <input type="range" min={0} max={4} step={1} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{ width: '100%', accentColor: 'var(--green,#7fb069)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted,#8a7f70)', marginTop: 4 }}>
        {CARD_SIZE_LABELS.map((l, i) => (
          <span key={l} style={{ fontWeight: i === value ? 800 : 400, color: i === value ? 'var(--ink)' : undefined }}>{l}</span>
        ))}
      </div>
    </>
  );
}

// Popup: pick pages (or All) + a size, apply to just those pages.
function PerPagePopup({ onClose }: { onClose: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [size, setSize] = useState<number>(() => loadGlobalCardSize());
  const chosen = CARD_PAGES.filter((p) => sel[p.key]).map((p) => p.key);
  const allOn = chosen.length === CARD_PAGES.length;
  const toggle = (k: string) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => setSel(allOn ? {} : Object.fromEntries(CARD_PAGES.map((p) => [p.key, true])));
  const apply = () => { chosen.forEach((k) => setPageCardSize(k, size)); onClose(); };
  const resetChosen = () => { chosen.forEach((k) => clearPageCardSize(k)); onClose(); };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px', maxHeight: '85vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b>Customise card size per page</b><button className="btn small ghost" onClick={onClose}>✕</button></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontWeight: 700 }}>
          <input type="checkbox" checked={allOn} onChange={toggleAll} /> All pages
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', margin: '0 0 12px 18px' }}>
          {CARD_PAGES.map((p) => (
            <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!sel[p.key]} onChange={() => toggle(p.key)} />
              {p.label}{hasPageOverride(p.key) ? ' •' : ''}
            </label>
          ))}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>SIZE — {CARD_SIZE_LABELS[size]}</div>
        <Slider value={size} onChange={setSize} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn small ghost" disabled={!chosen.length} onClick={resetChosen}>Reset selected to global</button>
          <button className="btn small green" disabled={!chosen.length} onClick={apply}>Apply to selected ({chosen.length})</button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted,#8a7f70)', margin: '10px 0 0' }}>Pages with a “•” already have their own size. “All pages” here sets those specific pages; use “Apply to all pages” on the main screen to reset everything to one size.</p>
      </div>
    </div>
  );
}

export function AppSettingsView() {
  const [draft, setDraft] = useState<number>(() => loadGlobalCardSize());
  const [popup, setPopup] = useState(false);
  const [saved, setSaved] = useState(false);
  const applyAll = () => { applyCardSizeAll(draft); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <h2 className="scribble-underline" style={{ display: 'inline-block', margin: '0 0 4px' }}>⚙️ Settings</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--muted,#8a7f70)', fontSize: 14 }}>Tweak how SketchLearn looks.</p>

        <div className="card" style={{ padding: '16px 18px', maxWidth: 520 }}>
          <b style={{ display: 'block', marginBottom: 4 }}>Card size</b>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted,#8a7f70)' }}>Resizes the cards on every gallery. Choose a size, then apply it everywhere — or customise specific pages.</p>
          <Slider value={draft} onChange={setDraft} />
          <p style={{ margin: '12px 0 0', fontSize: 13 }}><b>{CARD_SIZE_LABELS[draft]}</b> — {HINTS[draft]}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyAll}>{saved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
      </div>
      {popup && <PerPagePopup onClose={() => setPopup(false)} />}
    </div>
  );
}
