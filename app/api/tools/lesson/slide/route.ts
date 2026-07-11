import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, deepseekEnabled, imageEnabled } from '@/src/config';
import { generateStructured, generateImage } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fallbackImageDataUrl } = require('@/src/slides/visual-policy');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { levelGuidance } = require('@/src/ai/prompts/language');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wolframAvailable, wolframShortAnswer } = require('@/src/connectors/wolfram');

// The menu of activities/displays proven out by the Language Learning tool. Fed
// to the generator so it knows the full space and is FREE to mix formats.
const ACTIVITY_MENU = `Menu of activities you can draw on (mix formats FREELY between and within slides — never repeat the exact same shape every slide):
- Multiple choice (2 OR 4 options): comprehension, best translation, fill-in-the-blank word choice, "is this correct?" yes/no, or judge whether a stated rule/explanation is right. RANDOMIZE which option is correct (don't always put it first); make distractors tempting but clearly distinct, and keep every option's wording unique across the slide.
- Fill in the blank: a sentence containing "____" where the learner types the missing word.
- Typed short answer / spelling: the learner types a term, definition, or word.
Information display you may attach to a slide (pick what fits the idea; vary it slide to slide):
- a reading passage, an image, a table (vocabulary/conjugations/data/comparisons), a code snippet, a formula, or a Wolfram Alpha computation.
- MATH/quantitative ideas: explain with a formula, a Wolfram computation, and/or a code snippet — mix them when useful.
- GRAMMAR/syntax ideas: a code snippet is great for showing the syntax pattern/conjugation logic.
- PROGRAMMING ideas: prefer real code snippets and tables.
You are free to combine ANY evaluation type with ANY display type; keep everything level-appropriate.`;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// The model sometimes dumps JSON/an object into "content". Detect that and
// salvage a plain-text field from it, so a raw JSON string never hits the UI.
function cleanContent(raw: any): string {
  if (raw && typeof raw === 'object') {
    return String(raw.content || raw.text || raw.passage || raw.paragraph || raw.body || '').trim();
  }
  const s = String(raw || '').trim();
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      const o = JSON.parse(s);
      const salvaged = String(o?.content || o?.text || o?.passage || o?.paragraph || o?.body || '').trim();
      return salvaged || ''; // empty -> caller treats slide as invalid and uses the fallback
    } catch { return ''; }
  }
  return s;
}

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
  const kind = ['mcq', 'fill-blank', 'input', 'writing'].includes(q?.kind) ? q.kind : 'mcq';
  if (kind === 'writing') {
    // Handwriting drill: draw the target; the AI checks the drawing. No options/answer.
    const target = String(q?.target || q?.answer || '').trim();
    if (!target) return null;
    return { kind: 'writing', prompt: String(q?.prompt || 'Write this by hand:').slice(0, 200), target: target.slice(0, 40) };
  }
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
  } else if (kind === 'writing') {
    question = { kind: 'writing', prompt: 'Write this by hand:', target: 'A' };
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
  const total = Math.max(1, Math.min(15, parseInt(b.values?.slides, 10) || parseInt(lesson.totalSlides, 10) || 5));
  const priorSummary = String(b.priorSummary || '').slice(0, 600);
  const paras = Math.max(1, Math.min(4, parseInt(b.values?.paragraphs, 10) || parseInt(lesson.paragraphsPerSlide, 10) || 1));
  const pLen = ['brief', 'medium', 'detailed'].includes(b.values?.length) ? b.values.length : (lesson.paragraphLength || 'medium');
  const tone = String(b.values?.tone || lesson.tone || '').slice(0, 40);
  // Learner-chosen support toggles (sup_*) override the tool's defaults.
  const baseSup = lesson.support || { images: true };
  const pickBool = (v: any, d: any) => (typeof v === 'boolean' ? v : d);
  const support = {
    images: pickBool(b.values?.sup_images, baseSup.images),
    audio: pickBool(b.values?.sup_audio, baseSup.audio),
    code: pickBool(b.values?.sup_code, baseSup.code),
    tables: pickBool(b.values?.sup_tables, baseSup.tables),
    formulas: pickBool(b.values?.sup_formulas, baseSup.formulas),
  };
  const activityTypes: string[] = (Array.isArray(lesson.activityTypes) && lesson.activityTypes.length) ? lesson.activityTypes : ['mcq', 'fill-blank', 'input'];

  // A pure handwriting drill needs no support material (no image/pronunciation/phrase).
  const pureWriting = activityTypes.length === 1 && activityTypes[0] === 'writing';
  // Randomly fluctuate this slide's shape. Handwriting drills stay to one task per slide.
  const numQ = pureWriting ? 1 : 1 + Math.floor(Math.random() * 3);   // 1-3 questions per slide
  const qKinds = Array.from({ length: numQ }, () => rand(activityTypes));
  const wolfram = wolframAvailable();
  const allowedSupport: string[] = [];
  if (support.images) allowedSupport.push('image');
  // Code snippets: for programming, AND for language grammar (show syntax logic as code).
  if (support.code || kind === 'programming' || kind === 'language') allowedSupport.push('code');
  if (support.tables) allowedSupport.push('table');
  if (support.formulas || kind === 'math') {
    // Prefer a real Wolfram computation when the API key is present; always keep
    // formula (and code) as fallbacks, and mix between them.
    if (wolfram) allowedSupport.push('wolfram');
    allowedSupport.push('formula');
    if (kind === 'math' && !allowedSupport.includes('code')) allowedSupport.push('code');
  }
  const supportType = (!pureWriting && allowedSupport.length && Math.random() < 0.7) ? rand(allowedSupport) : null;

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
    if (k === 'writing') return `Q${i + 1}: kind "writing" — a handwriting drill: give "target" = the exact ${language || subject} character/word to hand-write, and a short "prompt" (e.g. "Write this hiragana"). No options, no answer. The learner will draw it and it will be AI-checked.`;
    return `Q${i + 1}: kind "input" — a short-answer question with an "answer" (+ "accept" variants).`;
  }).join('\n');
  const codeHint = kind === 'language'
    ? 'a short snippet showing the SYNTAX/grammar logic (e.g. "subject + verb(conjugated) + object", or a conjugation pattern)'
    : 'a short, correct code snippet';
  const supSpec = supportType === 'image' ? 'Also include support = { "type": "image", "prompt": "a vivid image description" }.'
    : supportType === 'code' ? `Also include support = { "type": "code", "language": "...", "code": ${JSON.stringify(codeHint)} }.`
    : supportType === 'table' ? 'Also include support = { "type": "table", "headers": [...], "rows": [[...]] }.'
    : supportType === 'wolfram' ? 'Also include support = { "type": "wolfram", "query": "a precise Wolfram Alpha query that computes/derives the concept (e.g. \\"derivative of x^2\\", \\"solve 2x+3=7\\")", "latex": "the formula in LaTeX", "caption": "what it shows" }. Wolfram will compute the answer.'
    : supportType === 'formula' ? 'Also include support = { "type": "formula", "latex": "a LaTeX formula", "caption": "what it means" }.'
    : 'Set support to null.';

  const system = [
    `Generate slide ${n} of ${total} for a ${subject} lesson at ${level} level.`,
    language ? `Level objective: ${levelGuidance(level)}` : '',
    topic ? `Focus: ${topic}.` : '', tone ? `Tone: ${tone}.` : '', lesson.style ? `Style: ${lesson.style}.` : '',
    priorSummary ? `Avoid repeating: ${priorSummary}.` : '',
    ACTIVITY_MENU,
    langLine, subjectLine,
    'For THIS slide, teach one idea, then produce these specific questions (still applying the freedom above to vary content):', qSpec, supSpec,
    'OUTPUT RULES (critical): return ONE JSON object with EXACTLY these top-level keys: title, content, translation, support, questions.',
    '"content" MUST be plain, human-readable teaching text (a sentence or short paragraph) — NEVER JSON, never a nested object, never quoted JSON, never code. Put questions ONLY in the "questions" array, and support material ONLY in "support". Do not wrap the whole object in a string or another object.',
    'Return STRICT JSON only — no markdown fences, no commentary.',
  ].filter(Boolean).join('\n');
  const user = `Return JSON exactly like: { "title": "short title", "content": "one short teaching paragraph in plain prose", "translation": "meaning or empty", "support": {...} or null, "questions": [ { "kind": "mcq|fill-blank|input", "prompt": "the question text", "options": [{"text","correct","explanation"}], "answer": "...", "accept": ["..."] } ] }`;

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.7, maxTokens: 1800 });
    const content = cleanContent(r?.content);
    const questions = (Array.isArray(r?.questions) ? r.questions : []).map(cleanQuestion).filter(Boolean);
    // If content came back empty or as a JSON blob we couldn't salvage, or there
    // are no valid questions, use the deterministic fallback instead of showing junk.
    if (!content || !questions.length) return NextResponse.json(fbSlide(subject, n, activityTypes));
    let sup: any = null;
    const s = r.support;
    if (s?.type === 'image') sup = { type: 'image', url: await makeImage(String(s.prompt || subject)), caption: String(s.caption || '') };
    else if (s?.type === 'code') sup = { type: 'code', language: String(s.language || '').slice(0, 20), code: String(s.code || '').slice(0, 1200) };
    else if (s?.type === 'table' && Array.isArray(s.headers)) sup = { type: 'table', headers: s.headers.map((h: any) => String(h).slice(0, 40)).slice(0, 6), rows: (Array.isArray(s.rows) ? s.rows : []).slice(0, 12).map((row: any) => (Array.isArray(row) ? row.map((c: any) => String(c).slice(0, 80)).slice(0, 6) : [])) };
    else if (s?.type === 'wolfram') {
      // Compute the answer via Wolfram when available; otherwise degrade to a formula.
      const result = await wolframShortAnswer(s.query);
      const base = { query: String(s.query || '').slice(0, 300), latex: String(s.latex || '').slice(0, 300), caption: String(s.caption || '').slice(0, 200) };
      sup = result ? { type: 'wolfram', ...base, result: String(result).slice(0, 400) }
        : (base.latex ? { type: 'formula', latex: base.latex, caption: base.caption } : null);
    }
    else if (s?.type === 'formula') sup = { type: 'formula', latex: String(s.latex || s.formula || '').slice(0, 300), caption: String(s.caption || '').slice(0, 200) };
    return NextResponse.json({
      title: String(r.title || `${subject} — slide ${n}`).slice(0, 100),
      content: content.slice(0, 2000),
      translation: cleanContent(r.translation).slice(0, 800),
      support: sup, questions, fallback: false,
    });
  } catch {
    return NextResponse.json(fbSlide(subject, n, activityTypes));
  }
}
