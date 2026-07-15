import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { levelGuidance } = require('@/src/ai/prompts/language');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { levelDepthGuidance } = require('@/src/ai/level-depth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wolframAvailable } = require('@/src/connectors/wolfram');

// The menu of activities/displays proven out by the Language Learning tool. Fed
// to the generator so it knows the full space and is FREE to mix formats.
const ACTIVITY_MENU = `Menu of activities you can draw on (mix formats FREELY between and within slides — never repeat the exact same shape every slide):
- Multiple choice (2 OR 4 options): comprehension, best translation, fill-in-the-blank word choice, "is this correct?" yes/no, or judge whether a stated rule/explanation is right. RANDOMIZE which option is correct (don't always put it first); make distractors tempting but clearly distinct, and keep every option's wording unique across the slide.
- Fill in the blank: a sentence containing "____" where the learner types the missing word.
- Typed short answer / spelling: the learner types a term, definition, or word.
Information display you may attach to a slide (pick what fits the idea; vary it slide to slide):
- a reading passage, an image, a table (vocabulary/conjugations/data/comparisons), and — for STEM only — a code snippet, a formula, or a Wolfram Alpha computation.
- MATH/quantitative ideas: explain with a formula, a Wolfram computation, and/or a code snippet — mix them when useful.
- PROGRAMMING ideas: prefer real code snippets and tables.
- CODE BOXES ARE STEM-ONLY: never attach a code snippet to a language, grammar, history, art or other humanities lesson — show grammar/conjugation with a TABLE or prose, not a code window.
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
  const kind = ['mcq', 'mcq2', 'mcq4', 'fill-blank', 'input', 'writing', 'annotation', 'code'].includes(q?.kind) ? q.kind : 'mcq';
  if (kind === 'writing') {
    // Handwriting drill: draw the target; the AI checks the drawing. No options/answer.
    const target = String(q?.target || q?.answer || '').trim();
    if (!target) return null;
    return { kind: 'writing', prompt: String(q?.prompt || 'Write this by hand:').slice(0, 200), target: target.slice(0, 40) };
  }
  if (kind === 'annotation') {
    // Worked-answer drill: the learner writes the full solution/characters on a
    // paginated paper pad; the AI scans the pages and grades against "answer".
    const prompt = String(q?.prompt || q?.problem || '').trim();
    if (!prompt) return null;
    return {
      kind: 'annotation',
      prompt: prompt.slice(0, 400),
      answer: String(q?.answer || q?.solution || '').slice(0, 400),
    };
  }
  if (kind === 'code') {
    // Code-box drill: the learner types code / a worked expression; the AI grades
    // it against the expected solution. Good when the annotation pad is unwanted.
    const prompt = String(q?.prompt || q?.problem || '').trim();
    if (!prompt) return null;
    return {
      kind: 'code',
      prompt: prompt.slice(0, 400),
      answer: String(q?.answer || q?.solution || '').slice(0, 600),
      language: String(q?.language || '').slice(0, 20),
      starter: String(q?.starter || '').slice(0, 400),
    };
  }
  if (kind === 'mcq' || kind === 'mcq2' || kind === 'mcq4') {
    // mcq2/mcq4 force the option count; plain mcq follows what the model returned.
    const want = kind === 'mcq2' ? 2 : kind === 'mcq4' ? 4 : (q?.options?.length >= 4 ? 4 : 2);
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

// ---- deterministic fallback (demo / no AI) ----
function fbQuestion(kind: string, subject: string) {
  if (kind === 'mcq' || kind === 'mcq2' || kind === 'mcq4') {
    const want = kind === 'mcq2' ? 2 : kind === 'mcq4' ? 4 : (Math.random() < 0.5 ? 2 : 4);
    const opts = [{ text: 'The correct answer', correct: true }, { text: 'A distractor' }, { text: 'Another option' }, { text: 'A wrong option' }].slice(0, want);
    return { kind: 'mcq', prompt: `Which is correct about ${subject}?`, options: cleanOptions(opts, want) };
  }
  if (kind === 'writing') return { kind: 'writing', prompt: 'Write this by hand:', target: 'A' };
  if (kind === 'annotation') return { kind: 'annotation', prompt: `Work out and write the full answer for this ${subject} problem on the pad.`, answer: '' };
  if (kind === 'code') return { kind: 'code', prompt: `Write the answer/solution for this ${subject} problem in the code box.`, answer: '', language: '', starter: '' };
  return { kind, prompt: kind === 'fill-blank' ? `${subject} has ____ key idea per slide.` : `Type a key term from this ${subject} slide.`, answer: 'one', accept: ['one', '1'] };
}
function fbSlide(subject: string, n: number, kinds: string[], mathish = false) {
  // One question per designed activity (so multi-component pages show them all).
  const questions = (kinds.length ? kinds : ['mcq']).slice(0, 4).map((k) => fbQuestion(k, subject));
  // Math/science demo slides show a real typeset formula so the KaTeX rendering
  // is visible even without an AI key.
  const support = mathish ? { type: 'formula', latex: 'c = \\sqrt{a^2 + b^2}', caption: 'Example formula (Pythagoras)' } : null;
  const content = mathish
    ? `This is practice slide ${n} about ${subject}. Formulas render cleanly, e.g. $a^2 + b^2 = c^2$ and $E = mc^2$. Connect an AI key for full generated content.`
    : `This is practice slide ${n} about ${subject}. Connect an AI key for full generated content.`;
  return {
    title: `${subject} — slide ${n}`,
    content,
    translation: '', support, questions, fallback: true,
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
  const total = Math.max(1, Math.min(75, parseInt(b.values?.slides, 10) || parseInt(lesson.totalSlides, 10) || 5));
  const priorSummary = String(b.priorSummary || '').slice(0, 600);
  // A designed page for THIS slide (from the Studio) steers its components + density.
  const pageSpec = (Array.isArray(lesson.pages) && lesson.pages[n - 1]) ? lesson.pages[n - 1] : null;
  const paras = Math.max(1, Math.min(4, parseInt(b.values?.paragraphs, 10) || parseInt(pageSpec?.paragraphsPerSlide, 10) || parseInt(lesson.paragraphsPerSlide, 10) || 1));
  const pLen = ['brief', 'medium', 'detailed'].includes(b.values?.length) ? b.values.length : (pageSpec?.paragraphLength || lesson.paragraphLength || 'medium');
  const tone = String(b.values?.tone || lesson.tone || '').slice(0, 40);
  // Free-text "Custom instructions" the author typed on the generate form.
  const customNote = String(b.values?.custom || b.values?.customInstructions || '').slice(0, 400);
  // Learner-chosen support toggles (sup_*) override the page/tool defaults.
  const baseSup = pageSpec?.support || lesson.support || { images: true };
  const pickBool = (v: any, d: any) => (typeof v === 'boolean' ? v : d);
  const support = {
    images: pickBool(b.values?.sup_images, baseSup.images),
    audio: pickBool(b.values?.sup_audio, baseSup.audio),
    code: pickBool(b.values?.sup_code, baseSup.code),
    tables: pickBool(b.values?.sup_tables, baseSup.tables),
    formulas: pickBool(b.values?.sup_formulas, baseSup.formulas),
    geogebra: pickBool(b.values?.sup_geogebra, baseSup.geogebra),
  };
  // This slide's activity set: the designed page wins, else the lesson-wide set.
  const activityTypes: string[] = (Array.isArray(pageSpec?.activityTypes) && pageSpec.activityTypes.length)
    ? pageSpec.activityTypes
    : ((Array.isArray(lesson.activityTypes) && lesson.activityTypes.length) ? lesson.activityTypes : ['mcq', 'fill-blank', 'input']);
  // Quantitative subjects (math + physics/chemistry/etc.) get LaTeX formulas,
  // diagrams and step-by-step working — not plain-ASCII math.
  const mathish = kind === 'math' || /\b(physics|chemistry|chemical|biolog|trigonometry|geometry|calculus|algebra|equation|mechanics|thermodynamic|kinematic|electromag|stoichiom|\bmole\b|reaction|force|velocity|acceleration|vector|momentum|circuit|optics|astronom|statistic|probability)\b/.test(`${subject} ${topic}`.toLowerCase());

  // A pure handwriting/worked-answer/code drill needs no support clutter.
  const onlyDrills = activityTypes.every((t) => t === 'writing' || t === 'annotation' || t === 'code');
  const pureWriting = onlyDrills;
  // A designed page asks ONE question per activity component it lists (in order,
  // duplicates kept — two "mcq4" → two 4-option questions). A designed page may
  // legitimately have NO questions (e.g. reading + media only). Only when there
  // is no designed page do we fall back to one random question for the slide.
  const qKinds: string[] = pageSpec
    ? (Array.isArray(pageSpec.activityTypes) ? pageSpec.activityTypes.slice(0, 12) : [])
    : [rand(activityTypes)];
  const wolfram = wolframAvailable();
  // Every ENABLED support category becomes its own component on the slide. Each
  // is generated by a SEPARATE /api/tools/lesson/support request and streamed in
  // with its own spinner — so a slide can carry several pieces of material
  // without one big generation truncating ("it only built half of it").
  const supportPlan: string[] = [];
  if (!pureWriting) {
    if (support.images) supportPlan.push('image');
    // Code snippets are STEM-only: programming lessons, or when the author
    // explicitly enabled the code toggle — NEVER for a language lesson (a
    // Spanish/French lesson should show grammar as a table, not a code window).
    if ((support.code || kind === 'programming') && kind !== 'language') supportPlan.push('code');
    if (support.tables) supportPlan.push('table');
    if (support.formulas || mathish) {
      // Prefer a real Wolfram step-by-step computation when the key is present.
      if (wolfram && mathish) supportPlan.push('wolfram');
      supportPlan.push('formula');
      if (mathish) { supportPlan.push('image'); supportPlan.push('table'); }  // diagram + steps table
    }
    if (support.geogebra) supportPlan.push('geogebra');   // interactive math graph
  }
  // Distinct types, capped so a slide stays readable.
  const supportTypes = Array.from(new Set(supportPlan)).slice(0, 5);

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json(fbSlide(subject, n, qKinds, mathish));

  const langLine = language
    ? `This is a ${language} lesson: write "content" in ${language} and put the ${translateTo} meaning in "translation".`
    : `Write "content" as ${paras} ${pLen} paragraph(s).`;
  const subjectLine = mathish
    ? `MATH/SCIENCE FORMATTING (important): explain any method as SEVERAL short paragraphs, one step per paragraph (separate steps with a blank line). ${wolfram
        ? 'For SOLVING equations, derivatives, integrals or simplifications, PREFER a "wolfram" support block — Wolfram returns the exact answer AND the step-by-step working, so you do NOT have to hand-write the steps.'
        : 'Use a "code" support block (the working / a proof with #comments) or a 3-column steps "table" for the worked solution.'} AVOID hand-writing long LaTeX derivations. Keep LaTeX to at most ONE clean key formula in a "formula" block; for inline symbols in the prose you may use simple $...$ (e.g. $a^2+b^2=c^2$) but do not force everything into LaTeX. Use a diagram "image" for shapes/physics situations.`
    : kind === 'programming' ? 'Prefer concrete code and tables over prose.'
    : '';
  const qSpec = qKinds.map((k: string, i: number) => {
    if (k === 'mcq2') return `Q${i + 1}: kind "mcq" with EXACTLY 2 options (one correct) — e.g. true/false.`;
    if (k === 'mcq4') return `Q${i + 1}: kind "mcq" with EXACTLY 4 options (one correct).`;
    if (k === 'mcq') { const c = Math.random() < 0.5 ? 2 : 4; return `Q${i + 1}: kind "mcq" with EXACTLY ${c} options (one correct).`; }
    if (k === 'fill-blank') return `Q${i + 1}: kind "fill-blank" — a sentence with "____" and the missing "answer" (+ "accept" variants).`;
    if (k === 'writing') return `Q${i + 1}: kind "writing" — a handwriting drill: give "target" = the exact ${language || subject} character/word to hand-write, and a short "prompt" (e.g. "Write this hiragana"). No options, no answer. The learner will draw it and it will be AI-checked.`;
    if (k === 'annotation') return `Q${i + 1}: kind "annotation" — a worked-answer drill for a REAL ${subject} problem at ${level} level about ${topic || subject} (full math working, or CJK sentences/calligraphy). Give a full "prompt" stating the specific problem/task clearly, and "answer" = the complete expected solution/answer (so the AI can grade the hand-written pages). No options. The learner writes the full worked answer by hand across paginated pages and the AI scans and grades it.`;
    if (k === 'code') return `Q${i + 1}: kind "code" — a worked-answer drill answered in a CODE/TEXT box for a REAL ${subject} problem at ${level} level about ${topic || subject}. Give a full "prompt" stating the specific problem/task, "answer" = the complete expected solution, optionally "language" (e.g. "python", or "" for math/plain text) and a short "starter" (optional scaffold). No options. The learner types the full solution and the AI grades it.`;
    return `Q${i + 1}: kind "input" — a short-answer question with an "answer" (+ "accept" variants).`;
  }).join('\n');
  const system = [
    `Generate slide ${n} of ${total} for a ${subject} lesson at ${level} level.`,
    language ? `Level objective: ${levelGuidance(level)}` : '',
    `LEVEL DEPTH (${level}): ${levelDepthGuidance(level)}`,
    topic ? `Focus: ${topic}.` : '', tone ? `Tone: ${tone}.` : '', lesson.style ? `Style: ${lesson.style}.` : '',
    customNote ? `AUTHOR'S CUSTOM INSTRUCTIONS (honor these wherever they don't conflict with the output schema): ${customNote}` : '',
    pageSpec?.style ? `This slide was designed to use: ${pageSpec.style}` : '',
    priorSummary ? `The learner has already seen (build on these — connect this slide to them and do NOT repeat): ${priorSummary}.` : '',
    'COHESION: Every component on THIS slide — the reading, each visual, and every question — must revolve around ONE coherent concept and clearly relate to each other; do not mix unrelated ideas on the same slide. Across the whole presentation the slides should build on one another into a connected lesson.',
    // Content/level fidelity — the #1 correctness rule.
    `CRITICAL: The teaching and the question MUST genuinely be about "${topic || subject}" and pitched at "${level}" level. If the subject is ${subject}, do NOT drift to unrelated easier material (e.g. for Trigonometry ask about sine/cosine/tangent, angles, identities or triangles — NOT plain arithmetic like "2+2"). Match the true difficulty of ${level}.`,
    ACTIVITY_MENU,
    langLine, subjectLine,
    pageSpec?.reading ? 'Include a substantial READING PASSAGE as the "content" (follow the paragraph length/count above).' : '',
    qKinds.length
      ? 'For THIS slide, teach one idea, then produce these specific questions IN THIS ORDER (still applying the freedom above to vary content):'
      : 'This slide has NO questions — just teach with clear "content". Return "questions": [].',
    qSpec,
    'LENIENT ANSWERS: for fill-blank/input questions, the player accepts close-enough answers (it ignores accents, capitalisation, punctuation and minor typos, and accepts a partial phrase that covers the key word). Provide a generous "accept" list — include no-accent forms, common synonyms, and shorter acceptable phrasings — so a learner who is essentially right is marked correct. Do NOT require the exact full wording.',
    'Do NOT include any support/diagram/table/formula material — that is generated separately. Just write the teaching text and the questions.',
    'OUTPUT RULES (critical): return ONE JSON object with EXACTLY these top-level keys: title, content, translation, questions.',
    '"content" MUST be plain, human-readable teaching text (a sentence or short paragraph) — NEVER JSON, never a nested object, never quoted JSON, never code. Put questions ONLY in the "questions" array. Do not wrap the whole object in a string or another object.',
    'Return STRICT JSON only — no markdown fences, no commentary.',
  ].filter(Boolean).join('\n');
  const user = `Return JSON exactly like: { "title": "short title", "content": "one short teaching paragraph in plain prose", "translation": "meaning or empty", "questions": [ { "kind": "mcq|fill-blank|input|writing|annotation|code", "prompt": "the question text", "options": [{"text","correct","explanation"}], "answer": "the expected answer/solution", "accept": ["..."], "target": "for writing", "language": "for code, e.g. python or empty", "starter": "optional code/text scaffold" } ] }. Only include the fields the chosen kind needs.`;

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.7, maxTokens: 2600 });
    const content = cleanContent(r?.content);
    const questions = (Array.isArray(r?.questions) ? r.questions : []).map(cleanQuestion).filter(Boolean);
    // Fall back only when content is unusable, or when questions WERE requested
    // but none came back. A designed reading-only page (qKinds empty) legitimately
    // has no questions, so an empty array is fine there.
    if (!content || (qKinds.length > 0 && !questions.length)) return NextResponse.json(fbSlide(subject, n, qKinds, mathish));
    return NextResponse.json({
      title: String(r.title || `${subject} — slide ${n}`).slice(0, 100),
      content: content.slice(0, 2000),
      translation: cleanContent(r.translation).slice(0, 800),
      // The support materials are streamed in separately, one request each.
      supportPlan: supportTypes, support: null, questions, fallback: false,
    });
  } catch {
    return NextResponse.json(fbSlide(subject, n, qKinds, mathish));
  }
}
