/* Client-side activity logging + "remember the last preset" helpers.
 *
 * logActivity() fire-and-forgets an event to /api/activity (navigation, a filter
 * chosen, a setting changed old→new). It never throws or blocks the UI.
 *
 * rememberPreset()/recallPreset() persist a control's last value in localStorage
 * so a page reopens on the same tab / filter / setting it was left on. */
import { API } from '@/lib/api';

export function logActivity(action: string, target = '', detail: Record<string, any> = {}): void {
  try {
    // Fire-and-forget: analytics must never interrupt the user's action.
    void API.post('/api/activity', { action, target, detail }).catch(() => { /* ignore */ });
  } catch { /* ignore */ }
}

const KEY = (k: string) => `sl_preset_${k}`;

export function rememberPreset(key: string, value: string): void {
  try { localStorage.setItem(KEY(key), value); } catch { /* ignore */ }
}

export function recallPreset(key: string, fallback = ''): string {
  try { const v = localStorage.getItem(KEY(key)); return v == null ? fallback : v; } catch { return fallback; }
}
