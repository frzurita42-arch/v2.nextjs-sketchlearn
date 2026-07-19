'use client';

import { API } from '@/lib/api';

const CACHE_KEY = 'sl_site_settings';
let booted = false;

function readCache(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeCache(next: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function emitSync() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('sl-site-settings'));
  } catch {
    // ignore
  }
}

export function readSiteSetting(key: string): string | null {
  const s = readCache();
  return typeof s[key] === 'string' ? s[key] : null;
}

export function ensureSiteSettings(): void {
  if (typeof window === 'undefined' || booted) return;
  booted = true;
  API.get('/api/site-settings', { retries: 1 }).then((r: any) => {
    const settings = (r?.settings && typeof r.settings === 'object') ? r.settings : {};
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(settings)) {
      if (typeof v === 'string') next[k] = v;
    }
    writeCache(next);
    emitSync();
  }).catch(() => {
    // ignore
  });
}

export function writeSiteSetting(key: string, value: string): void {
  const next = readCache();
  next[key] = value;
  writeCache(next);
  emitSync();
  API.put('/api/site-settings', { key, value }).catch(() => {
    // ignore (optimistic cache keeps UI responsive)
  });
}

export function deleteSiteSetting(key: string): void {
  const next = readCache();
  delete next[key];
  writeCache(next);
  emitSync();
  API.call('DELETE', '/api/site-settings', { key }).catch(() => {
    // ignore (optimistic cache keeps UI responsive)
  });
}
