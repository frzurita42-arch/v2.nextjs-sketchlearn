'use client';
/* The site's instruction BANNER (the wooden "how to use it" board) text: a title +
 * body. Stored global OR per-page (localStorage), same pattern as card/header sizes
 * so it can be applied to every page or customised per page. Empty = no banner. */
import { useEffect, useState } from 'react';

// A ready-made suggestion the Settings editor seeds with (not applied until saved).
export const BANNER_SUGGEST = {
  title: 'How SketchLearn works',
  body: 'Tell the ChatBot what you want to learn — it helps you build a lesson or repo. Browse the galleries, open a tool to play it, and watch your progress grow. Tap 🎨 to picture an idea or 📺 for videos.',
};
export const BANNER_SIZE_MIN = 12, BANNER_SIZE_MAX = 28, BANNER_SIZE_DEFAULT = 16;

const gTitle = 'sl_banner_title', gBody = 'sl_banner_body', gSize = 'sl_banner_size';
const pTitle = (p: string) => `sl_banner_title:${p}`;
const pBody = (p: string) => `sl_banner_body:${p}`;
const pSize = (p: string) => `sl_banner_size:${p}`;
const emit = () => { try { window.dispatchEvent(new CustomEvent('sl-banner-text')); } catch { /* ignore */ } };
const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const clampSize = (v: number) => Math.max(BANNER_SIZE_MIN, Math.min(BANNER_SIZE_MAX, isNaN(v) ? BANNER_SIZE_DEFAULT : v));

export function loadBanner(page?: string): { title: string; body: string; size: number } {
  if (typeof window === 'undefined') return { title: '', body: '', size: BANNER_SIZE_DEFAULT };
  let t: string | null = null, b: string | null = null, s: string | null = null;
  if (page) { t = read(pTitle(page)); b = read(pBody(page)); s = read(pSize(page)); }
  if (t === null) t = read(gTitle);
  if (b === null) b = read(gBody);
  if (s === null) s = read(gSize);
  return { title: t || '', body: b || '', size: s === null ? BANNER_SIZE_DEFAULT : clampSize(parseInt(s, 10)) };
}
export function hasBannerOverride(page: string): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(pTitle(page)) !== null || localStorage.getItem(pBody(page)) !== null || localStorage.getItem(pSize(page)) !== null; } catch { return false; }
}
export function setPageBanner(page: string, title: string, body: string, size: number) { try { localStorage.setItem(pTitle(page), title); localStorage.setItem(pBody(page), body); localStorage.setItem(pSize(page), String(clampSize(size))); emit(); } catch { /* ignore */ } }
export function clearPageBanner(page: string) { try { localStorage.removeItem(pTitle(page)); localStorage.removeItem(pBody(page)); localStorage.removeItem(pSize(page)); emit(); } catch { /* ignore */ } }
export function applyBannerAll(title: string, body: string, size: number) { try { localStorage.setItem(gTitle, title); localStorage.setItem(gBody, body); localStorage.setItem(gSize, String(clampSize(size))); emit(); } catch { /* ignore */ } }

export function useBanner(page?: string): { title: string; body: string; size: number } {
  const [v, setV] = useState(() => loadBanner(page));
  useEffect(() => { const h = () => setV(loadBanner(page)); window.addEventListener('sl-banner-text', h); h(); return () => window.removeEventListener('sl-banner-text', h); }, [page]);
  return v;
}
