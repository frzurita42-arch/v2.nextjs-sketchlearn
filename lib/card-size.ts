'use client';
/* Global + per-page CARD LAYOUT size and CARD IMAGE size (persisted). One shared
 * card component means one pair of settings resizes every gallery; a page may also
 * carry its own override (the "specific" path). Layout morphs from list rows →
 * grid → a full-width feed; the image goes from hidden → small → large → full
 * 16:9 / 9:16 covers. */
import { useEffect, useState, type CSSProperties } from 'react';
import { ensureSiteSettings, readSiteSetting, writeSiteSetting, deleteSiteSetting } from '@/lib/site-settings-client';

// ── Layout size (how the cards are arranged / how wide) ──
export const CARD_SIZE_LABELS = ['List', 'Small', 'Medium', 'Large', 'Feed', 'Full'];
const LAYOUT_MAX = CARD_SIZE_LABELS.length - 1;
// ── Image size (how the picture inside the card is shown) ──
export const CARD_IMG_LABELS = ['No image', 'Small', 'Medium', 'Large', 'Cover 16:9', 'Cover 9:16'];
const IMG_MAX = CARD_IMG_LABELS.length - 1;

// Shared image-mode -> CardShell props mapping used by every card surface.
export function cardImageProps(im: number): Record<string, any> {
  return im === 0 ? { hideImage: true, gridHeight: 300 }
    : im === 1 ? { thumbHeight: 84, gridHeight: 320 }
    : im === 3 ? { thumbHeight: 160, gridHeight: 392 }
    : im === 4 ? { imageAspect: '16 / 9' }
    : im === 5 ? { imageAspect: '9 / 16' }
    : { thumbHeight: 110, gridHeight: 340 };
}

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
const readInt = (k: string) => { const v = readSiteSetting(k); return (v === null || v === '') ? null : parseInt(v, 10); };

// ── Layout ──
export function loadGlobalCardSize(): number { if (typeof window === 'undefined') return 2; ensureSiteSettings(); return clampL(readInt(GLOBAL) ?? 2); }
export function loadCardSize(page?: string): number { if (typeof window === 'undefined') return 2; ensureSiteSettings(); if (page) { const v = readInt(pageKeyOf(page)); if (v !== null) return clampL(v); } return loadGlobalCardSize(); }
export function hasPageOverride(page: string): boolean { if (typeof window === 'undefined') return false; ensureSiteSettings(); return readSiteSetting(pageKeyOf(page)) !== null; }
export function setGlobalCardSize(v: number) { if (typeof window === 'undefined') return; writeSiteSetting(GLOBAL, String(clampL(v))); emit(); }
export function setPageCardSize(page: string, v: number) { if (typeof window === 'undefined') return; writeSiteSetting(pageKeyOf(page), String(clampL(v))); emit(); }
export function clearPageCardSize(page: string) { if (typeof window === 'undefined') return; deleteSiteSetting(pageKeyOf(page)); emit(); }
export function applyCardSizeAll(v: number) { if (typeof window === 'undefined') return; writeSiteSetting(GLOBAL, String(clampL(v))); CARD_PAGES.forEach((p) => deleteSiteSetting(pageKeyOf(p.key))); emit(); }

// ── Image ──
export function loadGlobalImgSize(): number { if (typeof window === 'undefined') return 2; ensureSiteSettings(); return clampI(readInt(IMG_GLOBAL) ?? 2); }
export function loadImgSize(page?: string): number { if (typeof window === 'undefined') return 2; ensureSiteSettings(); if (page) { const v = readInt(imgKeyOf(page)); if (v !== null) return clampI(v); } return loadGlobalImgSize(); }
export function setGlobalImgSize(v: number) { if (typeof window === 'undefined') return; writeSiteSetting(IMG_GLOBAL, String(clampI(v))); emit(); }
export function setPageImgSize(page: string, v: number) { if (typeof window === 'undefined') return; writeSiteSetting(imgKeyOf(page), String(clampI(v))); emit(); }
export function clearPageImgSize(page: string) { if (typeof window === 'undefined') return; deleteSiteSetting(imgKeyOf(page)); emit(); }
export function applyImgSizeAll(v: number) { if (typeof window === 'undefined') return; writeSiteSetting(IMG_GLOBAL, String(clampI(v))); CARD_PAGES.forEach((p) => deleteSiteSetting(imgKeyOf(p.key))); emit(); }

// Live, page-aware reads.
export function useCardSize(page?: string): number {
  const [size, setSize] = useState<number>(() => loadCardSize(page));
  useEffect(() => {
    const h = () => setSize(loadCardSize(page));
    window.addEventListener('sl-card-size', h);
    window.addEventListener('sl-site-settings', h);
    ensureSiteSettings();
    h();
    return () => {
      window.removeEventListener('sl-card-size', h);
      window.removeEventListener('sl-site-settings', h);
    };
  }, [page]);
  return size;
}
export function useImgSize(page?: string): number {
  const [size, setSize] = useState<number>(() => loadImgSize(page));
  useEffect(() => {
    const h = () => setSize(loadImgSize(page));
    window.addEventListener('sl-card-size', h);
    window.addEventListener('sl-site-settings', h);
    ensureSiteSettings();
    h();
    return () => {
      window.removeEventListener('sl-card-size', h);
      window.removeEventListener('sl-site-settings', h);
    };
  }, [page]);
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
