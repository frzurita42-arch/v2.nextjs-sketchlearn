'use client';
/* The STANDARD section title row, reused by every carousel/collection-style header
 * so titles look and behave identically. A small top space sets it apart from what
 * is above. The controls always appear in this fixed order:
 *   ✎ edit · 🎨 AI-distort · 🔄 refresh · {extra: slider / recommend / …} · 👁 eye
 * The 👁 visibility toggle is ALWAYS last; any slider buttons go just before it.
 * Reuse this whenever you build an editable section title. */
import { useState, type ReactNode, type CSSProperties } from 'react';

export function SectionHeader({
  title, canEditTitle, onRenameTitle, onRemixTitle, remixingTitle,
  onRefresh, refreshing, refreshTitle = 'Refresh', extra,
  showCollapse, collapsed, onToggleCollapse, maxWidth, titleFontSize = 18,
}: {
  title: string;
  canEditTitle?: boolean;                     // show ✎ / 🎨
  onRenameTitle?: (t: string) => void;        // save a typed title
  onRemixTitle?: () => void;                   // AI reword ("palette")
  remixingTitle?: boolean;
  onRefresh?: () => void;                       // 🔄 refresh action
  refreshing?: boolean;
  refreshTitle?: string;
  extra?: ReactNode;                            // controls that sit AFTER refresh, BEFORE the eye (e.g. slider arrows)
  showCollapse?: boolean;                       // show the 👁 hide/show toggle (always rendered last)
  collapsed?: boolean;
  onToggleCollapse?: () => void;                // provide to make the 👁 clickable (else shown disabled)
  maxWidth?: number;                            // constrain + center the row (collections do; carousels don't)
  titleFontSize?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const icon = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 } as const;
  const save = () => { const v = draft.trim(); if (v && onRenameTitle) onRenameTitle(v); setEditing(false); };
  const wrap: CSSProperties = maxWidth ? { maxWidth, margin: '0 auto' } : {};
  return (
    // A little top space sets the title apart from the section/rule above it.
    <div style={{ ...wrap, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8, flexWrap: 'wrap' }}>
      {editing ? (
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(title); setEditing(false); } }}
          onBlur={save} style={{ fontSize: 17, fontWeight: 700, padding: '2px 6px', borderRadius: 6, border: '1.5px solid var(--ink)', maxWidth: 320 }} />
      ) : (
        <h3 style={{ margin: 0, fontSize: titleFontSize }}>{title}</h3>
      )}
      {/* ✎ edit · 🎨 distort */}
      {canEditTitle && !editing && (
        <>
          <button title="Edit the title" style={icon} onClick={() => { setDraft(title); setEditing(true); }}>✎</button>
          {onRemixTitle && <button title="AI tap-mixer — reword the title" style={icon} disabled={!!remixingTitle} onClick={onRemixTitle}>{remixingTitle ? '…' : '🎨'}</button>}
        </>
      )}
      {/* 🔄 refresh */}
      {!collapsed && onRefresh && <button className="btn small ghost" disabled={!!refreshing} onClick={onRefresh} title={refreshTitle}>{refreshing ? '…' : '🔄 Refresh'}</button>}
      {/* any extra controls (slider arrows, recommend button) — before the eye */}
      {!collapsed && extra}
      {/* 👁 visibility toggle — ALWAYS last. */}
      {showCollapse && (
        <button title={onToggleCollapse ? (collapsed ? 'Hidden from other users — click to show this section' : 'Hide this section from other users') : 'Section visibility (admin only, home page)'}
          style={{ ...icon, cursor: onToggleCollapse ? 'pointer' : 'default', opacity: collapsed ? 0.4 : 1 }}
          disabled={!onToggleCollapse} onClick={onToggleCollapse}>{'👁︎'}</button>
      )}
      {collapsed && <span style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.55 }}>Hidden from other users · click 👁 to show</span>}
    </div>
  );
}
