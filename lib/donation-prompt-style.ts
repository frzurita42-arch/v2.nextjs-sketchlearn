'use client';

import { useEffect, useState } from 'react';
import { ensureSiteSettings, readSiteSetting, writeSiteSetting, deleteSiteSetting } from '@/lib/site-settings-client';

export type DonationPromptScope = 'lesson' | 'tool';

export const DONATION_PROMPT_PAGES: { key: DonationPromptScope; label: string }[] = [
  { key: 'lesson', label: 'Slide tools (presentations)' },
  { key: 'tool', label: 'Other tools (apps/repos/generators)' },
];

export const DONATION_PROMPT_SIZE_MIN = 14;
export const DONATION_PROMPT_SIZE_MAX = 34;
export const DONATION_PROMPT_SIZE_DEFAULT = 19;
export const DONATION_PROMPT_TEXT_DEFAULT = 'Please donate for more similar content';

const TEXT_KEY = 'sl_donate_text';
const SIZE_KEY = 'sl_donate_size';
const HIDE_KEY = 'sl_donate_hidden';
const textPage = (p: DonationPromptScope) => `sl_donate_text:${p}`;
const sizePage = (p: DonationPromptScope) => `sl_donate_size:${p}`;
const hidePage = (p: DonationPromptScope) => `sl_donate_hidden:${p}`;

const clampSize = (v: number) => Math.max(DONATION_PROMPT_SIZE_MIN, Math.min(DONATION_PROMPT_SIZE_MAX, isNaN(v) ? DONATION_PROMPT_SIZE_DEFAULT : v));
const readInt = (k: string) => {
  const v = readSiteSetting(k);
  return (v === null || v === '') ? null : parseInt(v, 10);
};

const emit = () => {
  try {
    window.dispatchEvent(new CustomEvent('sl-donation-prompt-style'));
  } catch {
    // ignore
  }
};

export function loadGlobalDonationPromptText(): string {
  if (typeof window === 'undefined') return DONATION_PROMPT_TEXT_DEFAULT;
  ensureSiteSettings();
  const raw = readSiteSetting(TEXT_KEY);
  return raw && raw.trim() ? raw : DONATION_PROMPT_TEXT_DEFAULT;
}

export function loadGlobalDonationPromptSize(): number {
  if (typeof window === 'undefined') return DONATION_PROMPT_SIZE_DEFAULT;
  ensureSiteSettings();
  return clampSize(readInt(SIZE_KEY) ?? DONATION_PROMPT_SIZE_DEFAULT);
}

export function loadGlobalDonationPromptHidden(): boolean {
  if (typeof window === 'undefined') return false;
  ensureSiteSettings();
  return readSiteSetting(HIDE_KEY) === '1';
}

export function loadDonationPromptStyle(scope?: DonationPromptScope): { text: string; size: number; hidden: boolean } {
  if (typeof window === 'undefined') return { text: DONATION_PROMPT_TEXT_DEFAULT, size: DONATION_PROMPT_SIZE_DEFAULT, hidden: false };
  ensureSiteSettings();
  let text = loadGlobalDonationPromptText();
  let size = loadGlobalDonationPromptSize();
  let hidden = loadGlobalDonationPromptHidden();
  if (scope) {
    const t = readSiteSetting(textPage(scope));
    if (t !== null && t.trim()) text = t;
    const s = readInt(sizePage(scope));
    if (s !== null) size = clampSize(s);
    const h = readSiteSetting(hidePage(scope));
    if (h !== null && h !== '') hidden = h === '1';
  }
  return { text, size, hidden };
}

export function applyDonationPromptAll(text: string, size: number, hidden: boolean): void {
  if (typeof window === 'undefined') return;
  const nextText = text.trim() || DONATION_PROMPT_TEXT_DEFAULT;
  writeSiteSetting(TEXT_KEY, nextText);
  writeSiteSetting(SIZE_KEY, String(clampSize(size)));
  writeSiteSetting(HIDE_KEY, hidden ? '1' : '0');
  DONATION_PROMPT_PAGES.forEach((p) => {
    deleteSiteSetting(textPage(p.key));
    deleteSiteSetting(sizePage(p.key));
    deleteSiteSetting(hidePage(p.key));
  });
  emit();
}

export function setDonationPromptPage(scope: DonationPromptScope, text: string, size: number, hidden: boolean): void {
  if (typeof window === 'undefined') return;
  const nextText = text.trim() || DONATION_PROMPT_TEXT_DEFAULT;
  writeSiteSetting(textPage(scope), nextText);
  writeSiteSetting(sizePage(scope), String(clampSize(size)));
  writeSiteSetting(hidePage(scope), hidden ? '1' : '0');
  emit();
}

export function clearDonationPromptPage(scope: DonationPromptScope): void {
  if (typeof window === 'undefined') return;
  deleteSiteSetting(textPage(scope));
  deleteSiteSetting(sizePage(scope));
  deleteSiteSetting(hidePage(scope));
  emit();
}

export function hasDonationPromptOverride(scope: DonationPromptScope): boolean {
  if (typeof window === 'undefined') return false;
  ensureSiteSettings();
  return readSiteSetting(textPage(scope)) !== null || readSiteSetting(sizePage(scope)) !== null || readSiteSetting(hidePage(scope)) !== null;
}

export function useDonationPromptStyle(scope?: DonationPromptScope): { text: string; size: number; hidden: boolean } {
  const [v, setV] = useState(() => loadDonationPromptStyle(scope));
  useEffect(() => {
    const h = () => setV(loadDonationPromptStyle(scope));
    window.addEventListener('sl-donation-prompt-style', h);
    window.addEventListener('sl-site-settings', h);
    ensureSiteSettings();
    h();
    return () => {
      window.removeEventListener('sl-donation-prompt-style', h);
      window.removeEventListener('sl-site-settings', h);
    };
  }, [scope]);
  return v;
}
