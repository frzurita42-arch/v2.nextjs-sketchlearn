'use client';
/* A page's heading laid out as two half-and-half columns:
 *   LEFT  — the title + subtitle, enclosed in a dotted box (the live PageHeading,
 *           with its Aa resize + ✎ rename tools).
 *   RIGHT — a thin control card: one uniform "header size" slider that resizes THIS
 *           page live, plus "Customise per page…" and "Apply to all pages".
 * Used on the Settings page and the gallery/list pages so every heading matches. */
import { useState } from 'react';
import { PageHeading } from './PageHeading';
import { PerPagePopup, subOf } from './PerPagePopup';
import { TITLE_MIN, TITLE_MAX, useHeaderSize, setPageTitleSize, setPageSubSize, applyHeaderAll } from '@/lib/header-size';

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0, display: 'block' };

export function PageHeaderBar({ pageKey, title, subtitle }: { pageKey?: string; title: React.ReactNode; subtitle?: React.ReactNode }) {
  const { title: tSize } = useHeaderSize(pageKey);
  const [popup, setPopup] = useState(false);
  const [saved, setSaved] = useState(false);
  const setSize = (v: number) => { if (pageKey) { setPageTitleSize(pageKey, v); setPageSubSize(pageKey, subOf(v)); } };
  const applyAll = () => { applyHeaderAll(tSize, subOf(tSize)); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 22 }}>
      {/* LEFT half — the title enclosed in a dotted box. */}
      <div style={{ flex: '1 1 300px', minWidth: 240, border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: '10px 16px', background: 'rgba(0,0,0,0.015)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <PageHeading pageKey={pageKey} title={title} subtitle={subtitle} />
      </div>
      {/* RIGHT half — the header-size control card. */}
      <div className="card" style={{ flex: '1 1 300px', minWidth: 240, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={lbl}>Header size — {tSize}px</span>
        <input type="range" min={TITLE_MIN} max={TITLE_MAX} value={tSize} onChange={(e) => setSize(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--green,#7fb069)' }} />
        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted,#8a7f70)' }}>Sizes this page live — the subtitle scales with the title. Apply it everywhere, or tweak specific pages.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
          <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
          <button className="btn small green" onClick={applyAll}>{saved ? '✓ Applied' : 'Apply to all pages'}</button>
        </div>
      </div>
      {popup && <PerPagePopup onClose={() => setPopup(false)} />}
    </div>
  );
}
