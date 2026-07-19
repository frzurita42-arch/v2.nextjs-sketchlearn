'use client';
import { useEffect, useState } from 'react';
import { ensureSiteSettings, readSiteSetting, writeSiteSetting, deleteSiteSetting } from '@/lib/site-settings-client';

export const TOOL_HEADER_FONTS = [
  { id: 'title', label: 'Title serif', css: 'var(--font-title)' },
  { id: 'hand', label: 'Handwritten', css: 'var(--font-hand)' },
  { id: 'georgia', label: 'Classic serif', css: 'Georgia, serif' },
  { id: 'sans', label: 'Clean sans', css: 'ui-sans-serif, system-ui, sans-serif' },
] as const;

export type ToolHeaderScope = 'lesson' | 'tool';

export const TOOL_HEADER_PAGES: { key: ToolHeaderScope; label: string }[] = [
  { key: 'lesson', label: 'Slide tools (presentations)' },
  { key: 'tool', label: 'Other tools (apps/repos/generators)' },
];

export const TOOL_HEADER_SIZE_MIN = 28;
export const TOOL_HEADER_SIZE_MAX = 72;
export const TOOL_HEADER_SIZE_DEFAULT = 56;

const SIZE_KEY = 'sl_tool_header_size';
const FONT_KEY = 'sl_tool_header_font';
const UNDER_KEY = 'sl_tool_header_under';
const sizePage = (p: ToolHeaderScope) => `sl_tool_header_size:${p}`;
const fontPage = (p: ToolHeaderScope) => `sl_tool_header_font:${p}`;
const underPage = (p: ToolHeaderScope) => `sl_tool_header_under:${p}`;

const clampSize = (v: number) => Math.max(TOOL_HEADER_SIZE_MIN, Math.min(TOOL_HEADER_SIZE_MAX, isNaN(v) ? TOOL_HEADER_SIZE_DEFAULT : v));
const readInt = (k: string) => {
  const v = readSiteSetting(k);
  return (v === null || v === '') ? null : parseInt(v, 10);
};
const emit = () => {
  try {
    window.dispatchEvent(new CustomEvent('sl-tool-header-style'));
  } catch {
    // ignore
  }
};

const normFont = (id: string | null | undefined): string => {
  if (!id) return 'title';
  return TOOL_HEADER_FONTS.some((f) => f.id === id) ? id : 'title';
};

export function loadGlobalToolHeaderSize(): number {
  if (typeof window === 'undefined') return TOOL_HEADER_SIZE_DEFAULT;
  ensureSiteSettings();
  return clampSize(readInt(SIZE_KEY) ?? TOOL_HEADER_SIZE_DEFAULT);
}

export function loadGlobalToolHeaderFont(): string {
  if (typeof window === 'undefined') return 'title';
  ensureSiteSettings();
  return normFont(readSiteSetting(FONT_KEY));
}

export function loadGlobalToolHeaderUnderline(): boolean {
  if (typeof window === 'undefined') return true;
  ensureSiteSettings();
  return readSiteSetting(UNDER_KEY) !== '0';
}

export function loadToolHeaderStyle(scope?: ToolHeaderScope): { size: number; font: string; underline: boolean } {
  if (typeof window === 'undefined') return { size: TOOL_HEADER_SIZE_DEFAULT, font: 'title', underline: true };
  ensureSiteSettings();
  let size = loadGlobalToolHeaderSize();
  let font = loadGlobalToolHeaderFont();
  let underline = loadGlobalToolHeaderUnderline();
  if (scope) {
    const sv = readInt(sizePage(scope));
    if (sv !== null) size = clampSize(sv);
    const fv = readSiteSetting(fontPage(scope));
    if (fv !== null && fv !== '') font = normFont(fv);
    const uv = readSiteSetting(underPage(scope));
    if (uv !== null && uv !== '') underline = uv !== '0';
  }
  return { size, font, underline };
}

export function setToolHeaderPage(scope: ToolHeaderScope, size: number, font: string, underline: boolean) {
  if (typeof window === 'undefined') return;
  writeSiteSetting(sizePage(scope), String(clampSize(size)));
  writeSiteSetting(fontPage(scope), normFont(font));
  writeSiteSetting(underPage(scope), underline ? '1' : '0');
  emit();
}

export function clearToolHeaderPage(scope: ToolHeaderScope) {
  if (typeof window === 'undefined') return;
  deleteSiteSetting(sizePage(scope));
  deleteSiteSetting(fontPage(scope));
  deleteSiteSetting(underPage(scope));
  emit();
}

export function applyToolHeaderAll(size: number, font: string, underline: boolean) {
  if (typeof window === 'undefined') return;
  writeSiteSetting(SIZE_KEY, String(clampSize(size)));
  writeSiteSetting(FONT_KEY, normFont(font));
  writeSiteSetting(UNDER_KEY, underline ? '1' : '0');
  TOOL_HEADER_PAGES.forEach((p) => {
    deleteSiteSetting(sizePage(p.key));
    deleteSiteSetting(fontPage(p.key));
    deleteSiteSetting(underPage(p.key));
  });
  emit();
}

export function hasToolHeaderOverride(scope: ToolHeaderScope): boolean {
  if (typeof window === 'undefined') return false;
  ensureSiteSettings();
  return readSiteSetting(sizePage(scope)) !== null || readSiteSetting(fontPage(scope)) !== null || readSiteSetting(underPage(scope)) !== null;
}

export function useToolHeaderStyle(scope?: ToolHeaderScope): { size: number; font: string; fontCss: string; underline: boolean } {
  const [v, setV] = useState(() => loadToolHeaderStyle(scope));
  useEffect(() => {
    const h = () => setV(loadToolHeaderStyle(scope));
    window.addEventListener('sl-tool-header-style', h);
    window.addEventListener('sl-site-settings', h);
    ensureSiteSettings();
    h();
    return () => {
      window.removeEventListener('sl-tool-header-style', h);
      window.removeEventListener('sl-site-settings', h);
    };
  }, [scope]);
  const fontCss = TOOL_HEADER_FONTS.find((f) => f.id === v.font)?.css || TOOL_HEADER_FONTS[0].css;
  return { size: v.size, font: v.font, fontCss, underline: v.underline };
}
