'use client';
/* The "Cards" size panel — the same control the global Settings page uses: pick a
 * layout/size + image mode, preview it as a BLANK card, and apply it everywhere
 * (or per page). Reused beside the settings card on the repo / slide-tool pages in
 * place of the donation mug. */
import { useState } from 'react';
import {
  CARD_SIZE_LABELS, CARD_IMG_LABELS,
  loadGlobalCardSize, loadGlobalImgSize, applyCardSizeAll, applyImgSizeAll,
} from '@/lib/card-size';
import { filterSelect } from '@/components/ui/CardViewMenu';
import { CardReference } from '@/components/ui/CardReference';
import { PerPagePopup } from '@/components/ui/PerPagePopup';

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0, display: 'block' };
const paperSel: React.CSSProperties = { ...filterSelect, width: 'auto', minWidth: 130 };

export function CardSizePanel() {
  const [cLayout, setCLayout] = useState(() => loadGlobalCardSize());
  const [cImg, setCImg] = useState(() => loadGlobalImgSize());
  const [saved, setSaved] = useState(false);
  const [popup, setPopup] = useState(false);
  const apply = () => { applyCardSizeAll(cLayout); applyImgSizeAll(cImg); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <span style={lbl}>Cards</span>
      <div className="card" style={{ padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <select title="Layout / size" aria-label="Card layout & size" value={cLayout} onChange={(e) => setCLayout(parseInt(e.target.value, 10))} style={paperSel}>
          {CARD_SIZE_LABELS.map((l, i) => <option key={l} value={i}>▦ {l}</option>)}
        </select>
        <select title="Card image" aria-label="Card image" value={cImg} onChange={(e) => setCImg(parseInt(e.target.value, 10))} style={paperSel}>
          {CARD_IMG_LABELS.map((l, i) => <option key={l} value={i}>🖼 {l}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
          <button className="btn small green" onClick={apply}>{saved ? '✓ Applied' : 'Apply to all pages'}</button>
        </div>
      </div>
      <div style={{ border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: '10px 14px' }}>
        <span style={{ ...lbl, marginBottom: 8 }}>Blank card — {CARD_SIZE_LABELS[cLayout]} · {CARD_IMG_LABELS[cImg]}</span>
        <CardReference cardSize={cLayout} imgMode={cImg} />
      </div>
      {popup && <PerPagePopup onClose={() => setPopup(false)} />}
    </div>
  );
}
