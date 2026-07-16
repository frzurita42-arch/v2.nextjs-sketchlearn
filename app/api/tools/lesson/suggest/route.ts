import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const TOPIC_POOL = [
  'summer vacation', 'travel destinations', 'daily routines', 'food and cooking', 'shopping',
  'work and careers', 'family and friends', 'hobbies', 'the weather', 'directions in the city',
  'health and the body', 'technology', 'the environment', 'celebrations and holidays', 'music and film',
];

// POST { lesson, levels, avoid } -> a recommended { level, topic, why } example
// for this lesson tool. Refreshable; AI-backed with a random-pool fallback.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const lesson = b.lesson || {};
  const subject = String(lesson.subject || 'the subject').slice(0, 80);
  // The tool's own identity, so a suggestion is a VARIATION of THIS lesson (a
  // different topic/level/tone within the same subject) — never a different tool.
  const subjectKind = String(lesson.subjectKind || '').slice(0, 30);
  const style = String(lesson.style || '').slice(0, 300);
  const toolTitle = String(b.title || lesson.title || '').slice(0, 100);
  const identity = [`This tool teaches "${subject}"`, subjectKind ? `(a ${subjectKind} lesson)` : '', toolTitle ? `titled "${toolTitle}"` : '', style ? `. Its brief: ${style}` : ''].filter(Boolean).join(' ');
  const levels: string[] = Array.isArray(b.levels) && b.levels.length ? b.levels.map(String) : ['Beginner', 'A1', 'A2', 'B1', 'B2', 'C1'];
  const avoid = String(b.avoid || '').slice(0, 200);
  const hint = String(b.hint || '').slice(0, 200);
  const count = Math.max(1, Math.min(8, parseInt(b.count, 10) || 1));

  // count > 1 -> just a list of suggested topic strings (for the create form's
  // "suggested topics" dropdown). Falls back to a shuffled pool without AI.
  if (count > 1) {
    const pool = () => [...TOPIC_POOL].sort(() => Math.random() - 0.5).slice(0, count);
    if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json({ topics: pool() });
    try {
      const r: any = await generateStructured(
        [{ role: 'system', content: `List ${count} fresh, specific, engaging topics a learner could study with a "${subject}" lesson/presentation. Make them concrete (not one-word), varied, and genuinely about ${subject}. ${avoid ? `Avoid: ${avoid}.` : ''} Return STRICT JSON.` },
         { role: 'user', content: `{ "topics": [${count} short specific topic strings] }` }],
        { temperature: 0.9, maxTokens: 300 }
      );
      const topics = (Array.isArray(r?.topics) ? r.topics : []).map((t: any) => String(t).slice(0, 90)).filter(Boolean).slice(0, count);
      return NextResponse.json({ topics: topics.length ? topics : pool() });
    } catch { return NextResponse.json({ topics: pool() }); }
  }

  const fallback = () => ({
    level: levels[Math.floor(Math.random() * levels.length)],
    topic: TOPIC_POOL[Math.floor(Math.random() * TOPIC_POOL.length)],
    why: 'A popular starting point.',
    fallback: true,
  });

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json(fallback());
  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: `${identity}. Recommend ONE fresh example RUN of THIS SAME lesson — i.e. a different way to set it up. The topic MUST be squarely about "${subject}" (a concrete sub-topic within it); NEVER drift to a different subject or a different kind of tool (no apps, no unrelated projects). Pick a level from: ${levels.join(', ')}, and a fitting tone. ${hint ? `Focus the topic on: ${hint}.` : ''} ${avoid ? `Avoid something like: ${avoid}.` : ''} Return STRICT JSON.` },
       { role: 'user', content: `{ "topic": "a specific sub-topic of ${subject}", "level": "one of the levels", "tone": "a short tone e.g. Friendly/Formal/Playful", "why": "one short reason it's worth trying" }` }],
      { temperature: 0.85, maxTokens: 300 }
    );
    const level = levels.includes(r?.level) ? r.level : (r?.level || levels[0]);
    const topic = String(r?.topic || '').slice(0, 120) || TOPIC_POOL[0];
    const tone = String(r?.tone || '').slice(0, 40);
    return NextResponse.json({ level, topic, tone, why: String(r?.why || '').slice(0, 200), fallback: false });
  } catch {
    return NextResponse.json(fallback());
  }
}
