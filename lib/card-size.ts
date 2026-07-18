'use client';
/* Global card-size setting (persisted in localStorage). One slider controls the
 * card size on EVERY gallery at once — because every card is the same shared
 * component, only the container layout + card `view` change. As the size grows the
 * layout morphs: horizontal list rows → a tightening/loosening grid → a single
 * big "feed" column. */
import { useEffect, useState, type CSSProperties } from 'react';

const KEY = 'sl_card_size';
export const CARD_SIZE_LABELS = ['List', 'Small', 'Medium', 'Large', 'Feed'];

export function loadCardSize(): number {
  if (typeof window === 'undefined') return 2;
  try { const v = parseInt(localStorage.getItem(KEY) || '2', 10); return isNaN(v) ? 2 : Math.max(0, Math.min(4, v)); } catch { return 2; }
}
export function saveCardSize(v: number) {
  try { localStorage.setItem(KEY, String(v)); window.dispatchEvent(new CustomEvent('sl-card-size')); } catch { /* ignore */ }
}
// Live, cross-component: any mounted gallery re-reads when the slider changes.
export function useCardSize(): [number, (v: number) => void] {
  const [size, setSize] = useState<number>(() => loadCardSize());
  useEffect(() => { const h = () => setSize(loadCardSize()); window.addEventListener('sl-card-size', h); return () => window.removeEventListener('sl-card-size', h); }, []);
  const set = (v: number) => { const c = Math.max(0, Math.min(4, v)); saveCardSize(c); setSize(c); };
  return [size, set];
}

// The container layout + per-card `view` for a given size.
export function galleryLayout(size: number): { view: 'grid' | 'row'; container: CSSProperties } {
  if (size <= 0) return { view: 'row', container: { display: 'flex', flexDirection: 'column', gap: 8 } };
  if (size >= 4) return { view: 'grid', container: { display: 'grid', gridTemplateColumns: 'minmax(0, 440px)', justifyContent: 'center', gap: 18 } };
  const minW = size === 1 ? 170 : size === 2 ? 240 : 320;   // small / medium / large
  return { view: 'grid', container: { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minW}px, 1fr))`, gap: 16 } };
}
