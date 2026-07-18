'use client';
/* Global + per-page CARD LAYOUT size and CARD IMAGE size (persisted). One shared
 * card component means one pair of settings resizes every gallery; a page may also
 * carry its own override (the "specific" path). Layout morphs from list rows →
 * grid → a full-width feed; the image goes from hidden → small → large → full
 * 16:9 / 9:16 covers. */
import { useEffect, useState, type CSSProperties } from 'react';

// ── Layout size (how the cards are arranged / how wide) ──
export const CARD_SIZE_LABELS = ['List', 'Small', 'Medium', 'Large', 'Feed', 'Full'];
const LAYOUT_MAX = CARD_SIZE_LABELS.length - 1;
// ── Image size (how the picture inside the card is shown) ──
export const CARD_IMG_LABELS = ['No image', 'Small', 'Medium', 'Large', 'Cover 16:9', 'Cover 9:16'];
const IMG_MAX = CARD_IMG_LABELS.length - 1;

const GLOBAL = 'sl_card_size';
const IMG_GLOBAL = 'sl_card_img';
const pageKeyOf = (p: string) => `sl_card_size:${p}`;
const imgKeyOf = (p: string) => `sl_card_img:${p}`;
export const CARD_PAGES: { key: string; label: string }[] = [
  { key: 'slides', label: 'Slides' }, { key: 'tools', label: 'Repos' }, { key: 'presrun', label: 'Presentation runs' },
  { key: 'moderators', label: 'Moderators' }, { key: 'users', label: 'Users' }, { key: 'sandbox', label: 'Sandbox' }, { key: 'empty', label: 'Empty' },
];

const clampL = (v: number) => Math.max(0, Math.min(LAYOUT_MAX, isNaN(v) ? 2 : v));
const clampI = (v: number) => Math.max(0, Math.min(IMG_MAX, isNaN(v) ? 2 : v));
const emit = () => { try { window.dispatchEvent(new CustomEvent('sl-card-size')); } catch { /* ignore */ } };
const readInt = (k: string, dflt: number) => { try { const v = localStorage.getItem(k); return v === null ? null : parseInt(v, 10); } catch { return null; } };

// ── Layout ──
export function loadGlobalCardSize(): number { if (typeof window === 'undefined') return 2; return clampL(readInt(GLOBAL, 2) ?? 2); }
export function loadCardSize(page?: string): number { if (typeof window === 'undefined') return 2; if (page) { const v = readInt(pageKeyOf(page), 2); if (v !== null) return clampL(v); } return loadGlobalCardSize(); }
export function hasPageOverride(page: string): boolean { if (typeof window === 'undefined') return false; try { return localStorage.getItem(pageKeyOf(page)) !== null; } catch { return false; } }
export function setGlobalCardSize(v: number) { try { localStorage.setItem(GLOBAL, String(clampL(v))); emit(); } catch { /* ignore */ } }
export function setPageCardSize(page: string, v: number) { try { localStorage.setItem(pageKeyOf(page), String(clampL(v))); emit(); } catch { /* ignore */ } }
export function clearPageCardSize(page: string) { try { localStorage.removeItem(pageKeyOf(page)); emit(); } catch { /* ignore */ } }
export function applyCardSizeAll(v: number) { try { localStorage.setItem(GLOBAL, String(clampL(v))); CARD_PAGES.forEach((p) => localStorage.removeItem(pageKeyOf(p.key))); emit(); } catch { /* ignore */ } }

// ── Image ──
export function loadGlobalImgSize(): number { if (typeof window === 'undefined') return 2; return clampI(readInt(IMG_GLOBAL, 2) ?? 2); }
export function loadImgSize(page?: string): number { if (typeof window === 'undefined') return 2; if (page) { const v = readInt(imgKeyOf(page), 2); if (v !== null) return clampI(v); } return loadGlobalImgSize(); }
export function setGlobalImgSize(v: number) { try { localStorage.setItem(IMG_GLOBAL, String(clampI(v))); emit(); } catch { /* ignore */ } }
export function setPageImgSize(page: string, v: number) { try { localStorage.setItem(imgKeyOf(page), String(clampI(v))); emit(); } catch { /* ignore */ } }
export function clearPageImgSize(page: string) { try { localStorage.removeItem(imgKeyOf(page)); emit(); } catch { /* ignore */ } }
export function applyImgSizeAll(v: number) { try { localStorage.setItem(IMG_GLOBAL, String(clampI(v))); CARD_PAGES.forEach((p) => localStorage.removeItem(imgKeyOf(p.key))); emit(); } catch { /* ignore */ } }

// Live, page-aware reads.
export function useCardSize(page?: string): number {
  const [size, setSize] = useState<number>(() => loadCardSize(page));
  useEffect(() => { const h = () => setSize(loadCardSize(page)); window.addEventListener('sl-card-size', h); h(); return () => window.removeEventListener('sl-card-size', h); }, [page]);
  return size;
}
export function useImgSize(page?: string): number {
  const [size, setSize] = useState<number>(() => loadImgSize(page));
  useEffect(() => { const h = () => setSize(loadImgSize(page)); window.addEventListener('sl-card-size', h); h(); return () => window.removeEventListener('sl-card-size', h); }, [page]);
  return size;
}

// The container layout + per-card `view` for a given layout size.
export function galleryLayout(size: number): { view: 'grid' | 'row'; container: CSSProperties } {
  if (size <= 0) return { view: 'row', container: { display: 'flex', flexDirection: 'column', gap: 8 } };
  if (size >= 5) return { view: 'grid', container: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 } };            // Full width
  if (size === 4) return { view: 'grid', container: { display: 'grid', gridTemplateColumns: 'minmax(0, 560px)', justifyContent: 'center', gap: 18 } };  // Feed
  const minW = size === 1 ? 160 : size === 2 ? 220 : 300;   // small / medium / large
  return { view: 'grid', container: { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minW}px, 1fr))`, gap: 16 } };
}
