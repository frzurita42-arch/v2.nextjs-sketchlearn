'use client';
/* A reusable horizontally-slidable strip: a title row (with the Refresh control
 * right beside the title) over a scrollable rail of cards. The title can be made
 * editable — type a new one, or ✎ / 🎨 to reword it with AI. Used for the "Top
 * picks for you" feed on the Tools page and below the comments on a tool page. */
import { useRef, type ReactNode } from 'react';
import { SectionHeader } from '@/components/ui/SectionHeader';

export function Carousel({ title, onRefresh, refreshing, children, empty, cardWidth = 240, cardHeight,
  canEditTitle, onRenameTitle, onRemixTitle, remixingTitle, headerExtra, banner,
  showCollapse, collapsed, onToggleCollapse }: {
  title: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
  empty?: ReactNode;
  cardWidth?: number;
  cardHeight?: number;                        // fixed slide height (uniform cards)
  canEditTitle?: boolean;                    // show ✎ / 🎨 next to the title
  onRenameTitle?: (t: string) => void;       // save a typed/custom title
  onRemixTitle?: () => void;                  // AI "palette" reword (same meaning, new wording)
  remixingTitle?: boolean;
  headerExtra?: ReactNode;                    // extra control in the header (e.g. a Recommend button)
  banner?: ReactNode;                         // a how-to banner shown BELOW the title, above the cards
  showCollapse?: boolean;                     // show the 👁 hide/show toggle in the header
  collapsed?: boolean;                        // when true the body is hidden (header stays for admins)
  onToggleCollapse?: () => void;              // provide to make the 👁 clickable (else it's shown disabled)
}) {
  const rail = useRef<HTMLDivElement>(null);
  const slide = (dir: number) => { try { rail.current?.scrollBy({ left: dir * (cardWidth + 14) * 2, behavior: 'smooth' }); } catch { /* ignore */ } };
  const count = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Hide the horizontal scrollbar (scrolling still works). */}
      <style>{'.sl-rail{scrollbar-width:none;-ms-overflow-style:none;}.sl-rail::-webkit-scrollbar{display:none;height:0;width:0;}'}</style>
      {/* Shared title row: ✎ · 🎨 · 🔄 · slider · 👁 (eye always last). */}
      <SectionHeader title={title}
        canEditTitle={canEditTitle} onRenameTitle={onRenameTitle} onRemixTitle={onRemixTitle} remixingTitle={remixingTitle}
        onRefresh={onRefresh} refreshing={refreshing} refreshTitle="Refresh suggestions"
        showCollapse={showCollapse} collapsed={collapsed} onToggleCollapse={onToggleCollapse}
        extra={<>
          {headerExtra}
          {count > 1 && (
            <span style={{ display: 'inline-flex', border: '1.5px solid var(--ink)', borderRadius: 6, overflow: 'hidden' }}>
              <button className="btn small ghost" style={{ borderRadius: 0, border: 'none' }} title="Slide left" onClick={() => slide(-1)}>‹</button>
              <button className="btn small ghost" style={{ borderRadius: 0, border: 'none' }} title="Slide right" onClick={() => slide(1)}>›</button>
            </span>
          )}
        </>} />
      {/* When collapsed, only the admin reaches this (regular users don't render the
          section at all); the header already shows the "hidden" note. */}
      {collapsed ? null : (<>
      {/* How-to banner sits below the title, above the cards. */}
      {banner}
      {count === 0 ? (
        <div style={{ opacity: 0.6, fontSize: 13, padding: '8px 0' }}>{empty || 'Nothing to show yet.'}</div>
      ) : (
        <div ref={rail} className="sl-rail" style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
          {(Array.isArray(children) ? children : [children]).map((c, i) => (
            <div key={i} style={{ flex: `0 0 ${cardWidth}px`, maxWidth: cardWidth, height: cardHeight, scrollSnapAlign: 'start' }}>{c}</div>
          ))}
        </div>
      )}
      </>)}
      {/* A dashed rule under every carousel. */}
      <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.5, margin: '14px 0 0' }} />
    </div>
  );
}
