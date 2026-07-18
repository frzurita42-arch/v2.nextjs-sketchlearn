'use client';
/* Per-page TITLE + SUBTITLE text overrides. Page headings ship with a hard-coded
 * default (e.g. "🎞️ Slides gallery"), but each page's ✎ edit tool can rename its
 * own title/subtitle. Overrides live in localStorage and a custom event keeps every
 * mounted <PageHeading> in sync (same pattern as card-size / header-size). */
import { useEffect, useState } from 'react';

const tKey = (p: string) => `sl_page_title:${p}`;
const sKey = (p: string) => `sl_page_sub:${p}`;
const emit = () => { try { window.dispatchEvent(new CustomEvent('sl-page-text')); } catch { /* ignore */ } };
const read = (k: string): string | null => { try { const v = localStorage.getItem(k); return v && v.trim() ? v : null; } catch { return null; } };

export function loadPageTitle(page?: string): string | null { if (typeof window === 'undefined' || !page) return null; return read(tKey(page)); }
export function loadPageSub(page?: string): string | null { if (typeof window === 'undefined' || !page) return null; return read(sKey(page)); }

export function setPageTitle(page: string, text: string) { try { const t = text.trim(); if (t) localStorage.setItem(tKey(page), t.slice(0, 120)); else localStorage.removeItem(tKey(page)); emit(); } catch { /* ignore */ } }
export function setPageSub(page: string, text: string) { try { const t = text.trim(); if (t) localStorage.setItem(sKey(page), t.slice(0, 240)); else localStorage.removeItem(sKey(page)); emit(); } catch { /* ignore */ } }
export function clearPageText(page: string) { try { localStorage.removeItem(tKey(page)); localStorage.removeItem(sKey(page)); emit(); } catch { /* ignore */ } }
export function hasPageText(page?: string): boolean { if (typeof window === 'undefined' || !page) return false; return loadPageTitle(page) !== null || loadPageSub(page) !== null; }

export function usePageText(page?: string): { title: string | null; sub: string | null } {
  const [v, setV] = useState(() => ({ title: loadPageTitle(page), sub: loadPageSub(page) }));
  useEffect(() => { const h = () => setV({ title: loadPageTitle(page), sub: loadPageSub(page) }); window.addEventListener('sl-page-text', h); h(); return () => window.removeEventListener('sl-page-text', h); }, [page]);
  return v;
}
