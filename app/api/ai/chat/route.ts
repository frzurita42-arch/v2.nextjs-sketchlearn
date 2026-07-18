import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { readJSON } from '@/src/db/persistence';
import { generateText } from '@/src/ai/providers';
import { buildCoachChatSystem } from '@/src/ai/prompts/coach';
import { makeFallbackCoachReply } from '@/src/slides/fallback';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Lesson/slide generation can take longer than Vercel's 10s Hobby default; allow up to
// 60s (the Hobby maximum) so activities don't get killed mid-generation.
export const maxDuration = 60;

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const { messages = [], recentChats = [] } = (await req.json().catch(() => ({}))) || {};
  const games = readJSON('games.json', []).filter((g: any) => g.username === a.user.username);
  const progress = games.slice(-20).map((g: any) => ({
    date: g.finishedAt, topic: g.topic, concept: g.concept, level: g.level,
    score: `${g.correct}/${g.total}`, durationSec: g.durationSec,
  }));
  // What this learner has built/played, so the coach avoids repeats and builds on interests.
  let tools: any[] = [];
  try {
    const all = await listTools({ viewer: a.user.username, includePrivateFor: a.user.username, limit: 60 });
    tools = (Array.isArray(all) ? all : [])
      .filter((t: any) => t.owner === a.user.username)
      .slice(0, 20)
      .map((t: any) => ({ title: t.title, archetype: t.archetype }));
  } catch { /* context is best-effort */ }
  const chats = Array.isArray(recentChats) ? recentChats.filter((s: any) => typeof s === 'string').slice(0, 12) : [];
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ reply: makeFallbackCoachReply(progress) });
  }
  try {
    const reply = await generateText([
      { role: 'system', content: buildCoachChatSystem({ progress, username: a.user.username, tools, recentChats: chats }) },
      ...messages.slice(-16).map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 4000) })),
    ], { json: false, temperature: 0.8, maxTokens: 800 });
    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
