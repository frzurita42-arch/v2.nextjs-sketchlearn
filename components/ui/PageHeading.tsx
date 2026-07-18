'use client';
/* The shared shell-page heading: the scribble-underlined title + subtitle, sized by
 * the header-size setting (global, or this page's override). An "Aa" tool next to
 * the title reveals inline sliders to resize just this page. */
import { useState } from 'react';
import { useHeaderSize, setPageTitleSize, setPageSubSize, TITLE_MIN, TITLE_MAX, SUB_MIN, SUB_MAX } from '@/lib/header-size';

export function PageHeading({ pageKey, title, subtitle }: { pageKey?: string; title: React.ReactNode; subtitle?: React.ReactNode }) {
  const { title: tSize, sub: sSize } = useHeaderSize(pageKey);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2 className="scribble-underline" style={{ display: 'inline-block', margin: '0 0 4px', fontSize: tSize, lineHeight: 1.05 }}>{title}</h2>
        {pageKey && (
          <button title="Resize this page's title & subtitle" onClick={() => setOpen((v) => !v)}
            style={{ background: open ? 'var(--card,#fff8ee)' : 'none', border: '1.5px solid var(--line,#d9cfc0)', borderRadius: 6, cursor: 'pointer', fontSize: 11, padding: '2px 7px', color: 'var(--muted,#8a7f70)', alignSelf: 'center' }}>Aa</button>
        )}
      </div>
      {open && pageKey && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '2px 0 8px', fontSize: 11, color: 'var(--muted,#8a7f70)' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Title
            <input type="range" min={TITLE_MIN} max={TITLE_MAX} value={tSize} onChange={(e) => setPageTitleSize(pageKey, parseInt(e.target.value, 10))} style={{ width: 100, accentColor: 'var(--green,#7fb069)' }} /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Subtitle
            <input type="range" min={SUB_MIN} max={SUB_MAX} value={sSize} onChange={(e) => setPageSubSize(pageKey, parseInt(e.target.value, 10))} style={{ width: 100, accentColor: 'var(--green,#7fb069)' }} /></label>
        </div>
      )}
      {subtitle !== undefined && <p style={{ margin: '0 0 12px', color: 'var(--muted,#8a7f70)', fontSize: sSize }}>{subtitle}</p>}
    </div>
  );
}
