import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { readJSON } from '@/src/db/persistence';
import { buildCoachChatSystem } from '@/src/ai/prompts/coach';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Returns the EXACT system prompt the coach chat is given, assembled from the same
 * pieces the /api/ai/chat route uses (the platform instructions + the caller's saved
 * ChatBot settings + a compact view of their progress/tools). Read-only — it lets the
 * settings screen SHOW how the chat is instructed to reply. */
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const { promptSettings = null, recentChats = [] } = (await req.json().catch(() => ({}))) || {};

  const games = readJSON('games.json', []).filter((g: any) => g.username === a.user.username);
  const progress = games.slice(-20).map((g: any) => ({
    date: g.finishedAt, topic: g.topic, concept: g.concept, level: g.level,
    score: `${g.correct}/${g.total}`, durationSec: g.durationSec,
  }));
  let tools: any[] = [];
  try {
    const all = await listTools({ viewer: a.user.username, includePrivateFor: a.user.username, limit: 60 });
    tools = (Array.isArray(all) ? all : [])
      .filter((t: any) => t.owner === a.user.username)
      .slice(0, 20)
      .map((t: any) => ({ title: t.title, archetype: t.archetype }));
  } catch { /* best effort */ }
  const chats = Array.isArray(recentChats) ? recentChats.filter((x: any) => typeof x === 'string').slice(0, 12) : [];

  const system = buildCoachChatSystem({ progress, username: a.user.username, tools, recentChats: chats, settings: promptSettings });
  return NextResponse.json({ system }, { headers: { 'Cache-Control': 'no-cache' } });
}
