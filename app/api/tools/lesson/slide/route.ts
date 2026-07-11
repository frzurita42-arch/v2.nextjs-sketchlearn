import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, deepseekEnabled, imageEnabled } from '@/src/config';
import { generateStructured, generateImage } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fallbackImageDataUrl } = require('@/src/slides/visual-policy');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { levelGuidance } = require('@/src/ai/prompts/language');

// The menu of activities/displays proven out by the Language Learning tool. Fed
// to the generator so it knows the full space and is FREE to mix formats.
const ACTIVITY_MENU = `Menu of activities you can draw on (mix formats FREELY between and within slides — never repeat the exact same shape every slide):
- Multiple choice (2 OR 4 options): comprehension, best translation, fill-in-the-blank word choice, "is this correct?" yes/no, or judge whether a stated rule/explanation is right. RANDOMIZE which option is correct (don't always put it first); make distractors tempting but clearly distinct, and keep every option's wording unique across the slide.
- Fill in the blank: a sentence containing "____" where the learner types the missing word.
- Typed short answer / spelling: the learner types a term, definition, or word.
Information display you may attach to a slide (pick what fits the idea; vary it slide to slide):
- a reading passage, an image, a table (vocabulary/conjugations/data/comparisons), a code snippet (rules/patterns/steps), or a formula.
You are free to combine ANY evaluation type with ANY display type; keep everything level-appropriate.`;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// Infer the subject family when the builder didn't set one.
function inferKind(subject: string, language?: string): string {
  const s = subject.toLowerCase();
  if (language) return 'language';
  if (/\b(math|algebra|calculus|geometry|trigonometry|statistics|probability|equation|arithmetic)\b/.test(s)) return 'math';
  if (/\b(programming|coding|code|python|javascript|java|c\+\+|software|algorithm|sql|rust|typescript)\b/.test(s)) return 'programming';
  if (/\b(french|spanish|german|italian|portuguese|japanese|chinese|mandarin|arabic|hindi|english|language)\b/.test(s)) return 'language';
  return 'general';
}

function cleanOptions(opts: any, want: number) {
  const arr = (Array.isArray(opts) ? opts : []).map((o: any) => ({
    text: String(o?.text || '').trim(), correct: !!o?.correct, explanation: String(o?.explanation || '').slice(0, 240),
  })).filter((o: any) => o.text).slice(0, want);
  if (arr.length && !arr.some((o: any) => o.correct)) arr[0].correct = true;
  return arr;
}
function cleanQuestion(q: any) {
  const kind = ['mcq', 'fill-blank', 'input'].includes(q?.kind) ? q.kind : 'mcq';
  if (kind === 'mcq') {
    const want = q?.options?.length >= 4 ? 4 : 2;
    const options = cleanOptions(q?.options, want);
    if (options.length < 2) return null;
    return { kind: 'mcq', prompt: String(q?.prompt || 'Choose the correct answer.').slice(0, 300), options };
  }
  // fill-blank / input: a typed answer with accepted variants (3 tries in the player)
  const answer = String(q?.answer || '').trim();
  if (!answer) return null;
  const accept = (Array.isArray(q?.accept) && q.accept.length ? q.accept : [answer]).map((v: any) => String(v || '').trim().toLowerCase()).filter(Boolean);
  return {
    kind, prompt: String(q?.prompt || (kind === 'fill-blank' ? 'Fill in the blank.' : 'Type your answer.')).slice(0, 300),
    answer, accept, explanation: String(q?.explanation || '').slice(0, 240),
  };
}

async function makeImage(prompt: string): Promise<string> {
  if (imageEnabled) { try { const u = await generateImage(prompt); if (u) return u; } catch { /* fall through */ } }
  return fallbackImageDataUrl(prompt, '');
}

