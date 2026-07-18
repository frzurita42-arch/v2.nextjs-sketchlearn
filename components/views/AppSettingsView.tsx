'use client';
/* App settings (new shell layout). Card LAYOUT + IMAGE size are picked from
 * dropdown menus (like a file explorer's View menu). "Apply to all pages" makes
 * them universal; the popup targets specific pages. */
import { useState } from 'react';
import {
  CARD_SIZE_LABELS, CARD_IMG_LABELS, CARD_PAGES, galleryLayout,
  loadGlobalCardSize, loadGlobalImgSize, hasPageOverride,
  applyCardSizeAll, applyImgSizeAll, setPageCardSize, setPageImgSize, clearPageCardSize, clearPageImgSize,
} from '@/lib/card-size';
import { ToolCard } from '@/components/tools/ToolCard';
import { PageHeading } from '@/components/ui/PageHeading';
import {
  TITLE_MIN, TITLE_MAX, SUB_MIN, SUB_MAX, loadGlobalTitleSize, loadGlobalSubSize,
  applyHeaderAll, setPageTitleSize, setPageSubSize, clearPageHeader,
} from '@/lib/header-size';

// A fake tool for the live preview — an emoji thumbnail (no photo) + real card chrome.
const SAMPLE = {
  slug: '__preview__', title: 'Sample presentation', archetype: 'lesson', owner: 'you', visibility: 'public',
  description: 'A preview card — this is how your galleries will look with the current layout and image settings.',
  tags: ['example', 'preview'], aiGenerated: true, thumbnail: null, createdAt: new Date().toISOString(),
};
const noop = () => { /* preview only */ };

function CardPreview({ layout, img }: { layout: number; img: number }) {
  const l = galleryLayout(layout);
  return (
    <div style={{ ...l.container, alignItems: 'stretch' }}>
      <ToolCard tool={SAMPLE} view={l.view} hideOpen imageMode={img} onOpen={noop}
        canEdit onEdit={noop} onGenThumb={noop} onThumbPrompt={noop} onUploadThumb={noop} onDice={noop} thumbing={false} />
    </div>
  );
}

const sel: React.CSSProperties = { width: '100%', padding: '7px 9px', fontSize: 13, borderRadius: 8, border: '1.5px solid var(--ink)', background: 'var(--card,#fff8ee)', font: 'inherit', cursor: 'pointer' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 4px', display: 'block' };

function Dropdown({ label, labels, value, onChange }: { label: string; labels: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <div><span style={lbl}>{label}</span>
      <select value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} style={sel}>
        {labels.map((l, i) => <option key={l} value={i}>{l}</option>)}
      </select>
    </div>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'block', fontSize: 12 }}>{label} <b>{value}px</b>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--green,#7fb069)' }} />
    </label>
  );
}

function PerPagePopup({ onClose }: { onClose: () => void }) {
  const [sel2, setSel] = useState<Record<string, boolean>>({});
  const [layout, setLayout] = useState<number>(() => loadGlobalCardSize());
  const [img, setImg] = useState<number>(() => loadGlobalImgSize());
  const [tSize, setT] = useState<number>(() => loadGlobalTitleSize());
  const [sSize, setS] = useState<number>(() => loadGlobalSubSize());
  const chosen = CARD_PAGES.filter((p) => sel2[p.key]).map((p) => p.key);
  const allOn = chosen.length === CARD_PAGES.length;
  const toggle = (k: string) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => setSel(allOn ? {} : Object.fromEntries(CARD_PAGES.map((p) => [p.key, true])));
  const apply = () => { chosen.forEach((k) => { setPageCardSize(k, layout); setPageImgSize(k, img); setPageTitleSize(k, tSize); setPageSubSize(k, sSize); }); onClose(); };
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <Slider label="Title" min={TITLE_MIN} max={TITLE_MAX} value={tSize} onChange={setT} />
          <Slider label="Subtitle" min={SUB_MIN} max={SUB_MAX} value={sSize} onChange={setS} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn small ghost" disabled={!chosen.length} onClick={resetChosen}>Reset selected</button>
          <button className="btn small green" disabled={!chosen.length} onClick={apply}>Apply to selected ({chosen.length})</button>
        </div>
      </div>
    </div>
  );
}

export function AppSettingsView() {
  const [layout, setLayout] = useState<number>(() => loadGlobalCardSize());
  const [img, setImg] = useState<number>(() => loadGlobalImgSize());
  const [tSize, setT] = useState<number>(() => loadGlobalTitleSize());
  const [sSize, setS] = useState<number>(() => loadGlobalSubSize());
  const [popup, setPopup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hSaved, setHSaved] = useState(false);
  const applyAll = () => { applyCardSizeAll(layout); applyImgSizeAll(img); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  const applyHeaders = () => { applyHeaderAll(tSize, sSize); setHSaved(true); setTimeout(() => setHSaved(false), 1600); };
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <PageHeading pageKey="appsettings" title="⚙️ Settings" subtitle="Tweak how SketchLearn looks." />

        <div className="card" style={{ padding: '16px 18px', maxWidth: 520 }}>
          <b style={{ display: 'block', marginBottom: 4 }}>Cards</b>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted,#8a7f70)' }}>Sets the card layout and picture on every gallery. Pick, then apply everywhere — or customise specific pages.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Dropdown label="Card layout / size" labels={CARD_SIZE_LABELS} value={layout} onChange={setLayout} />
            <Dropdown label="Card image" labels={CARD_IMG_LABELS} value={img} onChange={setImg} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyAll}>{saved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>

        {/* Live preview — a real card in the currently-chosen layout + image mode. */}
        <div style={{ marginTop: 20 }}>
          <span style={{ ...lbl, marginBottom: 8 }}>Preview — {CARD_SIZE_LABELS[layout]} · {CARD_IMG_LABELS[img]}</span>
          <div style={{ border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.015)' }}>
            <CardPreview layout={layout} img={img} />
          </div>
        </div>

        {/* Header (title + subtitle) sizes. */}
        <div className="card" style={{ padding: '16px 18px', maxWidth: 520, marginTop: 20 }}>
          <b style={{ display: 'block', marginBottom: 4 }}>Page headers</b>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted,#8a7f70)' }}>The title &amp; subtitle size on every page. Each page can also override this from its own “Aa” tool next to the title.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Slider label="Title" min={TITLE_MIN} max={TITLE_MAX} value={tSize} onChange={setT} />
            <Slider label="Subtitle" min={SUB_MIN} max={SUB_MAX} value={sSize} onChange={setS} />
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', border: '2px dashed var(--line,#d9cfc0)', borderRadius: 10, background: 'rgba(0,0,0,0.015)' }}>
            <div className="scribble-underline" style={{ display: 'inline-block', fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: tSize, lineHeight: 1.05 }}>Sample title</div>
            <p style={{ margin: '4px 0 0', color: 'var(--muted,#8a7f70)', fontSize: sSize }}>Sample subtitle text.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyHeaders}>{hSaved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
      </div>
      {popup && <PerPagePopup onClose={() => setPopup(false)} />}
    </div>
  );
}
