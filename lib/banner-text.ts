'use client';
/* The site's instruction BANNER (the wooden "how to use it" board) text: a title +
 * body. Stored global OR per-page (localStorage), same pattern as card/header sizes
 * so it can be applied to every page or customised per page. Empty = no banner. */
import { useEffect, useState } from 'react';
import { ensureSiteSettings, readSiteSetting, writeSiteSetting, deleteSiteSetting } from '@/lib/site-settings-client';

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
const read = (k: string): string | null => readSiteSetting(k);
const clampSize = (v: number) => Math.max(BANNER_SIZE_MIN, Math.min(BANNER_SIZE_MAX, isNaN(v) ? BANNER_SIZE_DEFAULT : v));

export function loadBanner(page?: string): { title: string; body: string; size: number } {
  if (typeof window === 'undefined') return { title: '', body: '', size: BANNER_SIZE_DEFAULT };
  ensureSiteSettings();
  let t: string | null = null, b: string | null = null, s: string | null = null;
  if (page) { t = read(pTitle(page)); b = read(pBody(page)); s = read(pSize(page)); }
  if (t === '') t = null;
  if (b === '') b = null;
  if (s === '') s = null;
  if (t === null) t = read(gTitle);
  if (b === null) b = read(gBody);
  if (s === null) s = read(gSize);
  return { title: t || '', body: b || '', size: s === null ? BANNER_SIZE_DEFAULT : clampSize(parseInt(s, 10)) };
}
export function hasBannerOverride(page: string): boolean {
  if (typeof window === 'undefined') return false;
  ensureSiteSettings();
  return read(pTitle(page)) !== null || read(pBody(page)) !== null || read(pSize(page)) !== null;
}
export function setPageBanner(page: string, title: string, body: string, size: number) {
  if (typeof window === 'undefined') return;
  writeSiteSetting(pTitle(page), title);
  writeSiteSetting(pBody(page), body);
  writeSiteSetting(pSize(page), String(clampSize(size)));
  emit();
}
export function clearPageBanner(page: string) {
  if (typeof window === 'undefined') return;
  deleteSiteSetting(pTitle(page));
  deleteSiteSetting(pBody(page));
  deleteSiteSetting(pSize(page));
  emit();
}
export function applyBannerAll(title: string, body: string, size: number) {
  if (typeof window === 'undefined') return;
  writeSiteSetting(gTitle, title);
  writeSiteSetting(gBody, body);
  writeSiteSetting(gSize, String(clampSize(size)));
  emit();
}

export function useBanner(page?: string): { title: string; body: string; size: number } {
  const [v, setV] = useState(() => loadBanner(page));
  useEffect(() => {
    const h = () => setV(loadBanner(page));
    window.addEventListener('sl-banner-text', h);
    window.addEventListener('sl-site-settings', h);
    ensureSiteSettings();
    h();
    return () => {
      window.removeEventListener('sl-banner-text', h);
      window.removeEventListener('sl-site-settings', h);
    };
  }, [page]);
  return v;
}
