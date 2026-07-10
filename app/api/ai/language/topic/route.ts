import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { buildLanguageTopicPrompt } from '@/src/ai/prompts/language';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const FALLBACK_THEMES = ['Food', 'Travel', 'Family', 'Summer vibes', 'City life', 'Sports', 'Festivals', 'Weather', 'Shopping', 'Music', 'Animals', 'Daily routine'];

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const { language = 'Spanish', level = 'A1', avoid = [] } = (await req.json().catch(() => ({}))) || {};
  const pick = () => FALLBACK_THEMES[Math.floor(Math.random() * FALLBACK_THEMES.length)];

  if (!geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ topic: pick() });
  }
  try {
    const p = buildLanguageTopicPrompt({ language, level, avoid });
    const r = await generateStructured(
      [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
      { temperature: 0.9, maxTokens: 120 }
    );
    const topic = String(r?.topic || '').trim();
    return NextResponse.json({ topic: topic || pick() });
  } catch {
    return NextResponse.json({ topic: pick() });
  }
}
