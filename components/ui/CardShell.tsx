'use client';
/* CardShell — the ONE shared card layout used everywhere a thing is shown as a
 * gallery grid card or a horizontal row: the tools gallery (ToolCard) and the
 * lesson activities feed (rendition cards) both render through this, so a change
 * to the container "lives down" to every list at once.
 *
 * It owns the visual structure (image space, overlay edit icons, title + badge,
 * subtitle, tags, footer meta + actions). Callers pass their own slots — the
 * clickable image/title (onOpen), the thumbnail edit overlay, the inline
 * title/description edit icons, the footer actions (Open → / Play / OP results),
 * and a small plain delete icon. */
import { isRenderableImage } from '@/lib/img';

export interface CardShellProps {
  view: 'grid' | 'row';
  title: string;
  subtitle?: string;          // description / byline
  badge?: string;             // small kind label, upper-right (LESSON, REPO, replica…)
  fav?: boolean;
  thumbnail?: string | null;
  thumbHeight?: number;       // grid image height (default 130)
  gridHeight?: number;        // when set, GRID cards are this fixed total height
                              // (uniform tiles); the description is clamped and the
                              // footer pins to the bottom so nothing overflows.
  rowTextLines?: number;      // when set, the ROW description text is clamped to
                              // this many lines (a fixed amount of text). Inline
                              // edit icons stay visible.
  onOpen?: () => void;        // click the image or the title to open

  leading?: React.ReactNode;      // ROW view: slot to the LEFT of the logo/thumbnail (e.g. collapse toggle)
  iconNode?: React.ReactNode;     // an emoji/text icon shown in the image spot INSTEAD of a photo
  overlay?: React.ReactNode;      // edit icons floated over the image (top-right)
  placeholder?: React.ReactNode;  // buttons shown inside the empty image box
  rowThumbFallback?: React.ReactNode; // 46×46 fallback content for row view
  editBtns?: React.ReactNode;     // inline ✎🎨 next to title / after description
  afterTitle?: React.ReactNode;   // inline slot right after the TITLE text (per-field edit)
  afterSubtitle?: React.ReactNode;// inline slot right after the SUBTITLE text (per-field edit)
  badges?: React.ReactNode;       // extra inline badges under/after the title
  tags?: string[];
  meta?: React.ReactNode;         // footer-left meta line
  del?: React.ReactNode;          // small plain delete icon (no button box)
  actions?: React.ReactNode;      // footer-right action buttons
}

const clickable = { cursor: 'pointer' } as const;

