'use client';
/* A compact per-page card-size control for a gallery's filter row. It sets (and
 * saves) THIS page's card size — the "specific update" path. The universal path
 * lives on the Settings page; whichever runs last wins. */
import { setPageCardSize, useCardSize } from '@/lib/card-size';

export function CardSizeMini({ pageKey }: { pageKey: string }) {
  const size = useCardSize(pageKey);
  return (
    <span title="Card size (this page)" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
      <span aria-hidden style={{ fontSize: 14 }}>🃏</span>
      <input type="range" min={0} max={4} step={1} value={size} aria-label="Card size for this page"
        onChange={(e) => setPageCardSize(pageKey, parseInt(e.target.value, 10))}
        style={{ width: 84, accentColor: 'var(--green,#7fb069)' }} />
    </span>
  );
}