// ---- deterministic fallback (demo / no AI) ----
function fbSlide(subject: string, n: number, kinds: string[]) {
  const kind = rand(kinds);
  let question: any;
  if (kind === 'mcq') {
    const want = Math.random() < 0.5 ? 2 : 4;
    const opts = [{ text: 'The correct answer', correct: true }, { text: 'A distractor' }, { text: 'Another option' }, { text: 'A wrong option' }].slice(0, want);
    question = { kind: 'mcq', prompt: `Which is correct about ${subject}?`, options: cleanOptions(opts, want) };
  } else {
    question = { kind, prompt: kind === 'fill-blank' ? `${subject} has ____ key idea per slide.` : `Type a key term from this ${subject} slide.`, answer: 'one', accept: ['one', '1'] };
  }
  return {
    title: `${subject} — slide ${n}`,
    content: `This is practice slide ${n} about ${subject}. Connect an AI key for full generated content.`,
    translation: '', support: null, questions: [question], fallback: true,
  };
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const lesson = b.lesson || {};
  const subject = String(lesson.subject || 'the topic').slice(0, 80);
  const level = String(b.values?.difficulty || b.values?.level || lesson.level || 'Beginner').slice(0, 40);
  const topic = String(b.values?.topic || '').slice(0, 120);
  const language = String(lesson.language || '').slice(0, 40);
  const translateTo = String(lesson.translateTo || 'English').slice(0, 40);
  const kind = lesson.subjectKind || inferKind(subject, language);
  const n = Math.max(1, parseInt(b.slideNumber, 10) || 1);
  const total = Math.max(3, Math.min(15, parseInt(b.values?.slides, 10) || parseInt(lesson.totalSlides, 10) || 5));
  const priorSummary = String(b.priorSummary || '').slice(0, 600);
  const paras = Math.max(1, Math.min(4, parseInt(b.values?.paragraphs, 10) || parseInt(lesson.paragraphsPerSlide, 10) || 1));
  const pLen = ['brief', 'medium', 'detailed'].includes(b.values?.length) ? b.values.length : (lesson.paragraphLength || 'medium');
  const support = lesson.support || { images: true };
  const activityTypes: string[] = (Array.isArray(lesson.activityTypes) && lesson.activityTypes.length) ? lesson.activityTypes : ['mcq', 'fill-blank', 'input'];

  // Randomly fluctuate this slide's shape.
  const numQ = 1 + Math.floor(Math.random() * 3);                 // 1-3 questions per slide
  const qKinds = Array.from({ length: numQ }, () => rand(activityTypes));
  const allowedSupport: string[] = [];
  if (support.images) allowedSupport.push('image');
  if (support.code || kind === 'programming') allowedSupport.push('code');
  if (support.tables) allowedSupport.push('table');
  if (support.formulas || kind === 'math') allowedSupport.push('formula');
  const supportType = allowedSupport.length && Math.random() < 0.7 ? rand(allowedSupport) : null;

  if (!geminiEnabled && !deepseekEnabled) return NextResponse.json(fbSlide(subject, n, activityTypes));

  const langLine = language
    ? `This is a ${language} lesson: write "content" in ${language} and put the ${translateTo} meaning in "translation".`
    : `Write "content" as ${paras} ${pLen} paragraph(s).`;
  const subjectLine = kind === 'math' ? 'Prefer precise definitions; use a formula where it clarifies.'
    : kind === 'programming' ? 'Prefer concrete code and tables over prose.'
    : '';
  const qSpec = qKinds.map((k, i) => {
    if (k === 'mcq') { const c = Math.random() < 0.5 ? 2 : 4; return `Q${i + 1}: kind "mcq" with EXACTLY ${c} options (one correct).`; }
    if (k === 'fill-blank') return `Q${i + 1}: kind "fill-blank" — a sentence with "____" and the missing "answer" (+ "accept" variants).`;
    return `Q${i + 1}: kind "input" — a short-answer question with an "answer" (+ "accept" variants).`;
  }).join('\n');
  const supSpec = supportType === 'image' ? 'Also include support = { "type": "image", "prompt": "a vivid image description" }.'
    : supportType === 'code' ? 'Also include support = { "type": "code", "language": "...", "code": "a short snippet" }.'
    : supportType === 'table' ? 'Also include support = { "type": "table", "headers": [...], "rows": [[...]] }.'
    : supportType === 'formula' ? 'Also include support = { "type": "formula", "latex": "a LaTeX formula", "caption": "what it means" }.'
    : 'Set support to null.';

  const system = [
    `Generate slide ${n} of ${total} for a ${subject} lesson at ${level} level.`,
    language ? `Level objective: ${levelGuidance(level)}` : '',
    topic ? `Focus: ${topic}.` : '', lesson.style ? `Style: ${lesson.style}.` : '',
    priorSummary ? `Avoid repeating: ${priorSummary}.` : '',
    ACTIVITY_MENU,
    langLine, subjectLine,
    'For THIS slide, teach one idea, then produce these specific questions (still applying the freedom above to vary content):', qSpec, supSpec,
    'Return STRICT JSON only.',
  ].filter(Boolean).join('\n');
  const user = `Return JSON: { "title": "short", "content": "the teaching text", "translation": "or empty", "support": {...} or null, "questions": [ { "kind": "mcq|fill-blank|input", "prompt": "...", "options": [{"text","correct","explanation"}], "answer": "...", "accept": ["..."] } ] }`;

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.7, maxTokens: 1800 });
    const questions = (Array.isArray(r?.questions) ? r.questions : []).map(cleanQuestion).filter(Boolean);
    if (!r?.content || !questions.length) return NextResponse.json(fbSlide(subject, n, activityTypes));
    let sup: any = null;
    const s = r.support;
    if (s?.type === 'image') sup = { type: 'image', url: await makeImage(String(s.prompt || subject)), caption: String(s.caption || '') };
    else if (s?.type === 'code') sup = { type: 'code', language: String(s.language || '').slice(0, 20), code: String(s.code || '').slice(0, 1200) };
    else if (s?.type === 'table' && Array.isArray(s.headers)) sup = { type: 'table', headers: s.headers.map((h: any) => String(h).slice(0, 40)).slice(0, 6), rows: (Array.isArray(s.rows) ? s.rows : []).slice(0, 12).map((row: any) => (Array.isArray(row) ? row.map((c: any) => String(c).slice(0, 80)).slice(0, 6) : [])) };
    else if (s?.type === 'formula') sup = { type: 'formula', latex: String(s.latex || s.formula || '').slice(0, 300), caption: String(s.caption || '').slice(0, 200) };
    return NextResponse.json({
      title: String(r.title || `${subject} — slide ${n}`).slice(0, 100),
      content: String(r.content || '').slice(0, 2000),
      translation: String(r.translation || '').slice(0, 800),
      support: sup, questions, fallback: false,
    });
  } catch {
    return NextResponse.json(fbSlide(subject, n, activityTypes));
  }
}
