import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { geminiEnabled, deepseekEnabled } from '@/src/config';
import { saveGeneration } from '@/src/db/persistence';
import { recentUserGames } from '@/src/db/games';
import { generateStructured } from '@/src/ai/providers';
import { buildRecommendPrompt } from '@/src/ai/prompts/coach';
import { makeFallbackRecommendation } from '@/src/slides/fallback';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Lesson/slide generation can take longer than Vercel's 10s Hobby default; allow up to
// 60s (the Hobby maximum) so activities don't get killed mid-generation.
export const maxDuration = 60;

// Map a topic/concept to a coarse area of learning for the deterministic fallback.
function guessArea(topic: string, concept: string): string {
  const t = `${topic} ${concept}`.toLowerCase();
  const table: [RegExp, string][] = [
    [/program|code|coding|software|algorithm|data structure|computer|python|javascript|\bml\b|machine learning|\bai\b/, 'Computer Science'],
    [/statistic|probabilit|regression|distribution|data analysis|econometr/, 'Statistics'],
    [/econ|market|finance|trade|gdp|supply|demand|inflation|budget/, 'Economics'],
    [/psycholog|cognitiv|behavior|neuroscience|mental/, 'Psychology'],
    [/history|histor|war|empire|revolution|ancient|medieval|civiliz/, 'History'],
    [/biolog|botany|plant|cell|genetic|ecolog|zoolog|anatomy/, 'Biology'],
    [/chemist|molecul|reaction|atom|compound|organic chem/, 'Chemistry'],
    [/physic|mechanic|thermodynam|quantum|relativity|electr|circuit|optics/, 'Physics'],
    [/engineer|construct|structural|mechanical|civil|electrical eng/, 'Engineering'],
    [/math|calculus|algebra|geometry|trigonometr|number theory|equation|theorem|proof/, 'Mathematics'],
    [/french|spanish|english|german|language|grammar|vocabular|conjugat/, 'Language'],
  ];
  for (const [re, area] of table) if (re.test(t)) return area;
  return 'General Knowledge';
}

// Deterministic (1-100) competency baseline from the score, used when the AI omits
// areaCompetency or is unavailable, so the My Stats column is always populated.
function fallbackAreaCompetency(topic: string, concept: string, correct: number, total: number) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 50;
  const score = Math.max(1, Math.min(100, pct));
  return [{ area: guessArea(topic, concept), score }];
}

function normalizeAreaCompetency(raw: any): { area: string; score: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v: any) => ({ area: String(v?.area || '').trim(), score: Math.max(1, Math.min(100, Math.round(Number(v?.score)))) }))
    .filter((v: any) => v.area && Number.isFinite(v.score))
    .slice(0, 3);
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const { topic, concept, level, correct, total, durationSec, slides = [] } = (await req.json().catch(() => ({}))) || {};
  const history = await recentUserGames(a.user.username, 12);
  if (!geminiEnabled && !deepseekEnabled) {
    const fallback = makeFallbackRecommendation({ topic, concept, level, correct, total, slides });
    fallback.areaCompetency = fallbackAreaCompetency(topic, concept, correct, total);
    saveGeneration('recommendations', crypto.randomUUID(), { username: a.user.username, topic, concept, result: fallback, fallback: true, createdAt: new Date().toISOString() });
    return NextResponse.json(fallback);
  }
  try {
    const rec = buildRecommendPrompt({ topic, concept, level, correct, total, durationSec, history, slides });
    const result = await generateStructured([
      { role: 'system', content: rec.system },
      { role: 'user', content: rec.user },
    ], { temperature: 0.7, maxTokens: 4096 });
    const questionSummary = slides.map((s: any) => String(s.question || '').trim()).filter(Boolean);
    const answerSummary = slides.map((s: any) => String(s.chosen || '').trim()).filter(Boolean);
    const normalized = {
      summary: String(result.summary || '').trim(),
      questionSummary,
      answerSummary,
      aiNotes: Array.isArray(result.aiNotes) ? result.aiNotes.map((v: any) => String(v).trim()).filter(Boolean) : [],
      recommendations: Array.isArray(result.recommendations) ? result.recommendations.map((v: any) => String(v).trim()).filter(Boolean) : [],
      nextConcepts: Array.isArray(result.nextConcepts) ? result.nextConcepts : [],
      // AI-estimated competency by area; fall back to a score derived from the result.
      areaCompetency: normalizeAreaCompetency(result.areaCompetency).length
        ? normalizeAreaCompetency(result.areaCompetency)
        : fallbackAreaCompetency(topic, concept, correct, total),
    };
    saveGeneration('recommendations', crypto.randomUUID(), { username: a.user.username, topic, concept, result: normalized, createdAt: new Date().toISOString() });
    return NextResponse.json(normalized);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
