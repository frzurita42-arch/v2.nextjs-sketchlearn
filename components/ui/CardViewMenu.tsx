'use client';
/* A pair of dropdown menus (à la a file explorer's "View" menu) for a gallery's
 * filter row: card LAYOUT/size and, for tool galleries, the IMAGE mode. Both save
 * THIS page's setting (the "specific" path); the Settings page does it universally. */
import { setPageCardSize, useCardSize, setPageImgSize, useImgSize, CARD_SIZE_LABELS, CARD_IMG_LABELS } from '@/lib/card-size';

// The shared compact "paper" dropdown look for a filter row — the sketchbook
// border (2.5px ink + wobble radius) sized down to sit next to the search box.
// Exported so sibling filters (e.g. the moderators age band) match exactly.
export const filterSelect: React.CSSProperties = { padding: '6px 10px', fontSize: 12.5, borderRadius: 'var(--wobble-2, 10px)', border: '2.5px solid var(--ink)', background: '#fff', fontFamily: 'var(--font-hand)', cursor: 'pointer' };
const sel = filterSelect;

export function CardViewMenu({ pageKey, showImage = true }: { pageKey: string; showImage?: boolean }) {
  const size = useCardSize(pageKey);
  const img = useImgSize(pageKey);
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flex: '0 0 auto' }}>
      <select title="View — card layout & size" aria-label="Card view" value={size} onChange={(e) => setPageCardSize(pageKey, parseInt(e.target.value, 10))} style={sel}>
        {CARD_SIZE_LABELS.map((l, i) => <option key={l} value={i}>▦ {l}</option>)}
      </select>
      {showImage && (
        <select title="Image — how the picture is shown" aria-label="Card image" value={img} onChange={(e) => setPageImgSize(pageKey, parseInt(e.target.value, 10))} style={sel}>
          {CARD_IMG_LABELS.map((l, i) => <option key={l} value={i}>🖼 {l}</option>)}
        </select>
      )}
    </span>
  );
}
