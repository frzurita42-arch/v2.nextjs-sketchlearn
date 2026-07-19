'use client';
/* App settings (new shell layout). The header (title + subtitle) size control now
 * lives NEXT TO the page title itself, half-and-half, via the shared <PageHeaderBar>.
 * Below that, the card LAYOUT + IMAGE controls sit in a thin filter-toolbar above a
 * live card preview. "Apply to all pages" makes a choice universal; the popup
 * (shared) targets specific pages. */
import { useState } from 'react';
import {
  CARD_SIZE_LABELS, CARD_IMG_LABELS,
  loadGlobalCardSize, loadGlobalImgSize, applyCardSizeAll, applyImgSizeAll,
} from '@/lib/card-size';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { PerPagePopup } from '@/components/ui/PerPagePopup';
import { InstructionBannerSettings } from '@/components/ui/InstructionBanner';
import { GallerySkeleton } from '@/components/ui/GallerySkeleton';
import { CardReference } from '@/components/ui/CardReference';
import { filterSelect } from '@/components/ui/CardViewMenu';

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 4px', display: 'block' };
const dashBox: React.CSSProperties = { border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.015)' };
// The same paper dropdown as the Sandbox filter row (CardViewMenu) — width:auto so it
// sizes to its content in a flex row instead of stretching (global select is 100%).
const paperSel: React.CSSProperties = { ...filterSelect, width: 'auto', minWidth: 130 };

export function AppSettingsView() {
  // The Cards and Galleries sections each have their OWN filter (independent preview
  // selection); either one's "Apply to all pages" writes the global card setting.
  const [cLayout, setCLayout] = useState<number>(() => loadGlobalCardSize());
  const [cImg, setCImg] = useState<number>(() => loadGlobalImgSize());
  const [gLayout, setGLayout] = useState<number>(() => loadGlobalCardSize());
  const [gImg, setGImg] = useState<number>(() => loadGlobalImgSize());
  const [popup, setPopup] = useState(false);
  const [cSaved, setCSaved] = useState(false);
  const [gSaved, setGSaved] = useState(false);
  const applyCards = () => { applyCardSizeAll(cLayout); applyImgSizeAll(cImg); setCSaved(true); setTimeout(() => setCSaved(false), 1600); };
  const applyGal = () => { applyCardSizeAll(gLayout); applyImgSizeAll(gImg); setGSaved(true); setTimeout(() => setGSaved(false), 1600); };
  return (
    <div className="sl-settings" style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        {/* Title + header-size control (editors only), closed by a dotted separator. */}
        <PageHeaderBar pageKey="appsettings" title="⚙️ Settings" subtitle="Tweak how SketchLearn looks." global />

        {/* Dotted line between the Settings header and the Galleries section (outside
            the header encapsulation). */}
        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '4px 0 22px' }} />

        {/* ── CARDS ─────────────────────────────────────────────────────
            The card template + a "View"-style filter (like a file explorer): pick any
            arrangement — every layout/size and every image mode, INCLUDING "No image"
            (no photo at all). The blank card below previews it, and "Apply to all
            pages" changes the card everywhere on the platform. */}
        <span style={lbl}>Cards</span>
        <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <select title="Layout / size" aria-label="Card layout & size" value={cLayout} onChange={(e) => setCLayout(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_SIZE_LABELS.map((l, i) => <option key={l} value={i}>▦ {l}</option>)}
          </select>
          <select title="Card image" aria-label="Card image" value={cImg} onChange={(e) => setCImg(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_IMG_LABELS.map((l, i) => <option key={l} value={i}>🖼 {l}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyCards}>{cSaved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
        {/* A BLANK card (no text, no image content) in the chosen arrangement. */}
        <div style={dashBox}>
          <span style={{ ...lbl, marginBottom: 8 }}>Blank card — {CARD_SIZE_LABELS[cLayout]} · {CARD_IMG_LABELS[cImg]}</span>
          <CardReference cardSize={cLayout} imgMode={cImg} />
        </div>

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' }} />

        {/* ── GALLERIES ─────────────────────────────────────────────────
            Its OWN filter + preview of how cards look arranged in a gallery. */}
        <span style={lbl}>Galleries</span>
        <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <select title="Layout / size" aria-label="Gallery layout & size" value={gLayout} onChange={(e) => setGLayout(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_SIZE_LABELS.map((l, i) => <option key={l} value={i}>▦ {l}</option>)}
          </select>
          <select title="Card image" aria-label="Gallery card image" value={gImg} onChange={(e) => setGImg(parseInt(e.target.value, 10))} style={paperSel}>
            {CARD_IMG_LABELS.map((l, i) => <option key={l} value={i}>🖼 {l}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyGal}>{gSaved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
        <div style={dashBox}>
          <span style={{ ...lbl, marginBottom: 8 }}>Preview — {CARD_SIZE_LABELS[gLayout]} · {CARD_IMG_LABELS[gImg]}</span>
          <GallerySkeleton cardSize={gLayout} imgMode={gImg} editable />
        </div>

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' }} />

        {/* Instruction banner — the wooden board, its editor + AI + apply controls. */}
        <InstructionBannerSettings />

        {/* Dotted line closing the instructions-banner section from anything below. */}
        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0 0' }} />
      </div>
      {popup && <PerPagePopup onClose={() => setPopup(false)} />}
    </div>
  );
}