export function CardShell(p: CardShellProps) {
  const { view, title, subtitle, badge, fav, thumbnail, onOpen } = p;
  const h = p.thumbHeight ?? 130;
  const hasImg = isRenderableImage(thumbnail || undefined);

  const imageBox = (
    p.iconNode
      ? <div style={{ position: 'relative', height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, lineHeight: 1, background: 'rgba(0,0,0,0.03)', borderBottom: '2px solid var(--ink)', cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
          {p.iconNode}
          {p.overlay}
        </div>
      : hasImg
      ? <div style={{ position: 'relative', cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
          <img src={thumbnail as string} alt="" loading="eager" decoding="async" style={{ width: '100%', height: h, objectFit: 'cover', display: 'block', borderBottom: '2px solid var(--ink)' }} />
          {p.overlay}
        </div>
      : <div style={{ height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,0,0,0.04)', borderBottom: '2px dashed var(--ink)', textAlign: 'center', padding: 6, cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
          <span style={{ fontSize: 12, opacity: 0.6 }}>🖼️ No photo available</span>
          {p.placeholder}
        </div>
  );

  if (view === 'row') {
    const desc = subtitle || '';
    const rowThumb = p.iconNode
      ? <div onClick={onOpen} style={{ width: 46, height: 46, borderRadius: 8, border: '2px solid var(--ink)', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, lineHeight: 1, cursor: onOpen ? 'pointer' : 'default' }}>{p.iconNode}</div>
      : hasImg
      ? <img src={thumbnail as string} alt="" loading="lazy" onClick={onOpen} style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ink)', flex: '0 0 auto', cursor: onOpen ? 'pointer' : 'default' }} />
      : <div title="No photo" onClick={onOpen} style={{ width: 46, height: 46, borderRadius: 8, border: '2px dashed var(--ink)', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, opacity: 0.6, cursor: onOpen ? 'pointer' : 'default' }}>{p.rowThumbFallback ?? '🖼️'}</div>;
    return (
      <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, maxWidth: '100%' }}>
        {p.leading}
        {rowThumb}
        <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15, ...(onOpen ? clickable : {}) }} onClick={onOpen}>{title}</strong>
            {badge && <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.55 }}>{badge}</span>}
            {fav && <span style={{ fontSize: 11 }}>★</span>}
            {p.badges}
            {p.editBtns}
            {p.afterTitle}
          </div>
          {(desc || p.afterSubtitle) && (
            <div style={{ fontSize: 12, opacity: 0.8, display: 'flex', alignItems: p.rowTextLines ? 'flex-start' : 'center', gap: 4, flexWrap: 'wrap' }}>
              {desc && (p.rowTextLines
                ? <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: p.rowTextLines, minWidth: 0 }}>{desc}</span>
                : <span>{desc}</span>)}
              {p.afterSubtitle}
            </div>
          )}
          {p.meta}
        </div>
        <span style={{ display: 'flex', gap: 8, flex: '0 0 auto', alignItems: 'center', flexWrap: 'wrap' }}>
          {p.actions}
          {p.del}
        </span>
      </div>
    );
  }

  // Fixed-height tiles: clamp the description to a couple of lines and let the
  // footer pin to the bottom, so every card is exactly the same height.
  const fixed = typeof p.gridHeight === 'number';
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: fixed ? p.gridHeight : '100%' }}>
      {imageBox}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
        {fixed
          // Fixed tiles: the title clamps to two lines and the edit icons + badge
          // sit in a fixed, non-shrinking slot on the SAME row (they never wrap to
          // a new line and push the layout / overflow).
          // The title always RESERVES two rows (min-height) and clamps at two, so
          // every card lines up and a long title can't push the rest down. Items
          // don't shrink (flexShrink 0) — that's what caused text to overlap.
          ? <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
              <strong style={{ fontSize: 16, lineHeight: 1.25, minHeight: '2.5em', flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, ...(onOpen ? clickable : {}) }} onClick={onOpen}>{title}{fav ? ' ★' : ''}</strong>
              {badge && <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, flex: '0 0 auto', marginTop: 2 }}>{badge}</span>}
              {/* Dedicated right-hand slot for the ✎ / 🎨 edit controls. */}
              {(p.editBtns || p.afterTitle) && <span style={{ flex: '0 0 auto', display: 'inline-flex', gap: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>{p.editBtns}{p.afterTitle}</span>}
            </div>
          : <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <strong style={{ fontSize: 16, ...(onOpen ? clickable : {}) }} onClick={onOpen}>{title}{fav ? ' ★' : ''}{p.editBtns}{p.afterTitle}</strong>
              {badge && <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>{badge}</span>}
            </div>}
        {p.badges && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, opacity: 0.75 }}>{p.badges}</div>}
        {(subtitle !== undefined || p.afterSubtitle) && (
          fixed
            // Fixed tiles: clamp the description TEXT to two lines. The edit icons
            // already show next to the title, so they are not repeated here.
            ? <div style={{ margin: 0, fontSize: 13, opacity: 0.85, display: 'flex', alignItems: 'flex-start', gap: 4, flexShrink: 0 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{subtitle || 'No description.'}</span>
                {p.afterSubtitle}
              </div>
            : <p style={{ margin: 0, fontSize: 13, opacity: 0.85, flex: 1, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>{subtitle || 'No description.'}{p.editBtns}{p.afterSubtitle}</p>
        )}
        {p.tags && p.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            {p.tags.map((tag: string) => <span key={tag} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1.5px solid var(--ink)' }}>#{tag}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
          {p.meta}
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{p.actions}{p.del}</span>
        </div>
      </div>
    </div>
  );
}

// Shared small-icon button styles (plain, no box) — used for inline edit icons and
// the delete icon so "delete" reads as an icon, not a button.
export const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: 0, fontSize: 14, lineHeight: 1 } as const;
export const overlayIcon = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 17, lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.95))' } as const;
export const delIcon = { background: 'none', border: 'none', cursor: 'pointer', padding: 2, margin: 0, fontSize: 15, lineHeight: 1, opacity: 0.65 } as const;
