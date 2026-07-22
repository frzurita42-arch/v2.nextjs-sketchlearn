'use client';
/* The ChatBot's prompt-behavior settings (persisted in localStorage). These
 * structure the system prompt: brevity, tone, emoji use, max length, how often it
 * offers page sticky-notes and which types, plus a UI-only toolbar icon size. */
import { useEffect, useState } from 'react';

export type PromptSettings = {
  brevity: number;        // 0 terse .. 4 detailed
  tone: string;           // stale|neutral|friendly|encouraging|humorous|socratic
  emoji: boolean;
  maxWords: number;       // response length cap
  stickyFreq: number;     // 0 never .. 4 always — how often it offers a page sticky
  stickyTypes: string[];  // which page sticky types it may offer
  interactivity: number;  // 0 direct .. 4 exploratory — how much it converses before recommending
  toolbarIcon: number;    // 0..4 — size of the chat toolbar icons (UI only)
};

export const STICKY_TYPES = [
  { key: 'slides', label: 'Slides' }, { key: 'repos', label: 'Repos' },
  { key: 'moderators', label: 'Moderators' }, { key: 'dashboard', label: 'Dashboard' },
];
export const TONES = [
  { key: 'stale', label: 'Stale — no emotion' }, { key: 'neutral', label: 'Neutral' },
  { key: 'friendly', label: 'Friendly' }, { key: 'encouraging', label: 'Encouraging' },
  { key: 'humorous', label: 'Humorous' }, { key: 'socratic', label: 'Socratic' },
];
export const BREVITY_LABELS = ['Terse', 'Short', 'Medium', 'Longer', 'Detailed'];
export const FREQ_LABELS = ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'];
export const INTERACTIVITY_LABELS = ['Direct', 'Focused', 'Balanced', 'Conversational', 'Exploratory'];
export const ICON_LABELS = ['XS', 'S', 'M', 'L', 'XL'];
export const ICON_PX = [14, 16, 18, 22, 26];

const KEY = 'sl_prompt_settings';
export const DEFAULTS: PromptSettings = { brevity: 1, tone: 'stale', emoji: false, maxWords: 80, stickyFreq: 1, stickyTypes: STICKY_TYPES.map((s) => s.key), interactivity: 2, toolbarIcon: 2 };

export function loadPromptSettings(): PromptSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) }; } catch { return DEFAULTS; }
}
export function savePromptSettings(s: PromptSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); window.dispatchEvent(new CustomEvent('sl-prompt-settings')); } catch { /* ignore */ }
}
export function usePromptSettings(): [PromptSettings, (patch: Partial<PromptSettings>) => void] {
  const [s, setS] = useState<PromptSettings>(() => loadPromptSettings());
  useEffect(() => { const h = () => setS(loadPromptSettings()); window.addEventListener('sl-prompt-settings', h); return () => window.removeEventListener('sl-prompt-settings', h); }, []);
  const update = (patch: Partial<PromptSettings>) => { const next = { ...loadPromptSettings(), ...patch }; savePromptSettings(next); setS(next); };
  return [s, update];
}
