import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateText } from '@/src/ai/providers';
import { buildAnswerNotePrompt } from '@/src/ai/prompts/coach';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Fast per-answer note; well under Vercel's limit, but allow headroom on cold starts.
export const maxDuration = 60;

/* One short coach note per answered question. Generated incrementally DURING the
 * lesson so the end-of-lesson report always has coach notes even if the final
 * recommendation call is slow — the notes never depend on that one big call. */
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const { topic = '', concept = '', level = '', question = '', chosen = '', correct = false, misconception = '', index, total, priorAnswers = [] } = b;

  const fallback = correct
    ? `Answered "${String(question).slice(0, 60)}" correctly — shows a solid grasp of ${concept || topic}.`
    : `Missed "${String(question).slice(0, 60)}"${misconception ? ` — watch for: ${misconception}` : ''}; review this part of ${concept || topic}.`;

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ note: fallback });
  }
  try {
    const p = buildAnswerNotePrompt({ topic, concept, level, question, chosen, correct, misconception, index, total, priorAnswers });
    const note = await generateText(
      [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
      { json: false, temperature: 0.5, maxTokens: 120 }
    );
    const clean = String(note || '').trim().replace(/^["']|["']$/g, '');
    return NextResponse.json({ note: clean || fallback });
  } catch {
    // Never fail the lesson over a note — return the deterministic fallback.
    return NextResponse.json({ note: fallback });
  }
}
