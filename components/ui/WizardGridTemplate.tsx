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
}: {
  top: ReactNode;
  bottom?: ReactNode;
  onNext?: () => void;
  onBack: () => void;
  backDisabled?: boolean;
  rightTop?: ReactNode;
  tall?: boolean;   // one tall content area (multi-select / templates / long prompt) with Next above Back on the right
}) {
  if (tall) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'stretch' }}>
        <div style={{ minHeight: 186, display: 'flex' }}>{top}</div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 186 }}>
          {rightTop ?? <button className="btn small green" style={navBtnStyle} onClick={onNext}>Next →</button>}
          <button className="btn small ghost" style={navBtnStyle} disabled={!!backDisabled} onClick={onBack}>← Back</button>
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
