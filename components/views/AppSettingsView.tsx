'use client';
/* App settings (new shell layout). The header (title + subtitle) size control now
 * lives NEXT TO the page title itself, half-and-half, via the shared <PageHeaderBar>.
 * Below that, the card LAYOUT + IMAGE controls sit in a thin filter-toolbar above a
 * live card preview. "Apply to all pages" makes a choice universal; the popup
 * (shared) targets specific pages. */
import { useEffect, useState } from 'react';
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
import {
  TOOL_HEADER_FONTS,
  TOOL_HEADER_PAGES,
  TOOL_HEADER_SIZE_MIN,
  TOOL_HEADER_SIZE_MAX,
  loadGlobalToolHeaderSize,
  loadGlobalToolHeaderFont,
  loadGlobalToolHeaderUnderline,
  applyToolHeaderAll,
  setToolHeaderPage,
  clearToolHeaderPage,
  hasToolHeaderOverride,
  type ToolHeaderScope,
} from '@/lib/tool-header-style';
import { ensureSiteSettings } from '@/lib/site-settings-client';

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 4px', display: 'block' };
const dashBox: React.CSSProperties = { border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: 16, background: 'rgba(0,0,0,0.015)' };
// The same paper dropdown as the Sandbox filter row (CardViewMenu) — width:auto so it
// sizes to its content in a flex row instead of stretching (global select is 100%).
const paperSel: React.CSSProperties = { ...filterSelect, width: 'auto', minWidth: 130 };

function ToolHeaderPerPagePopup({ size, font, underline, onClose }: { size: number; font: string; underline: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const chosen = TOOL_HEADER_PAGES.filter((p) => sel[p.key]).map((p) => p.key);
  const allOn = chosen.length === TOOL_HEADER_PAGES.length;
  const toggle = (k: ToolHeaderScope) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => setSel(allOn ? {} : Object.fromEntries(TOOL_HEADER_PAGES.map((p) => [p.key, true])));
  const apply = () => { chosen.forEach((k) => setToolHeaderPage(k as ToolHeaderScope, size, font, underline)); onClose(); };
  const reset = () => { chosen.forEach((k) => clearToolHeaderPage(k as ToolHeaderScope)); onClose(); };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b>Slide tool header per page</b><button className="btn small ghost" onClick={onClose}>✕</button></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontWeight: 700 }}><input type="checkbox" checked={allOn} onChange={toggleAll} /> All pages</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px 12px', margin: '0 0 12px 18px' }}>
          {TOOL_HEADER_PAGES.map((p) => (
            <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!sel[p.key]} onChange={() => toggle(p.key)} /> {p.label}{hasToolHeaderOverride(p.key) ? ' •' : ''}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn small ghost" disabled={!chosen.length} onClick={reset}>Reset selected</button>
          <button className="btn small green" disabled={!chosen.length} onClick={apply}>Apply to selected ({chosen.length})</button>
        </div>
      </div>
    </div>
  );
}

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
  const [toolHdrSize, setToolHdrSize] = useState<number>(() => loadGlobalToolHeaderSize());
  const [toolHdrFont, setToolHdrFont] = useState<string>(() => loadGlobalToolHeaderFont());
  const [toolHdrUnderline, setToolHdrUnderline] = useState<boolean>(() => loadGlobalToolHeaderUnderline());
  const [toolHdrPopup, setToolHdrPopup] = useState(false);
  const [toolHdrSaved, setToolHdrSaved] = useState(false);
  const [siteRev, setSiteRev] = useState(0);
  const toolHdrFontCss = TOOL_HEADER_FONTS.find((f) => f.id === toolHdrFont)?.css || TOOL_HEADER_FONTS[0].css;
  const applyCards = () => { applyCardSizeAll(cLayout); applyImgSizeAll(cImg); setCSaved(true); setTimeout(() => setCSaved(false), 1600); };
  const applyGal = () => { applyCardSizeAll(gLayout); applyImgSizeAll(gImg); setGSaved(true); setTimeout(() => setGSaved(false), 1600); };
  const applyToolHdr = () => { applyToolHeaderAll(toolHdrSize, toolHdrFont, toolHdrUnderline); setToolHdrSaved(true); setTimeout(() => setToolHdrSaved(false), 1600); };

  useEffect(() => {
    const sync = () => {
      setCLayout(loadGlobalCardSize());
      setCImg(loadGlobalImgSize());
      setGLayout(loadGlobalCardSize());
      setGImg(loadGlobalImgSize());
      setToolHdrSize(loadGlobalToolHeaderSize());
      setToolHdrFont(loadGlobalToolHeaderFont());
      setToolHdrUnderline(loadGlobalToolHeaderUnderline());
      setSiteRev((v) => v + 1);
    };
    window.addEventListener('sl-site-settings', sync);
    ensureSiteSettings();
    return () => window.removeEventListener('sl-site-settings', sync);
  }, []);
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
        <InstructionBannerSettings key={`banner-${siteRev}`} />

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' }} />

        {/* Slide tool header — controls the presentation/tool page title style. */}
        <span style={lbl}>Slide tool header</span>
        <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', marginBottom: 12 }}>
          <select title="Header font" aria-label="Slide tool header font" value={toolHdrFont} onChange={(e) => setToolHdrFont(e.target.value)} style={paperSel}>
            {TOOL_HEADER_FONTS.map((f) => <option key={f.id} value={f.id}>Aa {f.label}</option>)}
          </select>
          <button className={`btn small ${toolHdrUnderline ? 'blue' : 'ghost'}`} onClick={() => setToolHdrUnderline((v) => !v)}>
            Orange line: {toolHdrUnderline ? 'On' : 'Off'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 260, flex: '0 0 260px' }}>
            <span style={{ ...lbl, margin: 0, whiteSpace: 'nowrap' }}>Size {toolHdrSize}px</span>
            <input type="range" min={TOOL_HEADER_SIZE_MIN} max={TOOL_HEADER_SIZE_MAX} value={toolHdrSize} onChange={(e) => setToolHdrSize(parseInt(e.target.value, 10))} style={{ width: 190, accentColor: 'var(--green,#7fb069)' }} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'nowrap' }}>
            <button className="btn small ghost" onClick={() => setToolHdrPopup(true)}>Customise per page…</button>
            <button className="btn small green" onClick={applyToolHdr}>{toolHdrSaved ? '✓ Applied' : 'Apply to all pages'}</button>
          </div>
        </div>
        <div style={dashBox}>
          <span style={{ ...lbl, marginBottom: 8 }}>Preview</span>
          <h2 className={toolHdrUnderline ? 'scribble-underline' : undefined} style={{ margin: 0, fontSize: toolHdrSize, lineHeight: 1.06, fontFamily: toolHdrFontCss, display: 'inline-block', textAlign: 'left' }}>
            Presentation - Basic Nutrition for Sports and Healthy Living
          </h2>
        </div>

        {/* Dotted line closing the instructions-banner section from anything below. */}
        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0 0' }} />
      </div>
      {popup && <PerPagePopup onClose={() => setPopup(false)} />}
      {toolHdrPopup && <ToolHeaderPerPagePopup size={toolHdrSize} font={toolHdrFont} underline={toolHdrUnderline} onClose={() => setToolHdrPopup(false)} />}
    </div>
  );
}
