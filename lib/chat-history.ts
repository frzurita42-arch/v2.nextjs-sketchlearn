/* Per-user coach chat history. Each visit to the Coach opens a FRESH chat; the
 * previous one is archived here so the sidebar can list past chats and reopen
 * them. Stored in localStorage, keyed by username (guests get their own bucket).
 * Image data-URLs are stripped from archived messages to stay under the storage
 * quota — the transcript and any sticky-note links are what we keep. */
import type { ChatMessage } from '@/lib/app-state';

export type Sticky = { slug: string; title: string; kind: string; runCost: number; reason?: string; recommended?: boolean; free?: boolean; page?: string; view?: string; emoji?: string; access?: 'free' | 'paid'; url?: string; thumb?: string; channel?: string };
export type ChatMsg = ChatMessage & { images?: string[]; sticky?: Sticky; building?: boolean; imageCredit?: string; textCredit?: string; polaroid?: boolean; caption?: string };
export type ChatSession = { id: string; title: string; ts: number; messages: ChatMsg[] };

const MAX_SESSIONS = 30;
const key = (username?: string | null) => `sl_chat_sessions:${username || 'guest'}`;

export function newSessionId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function titleFor(messages: ChatMsg[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.content && m.content !== '(shared an image)');
  const t = (firstUser?.content || '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > 40 ? t.slice(0, 40) + '…' : t) : 'New chat';
}

// A session is worth keeping once the learner has actually said something.
export function hasContent(messages: ChatMsg[]): boolean {
  return messages.some((m) => m.role === 'user');
}

export function loadSessions(username?: string | null): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key(username));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function strip(messages: ChatMsg[]): ChatMsg[] {
  // Drop transient build placeholders + heavy inline data: image URLs (they blow the
  // storage quota), but KEEP lightweight hosted image URLs (blob/http) so generated
  // pictures survive when a chat is reopened from history. Text + stickies are kept.
  return messages
    .filter((m) => !m.building)
    .map(({ images, building, ...rest }) => {
      const keep = Array.isArray(images) ? images.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)) : [];
      return keep.length ? { ...rest, images: keep } : rest;
    });
}

export function saveSession(username: string | null | undefined, session: ChatSession): ChatSession[] {
  if (typeof window === 'undefined') return [];
  if (!hasContent(session.messages)) return loadSessions(username);
  const clean: ChatSession = { ...session, title: titleFor(session.messages), messages: strip(session.messages) };
  const rest = loadSessions(username).filter((s) => s.id !== clean.id);
  const next = [clean, ...rest].slice(0, MAX_SESSIONS);
  try { window.localStorage.setItem(key(username), JSON.stringify(next)); } catch { /* quota — ignore */ }
  return next;
}

export function deleteSession(username: string | null | undefined, id: string): ChatSession[] {
  if (typeof window === 'undefined') return [];
  const next = loadSessions(username).filter((s) => s.id !== id);
  try { window.localStorage.setItem(key(username), JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
