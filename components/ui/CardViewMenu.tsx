'use client';
/* A pair of dropdown menus (à la a file explorer's "View" menu) for a gallery's
 * filter row: card LAYOUT/size and, for tool galleries, the IMAGE mode. Both save
 * THIS page's setting (the "specific" path); the Settings page does it universally. */
import { setPageCardSize, useCardSize, setPageImgSize, useImgSize, CARD_SIZE_LABELS, CARD_IMG_LABELS } from '@/lib/card-size';

const sel: React.CSSProperties = { padding: '5px 8px', fontSize: 12.5, borderRadius: 8, border: '1.5px solid var(--ink)', background: 'var(--card,#fff8ee)', font: 'inherit', cursor: 'pointer' };

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
