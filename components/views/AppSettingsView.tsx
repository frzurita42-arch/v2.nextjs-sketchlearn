'use client';
/* App settings (new shell layout). The header (title + subtitle) size control now
 * lives NEXT TO the page title itself, half-and-half, via the shared <PageHeaderBar>.
 * Below that, the card LAYOUT + IMAGE controls sit in a thin filter-toolbar above a
 * live card preview. "Apply to all pages" makes a choice universal; the popup
 * (shared) targets specific pages. */
import { useState } from 'react';
import {
  CARD_SIZE_LABELS, CARD_IMG_LABELS, galleryLayout,
  loadGlobalCardSize, loadGlobalImgSize, applyCardSizeAll, applyImgSizeAll,
} from '@/lib/card-size';
import { ToolCard } from '@/components/tools/ToolCard';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { PerPagePopup } from '@/components/ui/PerPagePopup';
import { filterSelect } from '@/components/ui/CardViewMenu';

// A fake tool for the live preview — an emoji thumbnail (no photo) + real card chrome.
const SAMPLE = {
  slug: '__preview__', title: 'Sample presentation', archetype: 'lesson', owner: 'you', visibility: 'public',
  description: 'A preview card — this is how your galleries will look with the current layout and image settings.',
  tags: ['example', 'preview'], aiGenerated: true, thumbnail: null, createdAt: new Date().toISOString(),
};
const noop = () => { /* preview only */ };

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 4px', display: 'block' };
const dashBox: React.CSSProperties = { border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.015)' };
// The same paper dropdown as the Sandbox filter row (CardViewMenu) — width:auto so it
// sizes to its content in a flex row instead of stretching (global select is 100%).
const paperSel: React.CSSProperties = { ...filterSelect, width: 'auto', minWidth: 130 };

function CardPreview({ layout, img }: { layout: number; img: number }) {
  const l = galleryLayout(layout);
  return (
    <div style={{ ...l.container, alignItems: 'stretch' }}>
      <ToolCard tool={SAMPLE} view={l.view} hideOpen imageMode={img} onOpen={noop}
        canEdit onEdit={noop} onGenThumb={noop} onThumbPrompt={noop} onUploadThumb={noop} onDice={noop} thumbing={false} />
    </div>
  );
}

export function AppSettingsView() {
  const [layout, setLayout] = useState<number>(() => loadGlobalCardSize());
  const [img, setImg] = useState<number>(() => loadGlobalImgSize());
  const [popup, setPopup] = useState(false);
  const [saved, setSaved] = useState(false);
  const applyAll = () => { applyCardSizeAll(layout); applyImgSizeAll(img); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        {/* Title + header-size control (editors only), closed by a dotted separator. */}
        <PageHeaderBar pageKey="appsettings" title="⚙️ Settings" subtitle="Tweak how SketchLearn looks." global />

        {/* ── CARDS ─────────────────────────────────────────────────────
            A thin filter-toolbar (same look as the Sandbox filter row) above the
            live preview: paper dropdowns with ▦/🖼 emojis + small buttons. */}
        <span style={lbl}>Cards</span>
        <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <select title="Layout / size" aria-label="Card layout & size" value={layout} onChange={(e) => setLayout(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_SIZE_LABELS.map((l, i) => <option key={l} value={i}>▦ {l}</option>)}
          </select>
          <select title="Card image" aria-label="Card image" value={img} onChange={(e) => setImg(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_IMG_LABELS.map((l, i) => <option key={l} value={i}>🖼 {l}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyAll}>{saved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
        <div style={dashBox}>
          <span style={{ ...lbl, marginBottom: 8 }}>Preview — {CARD_SIZE_LABELS[layout]} · {CARD_IMG_LABELS[img]}</span>
          <CardPreview layout={layout} img={img} />
        </div>
      </div>
      {popup && <PerPagePopup onClose={() => setPopup(false)} />}
    </div>
  );
}
