'use client';
/* The instruction BANNER — the wooden "how to use it" board (.instruction-plank /
 * .plank-note from sketch.css), encapsulated in a dotted box.
 *
 *  • <InstructionBanner pageKey> — display only: shows the page's banner (per-page
 *    text if set, else the global one). Renders nothing when there is no banner.
 *  • <InstructionBannerSettings> — the Settings-page editor: a live plank preview
 *    plus tools to edit the title/subtitle, generate copy with AI, and apply to all
 *    pages or customise per page. */
import { useState } from 'react';
import { API } from '@/lib/api';
import {
  BANNER_SUGGEST, BANNER_SIZE_MIN, BANNER_SIZE_MAX, BANNER_SIZE_DEFAULT,
  useBanner, loadBanner, applyBannerAll, setPageBanner, clearPageBanner, hasBannerOverride,
} from '@/lib/banner-text';
import { CARD_PAGES } from '@/lib/card-size';

const dashBox: React.CSSProperties = { border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: '8px 12px 2px', background: 'rgba(0,0,0,0.015)' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0, display: 'block' };

function Plank({ title, body, size = BANNER_SIZE_DEFAULT }: { title: string; body: string; size?: number }) {
  return (
    <div className="instruction-plank">
      <div className="plank-note">
        <p style={{ fontSize: size }}>{title && <b>{title}</b>}{title && body && <br />}{body}</p>
      </div>
    </div>
  );
}

// Display-only banner for a page. Nothing renders when the page has no banner text.
export function InstructionBanner({ pageKey }: { pageKey?: string }) {
  const { title, body, size } = useBanner(pageKey);
  if (!title && !body) return null;
  return <div style={{ ...dashBox, marginBottom: 18 }}><Plank title={title} body={body} size={size} /></div>;
}

// Popup to apply the current banner text to specific pages (or clear them).
function BannerPerPagePopup({ title, body, size, onClose }: { title: string; body: string; size: number; onClose: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const chosen = CARD_PAGES.filter((p) => sel[p.key]).map((p) => p.key);
  const allOn = chosen.length === CARD_PAGES.length;
  const toggle = (k: string) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => setSel(allOn ? {} : Object.fromEntries(CARD_PAGES.map((p) => [p.key, true])));
  const apply = () => { chosen.forEach((k) => setPageBanner(k, title, body, size)); onClose(); };
  const reset = () => { chosen.forEach((k) => clearPageBanner(k)); onClose(); };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b>Show this banner on…</b><button className="btn small ghost" onClick={onClose}>✕</button></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontWeight: 700 }}><input type="checkbox" checked={allOn} onChange={toggleAll} /> All pages</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', margin: '0 0 12px 18px' }}>
          {CARD_PAGES.map((p) => (
            <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!sel[p.key]} onChange={() => toggle(p.key)} /> {p.label}{hasBannerOverride(p.key) ? ' •' : ''}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn small ghost" disabled={!chosen.length} onClick={reset}>Hide on selected</button>
          <button className="btn small green" disabled={!chosen.length} onClick={apply}>Show on selected ({chosen.length})</button>
        </div>
      </div>
    </div>
  );
}

export function InstructionBannerSettings() {
  const saved = loadBanner();
  const [title, setTitle] = useState(saved.title || BANNER_SUGGEST.title);
  const [body, setBody] = useState(saved.body || BANNER_SUGGEST.body);
  const [size, setSize] = useState<number>(saved.size || BANNER_SIZE_DEFAULT);
  const [busy, setBusy] = useState<'' | 'title' | 'body'>('');
  const [popup, setPopup] = useState(false);
  const [okAll, setOkAll] = useState(false);

  // The 🎨 palette next to a field label asks AI to write just THAT field from the
  // current context (the other field + the page).
  const genField = async (field: 'title' | 'body') => {
    setBusy(field);
    try {
      const r: any = await API.post('/api/ai/banner', { page: 'the whole site', current: title, currentBody: body });
      if (field === 'title' && r?.title) setTitle(r.title);
      else if (field === 'body' && r?.body) setBody(r.body);
      else if (r?.error) alert(r.error);
    } catch { alert('AI unavailable — type it instead.'); }
    setBusy('');
  };
  const applyAll = () => { applyBannerAll(title.trim(), body.trim(), size); setOkAll(true); setTimeout(() => setOkAll(false), 1600); };

  // The palette icon shown next to an AI-suggestable field's label.
  const palette = (field: 'title' | 'body') => (
    <button title={`Let AI suggest the ${field === 'title' ? 'title' : 'subtitle'} from context`} disabled={busy === field}
      onClick={() => genField(field)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 6, fontSize: 13, lineHeight: 1, verticalAlign: 'middle' }}>{busy === field ? '…' : '🎨'}</button>
  );

  // Fixed-size single-line inputs: they never grow with the text — it scrolls/hides,
  // you just keep typing.
  const fixedField: React.CSSProperties = { width: '100%', height: 38, marginTop: 3, boxSizing: 'border-box' };
  return (
    <div>
      {/* Same layout pattern as the other sections: small grey title, then the
          filter (editor toolbar), then the component encapsulated in a dotted box. */}
      <span style={lbl}>Instructions banner</span>
      {/* The filter / editor, laid out like the generic gallery filter toolbar. */}
      <div className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {/* Row 1: title + subtitle + customise/apply buttons, one row. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 160px', minWidth: 0 }}><span style={lbl}>Title{palette('title')}</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={BANNER_SUGGEST.title} style={fixedField} /></label>
          <label style={{ flex: '2 1 220px', minWidth: 0 }}><span style={lbl}>Subtitle / instructions{palette('body')}</span>
            <input type="text" value={body} onChange={(e) => setBody(e.target.value)} placeholder={BANNER_SUGGEST.body} style={fixedField} /></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyAll}>{okAll ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
        {/* Row 2: the size scroll bar. */}
        <label style={{ display: 'block' }}><span style={lbl}>Size — {size}px</span>
          <input type="range" min={BANNER_SIZE_MIN} max={BANNER_SIZE_MAX} value={size} onChange={(e) => setSize(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--green,#7fb069)' }} /></label>
      </div>
      {/* The component — the wooden board, encapsulated in a dotted box. */}
      <div style={dashBox}><Plank title={title} body={body} size={size} /></div>
      {popup && <BannerPerPagePopup title={title.trim()} body={body.trim()} size={size} onClose={() => setPopup(false)} />}
    </div>
  );
}
