'use client';
/* A reusable horizontally-slidable strip: a title row (with an optional Refresh
 * button) over a scrollable rail of cards with ‹ › arrows. Used for the "Top
 * picks for you" feed on the Tools page and below the comments on a tool page —
 * change it once, both update. */
import { useRef, type ReactNode } from 'react';

export function Carousel({ title, onRefresh, refreshing, children, empty, cardWidth = 240 }: {
  title: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
  empty?: ReactNode;          // shown when there are no children
  cardWidth?: number;         // each slide's fixed width
}) {
  const rail = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: number) => { try { rail.current?.scrollBy({ left: dir * (cardWidth + 14) * 2, behavior: 'smooth' }); } catch { /* ignore */ } };
  const count = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {onRefresh && <button className="btn small ghost" disabled={!!refreshing} onClick={onRefresh} title="Refresh suggestions">{refreshing ? '…' : '🔄 Refresh'}</button>}
          {count > 0 && (
            <span style={{ display: 'inline-flex', border: '1.5px solid var(--ink)', borderRadius: 6, overflow: 'hidden' }}>
              <button className="btn small ghost" style={{ borderRadius: 0, border: 'none' }} title="Scroll left" onClick={() => scrollBy(-1)}>‹</button>
              <button className="btn small ghost" style={{ borderRadius: 0, border: 'none' }} title="Scroll right" onClick={() => scrollBy(1)}>›</button>
            </span>
          )}
        </div>
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
