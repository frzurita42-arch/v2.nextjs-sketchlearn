/* Per-user tool favorites (the ★). Kept in localStorage but keyed by the signed-in
 * username, so a new account — or a signed-out visitor — starts with NO favorites
 * instead of inheriting whoever used this browser last. The like is also recorded
 * server-side (via /api/tools/like) for the admin/moderator filters; this store is
 * the current user's own ★ set. Guests have none. */
import { API } from '@/lib/api';

function keyFor(): string | null {
  const u = API.user?.username;
  return u ? `sl_tool_likes:${u}` : null;   // guests → no key → no favorites
}

export function loadLikes(): Record<string, boolean> {
  const k = keyFor();
  if (!k) return {};
  try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; }
}

export function saveLikes(map: Record<string, boolean>): void {
  const k = keyFor();
  if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(map)); } catch { /* ignore */ }
}

// Convenience: is a given slug currently favorited by the signed-in user?
export function isLiked(slug: string): boolean {
  return !!loadLikes()[slug];
}
