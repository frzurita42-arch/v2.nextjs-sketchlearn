import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserPrefs, setUserPref } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// The signed-in user's saved Coach chat history, persisted in the DB (user_prefs).
// Guests are never stored here — their chats stay in the browser only.
const KEY = 'coachChats';
const MAX = 30;

// Keep each stored session lean: text + stickies, no image data-URLs.
function cleanSessions(raw: any): any[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX).map((s: any) => ({
    id: String(s?.id || '').slice(0, 60),
    title: String(s?.title || '').slice(0, 120),
    ts: Number(s?.ts) || Date.now(),
    messages: (Array.isArray(s?.messages) ? s.messages : []).slice(0, 200).map((m: any) => {
      const out: any = { role: m?.role === 'user' ? 'user' : 'assistant', content: String(m?.content || '').slice(0, 8000) };
      if (m?.sticky && typeof m.sticky === 'object') out.sticky = m.sticky;
      if (m?.imageCredit) out.imageCredit = String(m.imageCredit).slice(0, 80);
      return out;
    }),
  })).filter((s: any) => s.id && Array.isArray(s.messages) && s.messages.length);
}

export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  let sessions: any[] = [];
  try { sessions = cleanSessions((await getUserPrefs(a.user.username))?.[KEY] || []); } catch { /* none */ }
  return NextResponse.json({ sessions }, { headers: { 'Cache-Control': 'no-cache' } });
}

export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const sessions = cleanSessions(b.sessions);
  try { await setUserPref(a.user.username, KEY, sessions); } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: sessions.length });
}
