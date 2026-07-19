'use client';
/* Global + per-page HEADER sizes: the page title and subtitle font-size. Same
 * pattern as card-size — a shared <PageHeading> reads these, the Settings page sets
 * them universally, and each page's title carries its own inline resize tool. */
import { useEffect, useState } from 'react';
import { ensureSiteSettings, readSiteSetting, writeSiteSetting, deleteSiteSetting } from '@/lib/site-settings-client';

export const TITLE_MIN = 18, TITLE_MAX = 54, TITLE_DEFAULT = 30;
export const SUB_MIN = 10, SUB_MAX = 24, SUB_DEFAULT = 14;

const TKEY = 'sl_title_size', SKEY = 'sl_sub_size';
const tPage = (p: string) => `sl_title_size:${p}`;
const sPage = (p: string) => `sl_sub_size:${p}`;
export const HEADER_PAGES = [
  { key: 'slides', label: 'Slides' }, { key: 'tools', label: 'Repos' }, { key: 'presrun', label: 'Presentation runs' },
  { key: 'moderators', label: 'Moderators' }, { key: 'users', label: 'Users' }, { key: 'sandbox', label: 'Sandbox' },
  { key: 'empty', label: 'Empty' }, { key: 'appsettings', label: 'Settings' },
];

const clampT = (v: number) => Math.max(TITLE_MIN, Math.min(TITLE_MAX, isNaN(v) ? TITLE_DEFAULT : v));
const clampS = (v: number) => Math.max(SUB_MIN, Math.min(SUB_MAX, isNaN(v) ? SUB_DEFAULT : v));
const emit = () => { try { window.dispatchEvent(new CustomEvent('sl-header-size')); } catch { /* ignore */ } };
const readInt = (k: string) => { const v = readSiteSetting(k); return (v === null || v === '') ? null : parseInt(v, 10); };

export function loadGlobalTitleSize(): number { if (typeof window === 'undefined') return TITLE_DEFAULT; ensureSiteSettings(); return clampT(readInt(TKEY) ?? TITLE_DEFAULT); }
export function loadGlobalSubSize(): number { if (typeof window === 'undefined') return SUB_DEFAULT; ensureSiteSettings(); return clampS(readInt(SKEY) ?? SUB_DEFAULT); }
export function loadTitleSize(page?: string): number { if (typeof window === 'undefined') return TITLE_DEFAULT; ensureSiteSettings(); if (page) { const v = readInt(tPage(page)); if (v !== null) return clampT(v); } return loadGlobalTitleSize(); }
export function loadSubSize(page?: string): number { if (typeof window === 'undefined') return SUB_DEFAULT; ensureSiteSettings(); if (page) { const v = readInt(sPage(page)); if (v !== null) return clampS(v); } return loadGlobalSubSize(); }
export function hasHeaderOverride(page: string): boolean { if (typeof window === 'undefined') return false; ensureSiteSettings(); return readSiteSetting(tPage(page)) !== null || readSiteSetting(sPage(page)) !== null; }

export function setPageTitleSize(page: string, v: number) { if (typeof window === 'undefined') return; writeSiteSetting(tPage(page), String(clampT(v))); emit(); }
export function setPageSubSize(page: string, v: number) { if (typeof window === 'undefined') return; writeSiteSetting(sPage(page), String(clampS(v))); emit(); }
export function clearPageHeader(page: string) { if (typeof window === 'undefined') return; deleteSiteSetting(tPage(page)); deleteSiteSetting(sPage(page)); emit(); }
export function applyHeaderAll(title: number, sub: number) {
  if (typeof window === 'undefined') return;
  writeSiteSetting(TKEY, String(clampT(title)));
  writeSiteSetting(SKEY, String(clampS(sub)));
  HEADER_PAGES.forEach((p) => { deleteSiteSetting(tPage(p.key)); deleteSiteSetting(sPage(p.key)); });
  emit();
}

export function useHeaderSize(page?: string): { title: number; sub: number } {
  const [v, setV] = useState(() => ({ title: loadTitleSize(page), sub: loadSubSize(page) }));
  useEffect(() => {
    const h = () => setV({ title: loadTitleSize(page), sub: loadSubSize(page) });
    window.addEventListener('sl-header-size', h);
    window.addEventListener('sl-site-settings', h);
    ensureSiteSettings();
    h();
    return () => {
      window.removeEventListener('sl-header-size', h);
      window.removeEventListener('sl-site-settings', h);
    };
  }, [page]);
  return v;
}
