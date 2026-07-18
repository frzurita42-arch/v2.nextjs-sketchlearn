'use client';
/* Global + per-page HEADER sizes: the page title and subtitle font-size. Same
 * pattern as card-size — a shared <PageHeading> reads these, the Settings page sets
 * them universally, and each page's title carries its own inline resize tool. */
import { useEffect, useState } from 'react';

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
const readInt = (k: string) => { try { const v = localStorage.getItem(k); return v === null ? null : parseInt(v, 10); } catch { return null; } };

export function loadGlobalTitleSize(): number { if (typeof window === 'undefined') return TITLE_DEFAULT; return clampT(readInt(TKEY) ?? TITLE_DEFAULT); }
export function loadGlobalSubSize(): number { if (typeof window === 'undefined') return SUB_DEFAULT; return clampS(readInt(SKEY) ?? SUB_DEFAULT); }
export function loadTitleSize(page?: string): number { if (typeof window === 'undefined') return TITLE_DEFAULT; if (page) { const v = readInt(tPage(page)); if (v !== null) return clampT(v); } return loadGlobalTitleSize(); }
export function loadSubSize(page?: string): number { if (typeof window === 'undefined') return SUB_DEFAULT; if (page) { const v = readInt(sPage(page)); if (v !== null) return clampS(v); } return loadGlobalSubSize(); }
export function hasHeaderOverride(page: string): boolean { if (typeof window === 'undefined') return false; try { return localStorage.getItem(tPage(page)) !== null || localStorage.getItem(sPage(page)) !== null; } catch { return false; } }

export function setPageTitleSize(page: string, v: number) { try { localStorage.setItem(tPage(page), String(clampT(v))); emit(); } catch { /* ignore */ } }
export function setPageSubSize(page: string, v: number) { try { localStorage.setItem(sPage(page), String(clampS(v))); emit(); } catch { /* ignore */ } }
export function clearPageHeader(page: string) { try { localStorage.removeItem(tPage(page)); localStorage.removeItem(sPage(page)); emit(); } catch { /* ignore */ } }
export function applyHeaderAll(title: number, sub: number) {
  try { localStorage.setItem(TKEY, String(clampT(title))); localStorage.setItem(SKEY, String(clampS(sub))); HEADER_PAGES.forEach((p) => { localStorage.removeItem(tPage(p.key)); localStorage.removeItem(sPage(p.key)); }); emit(); } catch { /* ignore */ }
}

export function useHeaderSize(page?: string): { title: number; sub: number } {
  const [v, setV] = useState(() => ({ title: loadTitleSize(page), sub: loadSubSize(page) }));
  useEffect(() => { const h = () => setV({ title: loadTitleSize(page), sub: loadSubSize(page) }); window.addEventListener('sl-header-size', h); h(); return () => window.removeEventListener('sl-header-size', h); }, [page]);
  return v;
}
