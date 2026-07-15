import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// POST { prompt, answer, code, language } -> AI grade of a typed code/text answer
// against the expected solution. Falls back to accepting when no AI is configured.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const prompt = String(b.prompt || '').slice(0, 600);
  const answer = String(b.answer || '').slice(0, 800);
  const code = String(b.code || '').slice(0, 4000);
  const language = String(b.language || '').slice(0, 30);
  if (!code.trim()) return NextResponse.json({ error: 'Nothing to check — write your answer first.' }, { status: 400 });

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ correct: true, score: null, feedback: 'Answer saved. (Connect an AI key to grade it.)', checked: false });
  }

  const system = [
    'You are grading a student\'s typed answer to a problem. Be fair, lenient and encouraging.',
    `The task was: "${prompt || 'Solve the problem.'}"`,
    answer ? `The expected/correct solution is: "${answer}".` : 'Judge whether the answer is correct and complete on its own merits.',
    language ? `The answer is written as ${language}.` : '',
    'LENIENCY (important): mark the answer CORRECT when it is close enough to convey the right idea — do NOT require exact spelling, accents, capitalisation, punctuation or word-for-word wording. A minor spelling slip, a grammatical error, a synonym, a partial-but-on-target phrase, or a differently-worded equivalent all count as correct. Example: if the expected answer is "una taza de café" and the student writes "cafe", that is CORRECT — you may note that a fuller answer would be "una taza de café", but still mark it correct.',
    'Only mark it INCORRECT when the answer is genuinely wrong, missing, or off-topic. When incorrect, give a HINT that nudges toward the answer WITHOUT revealing it (the student has up to three tries).',
    'Return STRICT JSON: { "correct": true|false, "score": 0-100, "feedback": "one or two short, specific, encouraging sentences — if correct-but-imperfect, gently note how it could be more complete; if incorrect, a hint that does NOT give the answer away", "fix": "a short model/corrected solution as code or worked steps (plain, no backticks) — empty string if the answer was already acceptable" }.',
  ].filter(Boolean).join('\n');
  const user = `Student's answer:\n${code}`;

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.2, maxTokens: 700 });
    if (!r) return NextResponse.json({ correct: true, score: null, feedback: 'Answer saved.', checked: false });
    return NextResponse.json({
      correct: !!r.correct,
      score: typeof r.score === 'number' ? Math.max(0, Math.min(100, r.score)) : null,
      feedback: String(r.feedback || (r.correct ? 'Correct — nice work!' : 'Not quite — review the solution.')).slice(0, 300),
      fix: String(r.fix || '').slice(0, 1200),
      checked: true,
    });
  } catch {
    return NextResponse.json({ correct: true, score: null, feedback: 'Saved (could not reach the checker this time).', checked: false });
  }
}
