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
  onOpen?: () => void;        // click the image or the title to open

  overlay?: React.ReactNode;      // edit icons floated over the image (top-right)
  placeholder?: React.ReactNode;  // buttons shown inside the empty image box
  rowThumbFallback?: React.ReactNode; // 46×46 fallback content for row view
  editBtns?: React.ReactNode;     // inline ✎🎨 next to title / after description
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
    hasImg
      ? <div style={{ position: 'relative', cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
          <img src={thumbnail as string} alt="" loading="lazy" style={{ width: '100%', height: h, objectFit: 'cover', display: 'block', borderBottom: '2px solid var(--ink)' }} />
          {p.overlay}
        </div>
      : <div style={{ height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,0,0,0.04)', borderBottom: '2px dashed var(--ink)', textAlign: 'center', padding: 6, cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
          <span style={{ fontSize: 12, opacity: 0.6 }}>🖼️ No photo available</span>
          {p.placeholder}
        </div>
  );

  if (view === 'row') {
    const desc = subtitle || '';
    const rowThumb = hasImg
      ? <img src={thumbnail as string} alt="" loading="lazy" onClick={onOpen} style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ink)', flex: '0 0 auto', cursor: onOpen ? 'pointer' : 'default' }} />
      : <div title="No photo" onClick={onOpen} style={{ width: 46, height: 46, borderRadius: 8, border: '2px dashed var(--ink)', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, opacity: 0.6, cursor: onOpen ? 'pointer' : 'default' }}>{p.rowThumbFallback ?? '🖼️'}</div>;
    return (
      <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, maxWidth: '100%' }}>
        {rowThumb}
        <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15, ...(onOpen ? clickable : {}) }} onClick={onOpen}>{title}</strong>
            {badge && <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.55 }}>{badge}</span>}
            {fav && <span style={{ fontSize: 11 }}>★</span>}
            {p.badges}
            {p.editBtns}
          </div>
          {desc && <div style={{ fontSize: 12, opacity: 0.8 }}>{desc}</div>}
          {p.meta}
        </div>
        <span style={{ display: 'flex', gap: 8, flex: '0 0 auto', alignItems: 'center', flexWrap: 'wrap' }}>
          {p.actions}
          {p.del}
        </span>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {imageBox}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 16, ...(onOpen ? clickable : {}) }} onClick={onOpen}>{title}{fav ? ' ★' : ''}{p.editBtns}</strong>
          {badge && <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>{badge}</span>}
        </div>
        {p.badges && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, opacity: 0.75 }}>{p.badges}</div>}
        {subtitle !== undefined && <p style={{ margin: 0, fontSize: 13, opacity: 0.85, flex: 1 }}>{subtitle || 'No description.'}{p.editBtns}</p>}
        {p.tags && p.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {p.tags.map((tag: string) => <span key={tag} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1.5px solid var(--ink)' }}>#{tag}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
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
