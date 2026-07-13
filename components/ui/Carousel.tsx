'use client';
/* A reusable horizontally-slidable strip: a title row (with the Refresh control
 * right beside the title) over a scrollable rail of cards. The title can be made
 * editable — type a new one, or ✎ / 🎨 to reword it with AI. Used for the "Top
 * picks for you" feed on the Tools page and below the comments on a tool page. */
import { useRef, useState, type ReactNode } from 'react';

export function Carousel({ title, onRefresh, refreshing, children, empty, cardWidth = 240,
  canEditTitle, onRenameTitle, onRemixTitle, remixingTitle }: {
  title: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
  empty?: ReactNode;
  cardWidth?: number;
  canEditTitle?: boolean;                    // show ✎ / 🎨 next to the title
  onRenameTitle?: (t: string) => void;       // save a typed/custom title
  onRemixTitle?: () => void;                  // AI "palette" reword (same meaning, new wording)
  remixingTitle?: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const count = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);
  const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 } as const;
  const save = () => { const v = draft.trim(); if (v && onRenameTitle) onRenameTitle(v); setEditing(false); };
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Title + its controls, all on the same (left) side. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {editing ? (
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(title); setEditing(false); } }}
            onBlur={save} style={{ fontSize: 17, fontWeight: 700, padding: '2px 6px', borderRadius: 6, border: '1.5px solid var(--ink)', maxWidth: 320 }} />
        ) : (
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        )}
        {canEditTitle && !editing && (
          <>
            <button title="Edit the title" style={iconBtn} onClick={() => { setDraft(title); setEditing(true); }}>✎</button>
            {onRemixTitle && <button title="AI tap-mixer — reword the title" style={iconBtn} disabled={!!remixingTitle} onClick={onRemixTitle}>{remixingTitle ? '…' : '🎨'}</button>}
          </>
        )}
        {onRefresh && <button className="btn small ghost" disabled={!!refreshing} onClick={onRefresh} title="Refresh suggestions">{refreshing ? '…' : '🔄 Refresh'}</button>}
      </div>
      {count === 0 ? (
        <div style={{ opacity: 0.6, fontSize: 13, padding: '8px 0' }}>{empty || 'Nothing to show yet.'}</div>
      ) : (
        <div ref={rail} style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
          {(Array.isArray(children) ? children : [children]).map((c, i) => (
            <div key={i} style={{ flex: `0 0 ${cardWidth}px`, maxWidth: cardWidth, scrollSnapAlign: 'start' }}>{c}</div>
          ))}
        </div>
      )}
    </div>
  );
}
