import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateVisionJSON } = require('@/src/ai/providers');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// POST { prompt, answer, image } -> AI-vision grade of hand-written work (math
// working, CJK characters, sentences, calligraphy) against the expected answer.
// Falls back to accepting the work when vision isn't configured.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const prompt = String(b.prompt || '').slice(0, 600);
  const answer = String(b.answer || '').slice(0, 400);
  const image = String(b.image || '');
  if (!image.startsWith('data:image')) return NextResponse.json({ error: 'No written work to check.' }, { status: 400 });

  const visionPrompt = [
    'You are grading a student\'s HAND-WRITTEN work shown in the image (it may span stacked pages).',
    `The task was: "${prompt || 'Solve/write the answer.'}"`,
    answer ? `The expected/correct answer is: "${answer}".` : 'Judge whether the work is correct and complete.',
    'Read their handwriting/drawing carefully, follow their working, and grade fairly and encouragingly.',
    'Return STRICT JSON: { "correct": true|false, "score": 0-100, "feedback": "one or two short, specific, encouraging sentences about what was right or what to fix" }.',
  ].join('\n');

  try {
    const r: any = await generateVisionJSON(visionPrompt, image);
    if (!r) return NextResponse.json({ correct: true, score: null, feedback: 'Work saved. (Connect an AI vision key to get it graded.)', checked: false });
    return NextResponse.json({
      correct: !!r.correct,
      score: typeof r.score === 'number' ? Math.max(0, Math.min(100, r.score)) : null,
      feedback: String(r.feedback || (r.correct ? 'Looks correct — nice work!' : 'Not quite — review the working.')).slice(0, 300),
      checked: true,
    });
  } catch {
    return NextResponse.json({ correct: true, score: null, feedback: 'Saved (could not reach the checker this time).', checked: false });
  }
}
