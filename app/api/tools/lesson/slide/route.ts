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
const { wolframAvailable, wolframShortAnswer, wolframFull } = require('@/src/connectors/wolfram');

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
  const kind = ['mcq', 'fill-blank', 'input', 'writing', 'annotation', 'code'].includes(q?.kind) ? q.kind : 'mcq';
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
function fbSlide(subject: string, n: number, kinds: string[], mathish = false) {
  const kind = rand(kinds);
  let question: any;
  if (kind === 'mcq') {
    const want = Math.random() < 0.5 ? 2 : 4;
    const opts = [{ text: 'The correct answer', correct: true }, { text: 'A distractor' }, { text: 'Another option' }, { text: 'A wrong option' }].slice(0, want);
    question = { kind: 'mcq', prompt: `Which is correct about ${subject}?`, options: cleanOptions(opts, want) };
  } else if (kind === 'writing') {
    question = { kind: 'writing', prompt: 'Write this by hand:', target: 'A' };
  } else if (kind === 'annotation') {
    question = { kind: 'annotation', prompt: `Work out and write the full answer for this ${subject} problem on the pad.`, answer: '' };
  } else if (kind === 'code') {
    question = { kind: 'code', prompt: `Write the answer/solution for this ${subject} problem in the code box.`, answer: '', language: '', starter: '' };
  } else {
    question = { kind, prompt: kind === 'fill-blank' ? `${subject} has ____ key idea per slide.` : `Type a key term from this ${subject} slide.`, answer: 'one', accept: ['one', '1'] };
  }
  // Math/science demo slides show a real typeset formula so the KaTeX rendering
  // is visible even without an AI key.
  const support = mathish ? { type: 'formula', latex: 'c = \\sqrt{a^2 + b^2}', caption: 'Example formula (Pythagoras)' } : null;
  const content = mathish
    ? `This is practice slide ${n} about ${subject}. Formulas render cleanly, e.g. $a^2 + b^2 = c^2$ and $E = mc^2$. Connect an AI key for full generated content.`
    : `This is practice slide ${n} about ${subject}. Connect an AI key for full generated content.`;
  return {
    title: `${subject} — slide ${n}`,
    content,
    translation: '', support, questions: [question], fallback: true,
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
  // Quantitative subjects (math + physics/chemistry/etc.) get LaTeX formulas,
  // diagrams and step-by-step working — not plain-ASCII math.
  const mathish = kind === 'math' || /\b(physics|chemistry|chemical|biolog|trigonometry|geometry|calculus|algebra|equation|mechanics|thermodynamic|kinematic|electromag|stoichiom|\bmole\b|reaction|force|velocity|acceleration|vector|momentum|circuit|optics|astronom|statistic|probability)\b/.test(`${subject} ${topic}`.toLowerCase());

  // A pure handwriting/worked-answer/code drill needs no support clutter.
  const onlyDrills = activityTypes.every((t) => t === 'writing' || t === 'annotation' || t === 'code');
  const pureWriting = onlyDrills;
  // Exactly ONE question per slide — keeps the player's Back / Next / Check / Finish
  // navigation unambiguous, and lets a lesson MIX types slide to slide.
  const qKinds = [rand(activityTypes)];
  const wolfram = wolframAvailable();
  const allowedSupport: string[] = [];
  if (support.images) allowedSupport.push('image');
  // Code snippets: for programming, AND for language grammar (show syntax logic as code).
  if (support.code || kind === 'programming' || kind === 'language') allowedSupport.push('code');
  if (support.tables) allowedSupport.push('table');
  if (support.formulas || mathish) {
    // Prefer a real Wolfram computation when the API key is present — it can show
    // the STEP-BY-STEP solution. Weight it heavily for quantitative subjects.
    // When it is NOT available, lean on a worked code snippet (the computation /
    // a proof with comments) — that reads better than a bare formula.
    if (wolfram) { allowedSupport.push('wolfram'); if (mathish) allowedSupport.push('wolfram'); }
    allowedSupport.push('formula');
    if (mathish) {
      allowedSupport.push('code');
      allowedSupport.push('table');                 // 3-column "steps" table
      allowedSupport.push('image');                 // a labelled diagram (triangle, free-body…)
      if (!wolfram) allowedSupport.push('code');     // extra weight: bias to code when no Wolfram
    }
  }
  const supportType = (!pureWriting && allowedSupport.length && Math.random() < 0.7) ? rand(allowedSupport) : null;

  if (!geminiEnabled && !deepseekEnabled) return NextResponse.json(fbSlide(subject, n, activityTypes, mathish));

  const langLine = language
    ? `This is a ${language} lesson: write "content" in ${language} and put the ${translateTo} meaning in "translation".`
    : `Write "content" as ${paras} ${pLen} paragraph(s).`;
  const subjectLine = mathish
    ? `MATH/SCIENCE FORMATTING (important): explain any method as SEVERAL short paragraphs, one step per paragraph (separate steps with a blank line). ${wolfram
        ? 'For SOLVING equations, derivatives, integrals or simplifications, PREFER a "wolfram" support block — Wolfram returns the exact answer AND the step-by-step working, so you do NOT have to hand-write the steps.'
        : 'Use a "code" support block (the working / a proof with #comments) or a 3-column steps "table" for the worked solution.'} AVOID hand-writing long LaTeX derivations. Keep LaTeX to at most ONE clean key formula in a "formula" block; for inline symbols in the prose you may use simple $...$ (e.g. $a^2+b^2=c^2$) but do not force everything into LaTeX. Use a diagram "image" for shapes/physics situations.`
    : kind === 'programming' ? 'Prefer concrete code and tables over prose.'
    : '';
  const qSpec = qKinds.map((k, i) => {
    if (k === 'mcq') { const c = Math.random() < 0.5 ? 2 : 4; return `Q${i + 1}: kind "mcq" with EXACTLY ${c} options (one correct).`; }
    if (k === 'fill-blank') return `Q${i + 1}: kind "fill-blank" — a sentence with "____" and the missing "answer" (+ "accept" variants).`;
    if (k === 'writing') return `Q${i + 1}: kind "writing" — a handwriting drill: give "target" = the exact ${language || subject} character/word to hand-write, and a short "prompt" (e.g. "Write this hiragana"). No options, no answer. The learner will draw it and it will be AI-checked.`;
    if (k === 'annotation') return `Q${i + 1}: kind "annotation" — a worked-answer drill for a REAL ${subject} problem at ${level} level about ${topic || subject} (full math working, or CJK sentences/calligraphy). Give a full "prompt" stating the specific problem/task clearly, and "answer" = the complete expected solution/answer (so the AI can grade the hand-written pages). No options. The learner writes the full worked answer by hand across paginated pages and the AI scans and grades it.`;
    if (k === 'code') return `Q${i + 1}: kind "code" — a worked-answer drill answered in a CODE/TEXT box for a REAL ${subject} problem at ${level} level about ${topic || subject}. Give a full "prompt" stating the specific problem/task, "answer" = the complete expected solution, optionally "language" (e.g. "python", or "" for math/plain text) and a short "starter" (optional scaffold). No options. The learner types the full solution and the AI grades it.`;
    return `Q${i + 1}: kind "input" — a short-answer question with an "answer" (+ "accept" variants).`;
  }).join('\n');
  const codeHint = kind === 'language'
    ? 'a short snippet showing the SYNTAX/grammar logic (e.g. "subject + verb(conjugated) + object", or a conjugation pattern)'
    : kind === 'math'
      ? 'a short worked computation or proof shown as code/pseudocode, using COMMENTS to explain each step (e.g. "# derivative of x^2\\nf = x**2\\n# power rule: 2*x**(2-1)\\nf_prime = 2*x") — no Wolfram needed'
      : 'a short, correct code snippet';
  const supSpec = supportType === 'image' ? (mathish
      ? 'Also include support = { "type": "image", "prompt": "a CLEAN, LABELLED reference diagram to help solve the problem — e.g. a right triangle with the base, height, hypotenuse and angle labelled; a physics free-body/situation sketch with forces and values; a geometry figure with measurements. Describe it precisely so it reads like a textbook diagram.", "caption": "what the diagram shows" }.'
      : 'Also include support = { "type": "image", "prompt": "a vivid image description", "caption": "..." }.')
    : supportType === 'code' ? `Also include support = { "type": "code", "language": "...", "code": ${JSON.stringify(codeHint)} }.`
    : supportType === 'table' ? (mathish
      ? 'Also include support = { "type": "table", "headers": ["Step", "Equation", "What we did"], "rows": [["1", "the equation for this step (plain math text)", "short reason"], ...] } — a 3-column step-by-step working table.'
      : 'Also include support = { "type": "table", "headers": [...], "rows": [[...]] }.')
    : supportType === 'wolfram' ? 'Also include support = { "type": "wolfram", "query": "a precise, self-contained Wolfram Alpha query that SOLVES or COMPUTES this concept so it can show the STEP-BY-STEP working (e.g. \\"solve x^2-5x+6=0\\", \\"derivative of sin(x)*x^2\\", \\"integrate 1/(1+x^2)\\", \\"simplify (x^2-1)/(x-1)\\")", "latex": "the key formula in LaTeX", "caption": "what it shows" }. Wolfram will compute the answer AND return the step-by-step solution — so make the query something Wolfram can work out (an equation to solve, a derivative/integral/simplification), not an open-ended question.'
    : supportType === 'formula' ? 'Also include support = { "type": "formula", "latex": "a valid LaTeX formula (e.g. \\"c = \\\\sqrt{a^2+b^2}\\", \\"\\\\frac{d}{dx}x^n = n x^{n-1}\\") — NOT plain ASCII", "caption": "what it means" }.'
    : 'Set support to null.';

  const system = [
    `Generate slide ${n} of ${total} for a ${subject} lesson at ${level} level.`,
    language ? `Level objective: ${levelGuidance(level)}` : '',
    topic ? `Focus: ${topic}.` : '', tone ? `Tone: ${tone}.` : '', lesson.style ? `Style: ${lesson.style}.` : '',
    priorSummary ? `Avoid repeating: ${priorSummary}.` : '',
    // Content/level fidelity — the #1 correctness rule.
    `CRITICAL: The teaching and the question MUST genuinely be about "${topic || subject}" and pitched at "${level}" level. If the subject is ${subject}, do NOT drift to unrelated easier material (e.g. for Trigonometry ask about sine/cosine/tangent, angles, identities or triangles — NOT plain arithmetic like "2+2"). Match the true difficulty of ${level}.`,
    ACTIVITY_MENU,
    langLine, subjectLine,
    'For THIS slide, teach one idea, then produce these specific questions (still applying the freedom above to vary content):', qSpec, supSpec,
    'OUTPUT RULES (critical): return ONE JSON object with EXACTLY these top-level keys: title, content, translation, support, questions.',
    '"content" MUST be plain, human-readable teaching text (a sentence or short paragraph) — NEVER JSON, never a nested object, never quoted JSON, never code. Put questions ONLY in the "questions" array, and support material ONLY in "support". Do not wrap the whole object in a string or another object.',
    'Return STRICT JSON only — no markdown fences, no commentary.',
  ].filter(Boolean).join('\n');
  const user = `Return JSON exactly like: { "title": "short title", "content": "one short teaching paragraph in plain prose", "translation": "meaning or empty", "support": {...} or null, "questions": [ { "kind": "mcq|fill-blank|input|writing|annotation|code", "prompt": "the question text", "options": [{"text","correct","explanation"}], "answer": "the expected answer/solution", "accept": ["..."], "target": "for writing", "language": "for code, e.g. python or empty", "starter": "optional code/text scaffold" } ] }. Only include the fields the chosen kind needs.`;

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.7, maxTokens: 1800 });
    const content = cleanContent(r?.content);
    const questions = (Array.isArray(r?.questions) ? r.questions : []).map(cleanQuestion).filter(Boolean);
    // If content came back empty or as a JSON blob we couldn't salvage, or there
    // are no valid questions, use the deterministic fallback instead of showing junk.
    if (!content || !questions.length) return NextResponse.json(fbSlide(subject, n, activityTypes, mathish));
    let sup: any = null;
    const s = r.support;
    if (s?.type === 'image') sup = { type: 'image', url: await makeImage(String(s.prompt || subject)), caption: String(s.caption || '') };
    else if (s?.type === 'code') sup = { type: 'code', language: String(s.language || '').slice(0, 20), code: String(s.code || '').slice(0, 1200) };
    else if (s?.type === 'table' && Array.isArray(s.headers)) sup = { type: 'table', headers: s.headers.map((h: any) => String(h).slice(0, 40)).slice(0, 6), rows: (Array.isArray(s.rows) ? s.rows : []).slice(0, 12).map((row: any) => (Array.isArray(row) ? row.map((c: any) => String(c).slice(0, 80)).slice(0, 6) : [])) };
    else if (s?.type === 'wolfram') {
      // Compute the answer AND fetch the step-by-step working via Wolfram; degrade
      // to a formula when Wolfram can't interpret the query.
      const [result, steps] = await Promise.all([wolframShortAnswer(s.query), wolframFull(s.query)]);
      const base = { query: String(s.query || '').slice(0, 300), latex: String(s.latex || '').slice(0, 300), caption: String(s.caption || '').slice(0, 200) };
      sup = (result || (steps && steps.length))
        ? { type: 'wolfram', ...base, result: result ? String(result).slice(0, 400) : '', steps: Array.isArray(steps) ? steps : [] }
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
    return NextResponse.json(fbSlide(subject, n, activityTypes, mathish));
  }
}
