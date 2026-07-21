'use client';

import type { CSSProperties, ReactNode } from 'react';

const slotStyle: CSSProperties = { height: 88, display: 'flex', alignItems: 'flex-end' };
const navBtnStyle: CSSProperties = {
  width: 96,
  height: 40,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export function WizardGridTemplate({
  top,
  bottom,
  onNext,
  onBack,
  backDisabled,
  rightTop,
  tall,
  rowButtons,
}: {
  top: ReactNode;
  bottom?: ReactNode;
  onNext?: () => void;
  onBack: () => void;
  backDisabled?: boolean;
  rightTop?: ReactNode;
  tall?: boolean;   // one tall content area (multi-select / templates / long prompt) with Next above Back on the right
  rowButtons?: boolean;   // content sets the height; Next hugs the top field row, Back hugs the bottom row (no fixed 88px slots)
}) {
  if (rowButtons) {
    // The button column STRETCHES to the content's own height, so Next lands on
    // the first field row and Back on the last — they stay on the fields' rows
    // instead of floating in fixed 88px slots. Used by the packed field grids
    // (slide wizard) and the repo Access page.
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'stretch' }}>
        <div style={{ minHeight: 156, minWidth: 0 }}>{top}</div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch' }}>
          <div>{rightTop ?? <button className="btn small green" style={navBtnStyle} onClick={onNext}>Next →</button>}</div>
          <button className="btn small ghost" style={navBtnStyle} disabled={!!backDisabled} onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }
  if (tall) {
    // FIXED total height (186 = two 88px rows + 10 gap), so every tall page is the
    // exact same size as the two-field pages and the Next/Back buttons never move.
    // Content over that height scrolls INSIDE instead of growing the card.
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'stretch' }}>
        <div style={{ height: 186, overflowY: 'auto', display: 'flex', minWidth: 0 }}>{top}</div>
        {/* Same two-slot button column as the non-tall pages: Next in the top slot,
            Back in the bottom slot — identical positions across all steps. */}
        <div style={{ display: 'grid', gridTemplateRows: '88px 88px', gap: 10 }}>
          <div style={slotStyle}>{rightTop ?? <button className="btn small green" style={navBtnStyle} onClick={onNext}>Next →</button>}</div>
          <div style={slotStyle}><button className="btn small ghost" style={navBtnStyle} disabled={!!backDisabled} onClick={onBack}>← Back</button></div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
        <div style={slotStyle}>{top}</div>
        <div style={slotStyle}>
          {rightTop ?? <button className="btn small green" style={navBtnStyle} onClick={onNext}>Next →</button>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
        <div style={slotStyle}>{bottom ?? <span aria-hidden style={{ display: 'block', width: '100%', height: 1 }} />}</div>
        <div style={slotStyle}>
          <button className="btn small ghost" style={navBtnStyle} disabled={!!backDisabled} onClick={onBack}>← Back</button>
        </div>
      </div>
    </div>
  );
}
