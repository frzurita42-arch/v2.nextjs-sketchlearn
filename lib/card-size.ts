'use client';
/* Global + per-page card-size setting (persisted in localStorage). One shared card
 * component means one setting resizes every gallery; a page may also carry its own
 * override. The slider morphs both size AND layout: horizontal list rows → a
 * tightening/loosening grid → a single big "feed" column. */
import { useEffect, useState, type CSSProperties } from 'react';

const GLOBAL_KEY = 'sl_card_size';
const pageKeyOf = (p: string) => `sl_card_size:${p}`;
export const CARD_SIZE_LABELS = ['List', 'Small', 'Medium', 'Large', 'Feed'];
// The pages whose galleries the size setting applies to.
export const CARD_PAGES: { key: string; label: string }[] = [
  { key: 'slides', label: 'Slides' },
  { key: 'tools', label: 'Repos' },
  { key: 'presrun', label: 'Presentation runs' },
  { key: 'moderators', label: 'Moderators' },
  { key: 'users', label: 'Users' },
  { key: 'sandbox', label: 'Sandbox' },
  { key: 'empty', label: 'Empty' },
];

const clamp = (v: number) => Math.max(0, Math.min(4, isNaN(v) ? 2 : v));
const emit = () => { try { window.dispatchEvent(new CustomEvent('sl-card-size')); } catch { /* ignore */ } };

export function loadGlobalCardSize(): number {
  if (typeof window === 'undefined') return 2;
  try { return clamp(parseInt(localStorage.getItem(GLOBAL_KEY) || '2', 10)); } catch { return 2; }
}
// A page uses its own override when set, else the global default.
export function loadCardSize(page?: string): number {
  if (typeof window === 'undefined') return 2;
  try {
    if (page) { const v = localStorage.getItem(pageKeyOf(page)); if (v !== null) return clamp(parseInt(v, 10)); }
    return loadGlobalCardSize();
  } catch { return 2; }
}
export function hasPageOverride(page: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(pageKeyOf(page)) !== null; } catch { return false; }
}
export function setGlobalCardSize(v: number) { try { localStorage.setItem(GLOBAL_KEY, String(clamp(v))); emit(); } catch { /* ignore */ } }
export function setPageCardSize(page: string, v: number) { try { localStorage.setItem(pageKeyOf(page), String(clamp(v))); emit(); } catch { /* ignore */ } }
export function clearPageCardSize(page: string) { try { localStorage.removeItem(pageKeyOf(page)); emit(); } catch { /* ignore */ } }
// Universal: set the global size AND drop every per-page override.
export function applyCardSizeAll(v: number) {
  try { localStorage.setItem(GLOBAL_KEY, String(clamp(v))); CARD_PAGES.forEach((p) => localStorage.removeItem(pageKeyOf(p.key))); emit(); } catch { /* ignore */ }
}

// Read-only, page-aware, and live: any mounted gallery re-reads on any change.
export function useCardSize(page?: string): number {
  const [size, setSize] = useState<number>(() => loadCardSize(page));
  useEffect(() => { const h = () => setSize(loadCardSize(page)); window.addEventListener('sl-card-size', h); h(); return () => window.removeEventListener('sl-card-size', h); }, [page]);
  return size;
}

// The container layout + per-card `view` for a given size.
export function galleryLayout(size: number): { view: 'grid' | 'row'; container: CSSProperties } {
  if (size <= 0) return { view: 'row', container: { display: 'flex', flexDirection: 'column', gap: 8 } };
  if (size >= 4) return { view: 'grid', container: { display: 'grid', gridTemplateColumns: 'minmax(0, 440px)', justifyContent: 'center', gap: 18 } };
  const minW = size === 1 ? 170 : size === 2 ? 240 : 320;
  return { view: 'grid', container: { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minW}px, 1fr))`, gap: 16 } };
}
