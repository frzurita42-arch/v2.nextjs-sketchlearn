import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Deterministic fallback slide (demo mode / no AI).
function fallbackSlide(subject: string, n: number) {
  return {
    title: `${subject} — slide ${n}`,
    content: `This is practice slide ${n} about ${subject}. (Connect an AI key for real, generated content.)`,
    translation: '',
    question: {
      prompt: `Which statement about ${subject} is correct?`,
      options: [
        { text: 'The correct statement', correct: true, explanation: 'This one follows from the lesson.' },
        { text: 'A plausible distractor', correct: false, explanation: '' },
        { text: 'Another distractor', correct: false, explanation: '' },
        { text: 'A clearly wrong option', correct: false, explanation: '' },
      ],
    },
    fallback: true,
  };
}

function cleanOptions(opts: any) {
  const arr = (Array.isArray(opts) ? opts : []).map((o: any) => ({
    text: String(o?.text || '').trim(),
    correct: !!o?.correct,
    explanation: String(o?.explanation || '').slice(0, 240),
  })).filter((o: any) => o.text).slice(0, 4);
  if (arr.length && !arr.some((o: any) => o.correct)) arr[0].correct = true;
  return arr;
}

// POST { lesson, values, slideNumber, priorSummary } -> one playable quiz slide.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const lesson = b.lesson || {};
  const subject = String(lesson.subject || 'the topic').slice(0, 80);
  const level = String(b.values?.level || lesson.level || 'Beginner').slice(0, 40);
  const topic = String(b.values?.topic || '').slice(0, 120);
  const language = String(lesson.language || '').slice(0, 40);
  const translateTo = String(lesson.translateTo || 'English').slice(0, 40);
  const n = Math.max(1, parseInt(b.slideNumber, 10) || 1);
  const total = Math.max(3, Math.min(15, parseInt(lesson.totalSlides, 10) || 5));
  const priorSummary = String(b.priorSummary || '').slice(0, 600);

  if (!geminiEnabled && !deepseekEnabled) {
    return NextResponse.json(fallbackSlide(subject, n));
  }

  const langLine = language
    ? `This is a ${language} language lesson. Write "content" in ${language} (the learner can tap to hear it and translate to ${translateTo}). Put the ${translateTo} meaning in "translation".`
    : `Write "content" as a short, clear teaching passage.`;
  const system = [
    `You are generating slide ${n} of ${total} for a playable ${subject} lesson at ${level} level.`,
    topic ? `Focus topic: ${topic}.` : '',
    lesson.style ? `Style: ${lesson.style}.` : '',
    priorSummary ? `Avoid repeating earlier slides. Prior slides covered: ${priorSummary}.` : '',
    langLine,
    'Each slide teaches ONE idea, then tests it with a 4-option multiple-choice question (exactly one correct). Keep it engaging and level-appropriate.',
    'Return STRICT JSON only.',
  ].filter(Boolean).join('\n');
  const user = `Return JSON: { "title": "short", "content": "the teaching text", "translation": "meaning in ${translateTo} or empty", "question": { "prompt": "the question", "options": [ { "text": "...", "correct": true/false, "explanation": "why" } ] } }`;

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: 0.7, maxTokens: 1400 }
    );
    const options = cleanOptions(r?.question?.options);
    if (!r?.content || options.length < 2) return NextResponse.json(fallbackSlide(subject, n));
    return NextResponse.json({
      title: String(r.title || `${subject} — slide ${n}`).slice(0, 100),
      content: String(r.content || '').slice(0, 1500),
      translation: String(r.translation || '').slice(0, 800),
      question: { prompt: String(r.question?.prompt || 'Choose the correct answer.').slice(0, 300), options },
      fallback: false,
    });
  } catch {
    return NextResponse.json(fallbackSlide(subject, n));
  }
}
