import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { levelDepthGuidance } = require('@/src/ai/level-depth');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { subject, topic, title, content, translation, level, language, translateTo,
//        paragraphs, length, questions? }
//   -> { content, translation, questions? }
// Re-explains the SAME slide idea at a different level: not just longer/shorter,
// but deeper and more technical as the level rises (or extra-simple at Zero).
// The teaching text AND the slide's questions are re-leveled together — the
// question wording/options/distractors are rewritten to match the level (longer,
// more challenging as it rises), while keeping the SAME concept and the SAME
// correct answer. Support/images are left to the player.

// Rewrite the slide's questions at the new level. Structure and correctness are
// preserved server-side (we NEVER trust the model to keep the right option
// correct): we only overlay the reworded text onto the original questions.
async function relevelQuestions(questions: any[], ctx: { subject: string; topic: string; title: string; level: string; language: string }): Promise<any[]> {
  // Only text-based questions can be re-leveled by rewording. Character/drawing/
  // code questions carry their difficulty in the target and are left as-is.
  const editable = new Set(['mcq', 'input', 'text', '']);
  const idxs = questions.map((q, i) => ({ q, i })).filter(({ q }) => editable.has(String(q?.kind || '')) && String(q?.prompt || '').trim());
  if (!idxs.length) return questions;

  const payload = idxs.map(({ q, i }) => ({
    i,
    kind: q.kind || 'mcq',
    prompt: String(q.prompt || ''),
    options: Array.isArray(q.options) ? q.options.map((o: any) => ({ text: String(o?.text ?? o ?? ''), correct: !!o?.correct })) : undefined,
    answer: q.answer ? String(q.answer) : undefined,
  }));

  const system = [
    `Rewrite these ${ctx.subject} quiz questions${ctx.topic ? ` about ${ctx.topic}` : ''} for ${ctx.level} level.`,
    ctx.title ? `Slide title: ${ctx.title}.` : '',
    `LEVEL DEPTH (${ctx.level}): ${levelDepthGuidance(ctx.level)}`,
    'Rewrite each question so it fits the level: simpler and shorter at low levels; LONGER, harder and with more challenging distractor options as the level rises — while testing the SAME underlying idea.',
    'CRITICAL: keep the SAME number of options in the SAME order, and keep exactly the option that was marked correct as the correct one (do NOT move the correct answer). Do not change the meaning of the correct answer.',
    ctx.language ? `This is a ${ctx.language} lesson: keep the question language consistent with the original.` : '',
    'Return STRICT JSON: { "questions": [ { "i": <index>, "prompt": "...", "options": [ { "text": "...", "explanation": "..." }, ... ] }, ... ] }. Include the same "i" values you were given. For questions without options, just return the reworded "prompt".',
  ].filter(Boolean).join('\n');
  const user = `Questions to rewrite at ${ctx.level}:\n${JSON.stringify(payload)}`;

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.6, maxTokens: 2200 });
    const arr = Array.isArray(r?.questions) ? r.questions : [];
    const byIdx = new Map<number, any>();
    for (const qm of arr) { const i = Number(qm?.i); if (Number.isInteger(i)) byIdx.set(i, qm); }
    // Overlay reworded text onto the ORIGINALS, preserving kind/correct/answer/accept.
    return questions.map((q, i) => {
      const qm = byIdx.get(i);
      if (!qm) return q;
      const next: any = { ...q };
      if (String(qm.prompt || '').trim()) next.prompt = String(qm.prompt).slice(0, 400);
      if (Array.isArray(q.options) && Array.isArray(qm.options)) {
        next.options = q.options.map((o: any, j: number) => {
          const om = qm.options[j];
          if (!om) return o;
          return {
            ...o,
            text: String(om.text ?? o?.text ?? o ?? '').slice(0, 200) || o?.text,
            explanation: om.explanation != null ? String(om.explanation).slice(0, 240) : o?.explanation,
            correct: !!o?.correct,   // correctness comes from the ORIGINAL, never the model
          };
        });
      }
      if (qm.explanation != null) next.explanation = String(qm.explanation).slice(0, 240);
      return next;
    });
  } catch {
    return questions;
  }
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const content = String(b.content || '').slice(0, 2500);
  const level = String(b.level || 'Beginner').slice(0, 40);
  const questions = Array.isArray(b.questions) ? b.questions.slice(0, 12) : [];
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json({ content, translation: String(b.translation || ''), questions });

  const subject = String(b.subject || 'the topic').slice(0, 80);
  const topic = String(b.topic || '').slice(0, 120);
  const title = String(b.title || '').slice(0, 120);
  const language = String(b.language || '').slice(0, 40);
  const translateTo = String(b.translateTo || 'English').slice(0, 40);
  const paras = Math.max(1, Math.min(4, parseInt(b.paragraphs, 10) || 1));
  const pLen = ['brief', 'medium', 'detailed'].includes(b.length) ? b.length : 'medium';

  const system = [
    `Re-explain ONE ${subject} teaching text${topic ? ` about ${topic}` : ''} at ${level} level.`,
    title ? `Slide title: ${title}.` : '',
    `LEVEL DEPTH (${level}): ${levelDepthGuidance(level)}`,
    'Keep the SAME core idea and facts — do not change the topic. Only change the depth, technicality and phrasing to fit the level (LONGER and more challenging as the level rises).',
    language
      ? `This is a ${language} lesson: write "content" in ${language} and the ${translateTo} meaning in "translation".`
      : `Write "content" as ${paras} ${pLen} paragraph(s) of plain teaching prose. Leave "translation" empty.`,
    'For math/science you may use inline $...$ LaTeX for symbols. Return STRICT JSON: { "content": "...", "translation": "..." }.',
  ].filter(Boolean).join('\n');
  const user = `Original text to re-explain at ${level}:\n${content}`;

  // Re-level the text and the questions in parallel.
  const textP = generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.6, maxTokens: 1600 })
    .then((r: any) => ({ content: String(r?.content || '').trim(), translation: String(r?.translation || '').slice(0, 800) }))
    .catch(() => ({ content: '', translation: String(b.translation || '') }));
  const qsP = questions.length ? relevelQuestions(questions, { subject, topic, title, level, language }) : Promise.resolve(questions);

  const [txt, qs] = await Promise.all([textP, qsP]);
  return NextResponse.json({
    content: (txt.content || content).slice(0, 2500),
    translation: txt.translation,
    questions: qs,
  });
}
