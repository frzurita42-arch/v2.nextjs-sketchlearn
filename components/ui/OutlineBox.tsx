'use client';
import React from 'react';

/* OutlineBox — a labelled dashed panel that groups a row of related controls,
 * generalizing the look of the repo "OWNER CONTROLS" box: a dashed border, a
 * small centered small-caps caption at the top, and its children wrapping in a
 * centered flex row beneath.
 *
 * Reused for the gallery FILTERS & DISPLAY toolbars (Repositories & Slides pages)
 * and the dashboard SECTIONS picker, so every grouped-control strip reads the
 * same way. Pass a `title` for the caption (omit for an unlabelled box). */
export function OutlineBox({ title, children, maxWidth = 1000, style }: {
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px 8px', border: '1.5px dashed var(--ink)', borderRadius: 10, width: '100%', maxWidth, marginInline: 'auto', boxSizing: 'border-box', ...style }}>
      {title && <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.55, width: '100%', textAlign: 'center', marginBottom: 2 }}>{title}</span>}
      {children}
    </div>
  );
}
