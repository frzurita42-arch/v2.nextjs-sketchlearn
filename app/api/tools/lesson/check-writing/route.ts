import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateVisionJSON } = require('@/src/ai/providers');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { target, image } -> AI-vision check of a handwritten drawing against the
// target character/word. Falls back to accepting it (self-check) when vision
// isn't available, so the activity always completes.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const target = String(b.target || '').slice(0, 40).trim();
  const image = String(b.image || '');
  if (!target || !image.startsWith('data:image')) {
    return NextResponse.json({ error: 'Missing target or drawing.' }, { status: 400 });
  }
  const prompt = `A language learner hand-drew a character/word on a white canvas. The TARGET they were asked to write is: "${target}". Look at the image and judge how well the drawing matches the target's shape. Be encouraging but honest. Return STRICT JSON: { "correct": true|false (true if it clearly resembles the target), "score": 0-100, "feedback": "one short, specific, encouraging sentence" }.`;
  try {
    const r: any = await generateVisionJSON(prompt, image);
    if (!r) {
      return NextResponse.json({ correct: true, score: null, feedback: 'Saved. (Connect an AI vision key to get your handwriting checked.)', checked: false });
    }
    return NextResponse.json({
      correct: !!r.correct,
      score: typeof r.score === 'number' ? Math.max(0, Math.min(100, r.score)) : null,
      feedback: String(r.feedback || (r.correct ? 'Nice — that looks right!' : 'Close — keep practicing the shape.')).slice(0, 240),
      checked: true,
    });
  } catch {
    return NextResponse.json({ correct: true, score: null, feedback: 'Saved (could not reach the checker this time).', checked: false });
  }
}
