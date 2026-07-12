import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { buildGrammarTopicsPrompt } from '@/src/ai/prompts/language';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Level-appropriate generic fallbacks so the dropdown always has 10 options.
function fallbackTopics(level: string): string[] {
  const basic = ['The alphabet & sounds', 'Essential greetings', 'Numbers 0-20', 'Personal pronouns', 'To be (present)', 'Articles a/the', 'Simple nouns & gender', 'Yes/no questions', 'Basic adjectives', 'Days & months'];
  const mid = ['Present tense verbs', 'Past tense basics', 'Future with "going to"', 'Possessives', 'Prepositions of place', 'Comparatives', 'Question words', 'Negation', 'Common connectors', 'Reflexive verbs'];
  const high = ['Subjunctive mood', 'Conditional sentences', 'Passive voice', 'Relative clauses', 'Reported speech', 'Perfect tenses', 'Idiomatic prepositions', 'Discourse markers', 'Register & formality', 'Nuanced modality'];
  if (['Zero', 'Beginner', 'A1'].includes(level)) return basic;
  if (['A2', 'B1'].includes(level)) return mid;
  return high;
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const { language = 'Spanish', level = 'A1' } = (await req.json().catch(() => ({}))) || {};

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ topics: fallbackTopics(level) });
  }
  try {
    const p = buildGrammarTopicsPrompt({ language, level });
    const r = await generateStructured(
      [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
      { temperature: 0.6, maxTokens: 700 }
    );
    const topics = (Array.isArray(r?.topics) ? r.topics : [])
      .map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 10);
    return NextResponse.json({ topics: topics.length ? topics : fallbackTopics(level) });
  } catch {
    return NextResponse.json({ topics: fallbackTopics(level) });
  }
}
