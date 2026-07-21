import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, moonshotEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
import { recordTextUsage } from '@/lib/usage-log';
import { MAX_SLIDES } from '@/lib/tool-schema';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SAFETY_GUARDRAILS } = require('@/src/ai/prompts/guardrails');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const textAI = () => openrouterEnabled || geminiEnabled || deepseekEnabled || moonshotEnabled;

// Pull an explicit slide count out of the author's goal text ("only 2 slides",
// "make it three pages") so a requested number is HONORED exactly. Returns 0 when
// no count was asked for (then the AI picks a sensible length).
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
function requestedCount(text: string): number {
  const m = text.toLowerCase().match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:slides?|pages?|cards?)\b/);
  if (!m) return 0;
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : (NUM_WORDS[m[1]] || 0);
  return n >= 1 && n <= 20 ? n : 0;
}

// The presentation components the AI may place on a slide (catalog ids). Kept in
// sync with STUDIO_CATEGORIES (the "for: presentation" + shared items). Gated
// integrations (music/news, specific AI providers) are intentionally excluded so
// a designed lesson always plays.
const ALLOWED = new Set([
  'reading', 'mcq4', 'mcq2', 'fill-blank', 'input', 'annotation', 'code', 'writing',
  'image', 'table', 'wolfram', 'latex', 'geogebra', 'codeblock', 'audio', 'translate',
  'note', 'deco-hint', 'deco-note', 'deco-banner',
]);

// POST { subject, title, context, difficulty, tone, provider }
//   -> { pages: [ { components: [{id}], length, paragraphs } ... ] }
// The AI DESIGNS a full multi-slide comprehension lesson for the subject, choosing
// which components each slide shows/asks — adapted to the KIND of subject (STEM
// practice vs. humanities/arts reading & reflection) — so pressing a topic pick
// yields a real, progress-checking presentation instead of one empty slide.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const subject = String(b.subject || b.title || '').slice(0, 200);
  const title = String(b.title || subject).slice(0, 200);
  const context = String(b.context || '').slice(0, 2000);
  const difficulty = String(b.difficulty || '').slice(0, 40);
  const tone = String(b.tone || '').slice(0, 40);
  // The author's slide-template library (component sequences + #hashtags) — the AI
  // should build each slide from a matching template, or a custom one if none fits.
  const templateGuide = String(b.templateGuide || '').slice(0, 4000);
  const provider = ['openrouter', 'gemini', 'deepseek', 'moonshot'].includes(String(b.provider)) ? String(b.provider) : 'auto';
  // mode: 'suggest' = fresh deck (default); 'next' = ONE new slide after the deck;
  // 'edit' = MODIFY the existing slides (and add more) per the instruction.
  const mode = ['suggest', 'next', 'edit'].includes(String(b.mode)) ? String(b.mode) : 'suggest';
  // The slides the user already has, as a simple [{components:[id|{id,instr}], length, paragraphs}].
  const existing = (Array.isArray(b.existing) ? b.existing : []).slice(0, 12).map((pg: any) => ({
    components: (Array.isArray(pg?.components) ? pg.components : []).map((c: any) => (typeof c === 'string' ? { id: c } : { id: String(c?.id || ''), instr: String(c?.instr || '').slice(0, 400) })).filter((c: any) => c.id).slice(0, 8),
    length: ['brief', 'medium', 'detailed'].includes(pg?.length) ? pg.length : 'medium',
    paragraphs: Math.max(1, Math.min(4, parseInt(pg?.paragraphs, 10) || 1)),
  })).filter((pg: any) => pg.components.length);
  // Fold any attached TEXT documents into the context the designer considers.
  const docText = (Array.isArray(b.docs) ? b.docs : []).map((d: any) => String(d?.text || '')).filter(Boolean).join('\n\n').slice(0, 6000);
  const fullContext = [context, docText && `Reference document(s):\n${docText}`].filter(Boolean).join('\n\n').slice(0, 8000);
  // If the author explicitly asks for images/visuals, put an image on (nearly)
  // every slide so the request is honoured.
  const wantsImages = /\b(image|images|picture|pictures|photo|photos|visual|visuals|illustrat|diagram)\b/i.test(fullContext);
  const imageRule = wantsImages ? ' THE AUTHOR WANTS IMAGES: include an "image" component on EVERY slide (or all but the pure-quiz recap).' : '';
  // A subject is enough, but so is a goal/context or an attached document or an
  // existing deck to edit — the AI infers the subject from whatever is provided.
  if (!subject && !fullContext && !existing.length) return NextResponse.json({ error: 'Add a subject, a goal, or a document first.' }, { status: 200 });

  // A sensible fallback plan so a lesson is always produced even with no AI: a
  // short teach→practice→check arc. (Subject-agnostic; the generator fills content.)
  const fallback = {
    pages: [
      { components: [{ id: 'deco-banner' }, { id: 'reading' }], length: 'medium', paragraphs: 2 },
      { components: [{ id: 'reading' }, { id: 'mcq4' }], length: 'medium', paragraphs: 1 },
      { components: [{ id: 'reading' }, { id: 'fill-blank' }, { id: 'deco-hint' }], length: 'medium', paragraphs: 1 },
      { components: [{ id: 'reading' }, { id: 'input' }], length: 'medium', paragraphs: 1 },
      { components: [{ id: 'mcq4' }, { id: 'mcq2' }, { id: 'input' }], length: 'brief', paragraphs: 1 },
    ],
  };
  if (!textAI()) return NextResponse.json({ ...fallback, title: title || subject, subject });

  const palette = [
    'IMPORTANT — these are COMPONENT-BASED slides: every slide is BUILT ONLY from the components below. You do not write free-form pages; you compose each slide by picking and ordering these components deliberately, so be very aware of the toolbox you have to build each slide from.',
    'You lay out each SLIDE by choosing an ordered list of components. Each component is either an id string, or { "id": string, "instr": short note of exactly what to teach/ask there }. Use only these ids:',
    '• reading — a reading passage / explanation of the concept.',
    '• note — a hidden instruction telling the slide generator exactly what to teach or show here (explanations, worked examples, tooltips, definitions).',
    '• deco-hint — a tappable hint pencil (a guiding question). deco-note — a sticky-note message. deco-banner — a headline banner (good on slide 1).',
    '• mcq4 / mcq2 — multiple-choice checks (4 options / true-false). fill-blank — fill in the missing word. input — a typed answer the AI grades (short answer or reflection). code — an answer typed in a code/text box, AI-graded. annotation — the learner works the full answer out by hand on a paper pad, AI-graded (math working, derivations, diagrams, labelling).',
    '• latex — a typeset formula. wolfram — step-by-step equation solving. geogebra — an interactive graph/plot. codeblock — a code / pseudocode snippet. table — a table (data, comparisons, TIMELINES). image — an AI diagram or picture.',
    '• audio — the content is read aloud. translate — a translate button (language subjects).',
  ].join('\n');
  // An explicit "N slides/pages" in the goal is obeyed exactly; otherwise 5–8.
  // Capped at MAX_SLIDES so "make 50 slides" in the goal can't run away.
  const wantCount = Math.min(MAX_SLIDES, requestedCount(fullContext) || 0) || 0;
  const countRule = wantCount
    ? `1. Produce EXACTLY ${wantCount} slide${wantCount === 1 ? '' : 's'} — the author asked for ${wantCount}. Do NOT add or drop any. Fit the whole lesson into exactly ${wantCount}: if that is few, pack the needed teaching + activities into those slides (using several components, and more than one activity on a slide when it helps); if that is many, spread the material out. Never exceed or fall short of ${wantCount}.`
    : '1. Produce 5–8 slides in a sensible teaching ORDER: an intro/overview first, then each middle slide teaches ONE sub-idea and immediately PRACTISES it, and a final slide is a comprehension CHECK / recap.';
  const designRules = [
    'DESIGN RULES:',
    countRule,
    '2. EVERY slide carries substance to read/see AND most slides include an activity so progress is measured. VARY activity types across the lesson. Keep each slide focused: about 2–5 components.',
    '3. ANALYZE THE TOOLBOX AND HONOR THE REQUEST: read the author\'s goal and pick the components that literally deliver what they asked for — "reading"/"text" → reading; "tooltip"/"hint"/"explain"/"definition" → deco-hint (a tappable hint) and/or note (a hidden teaching instruction); "image"/"picture"/"show me" → image; "draw"/"sketch"/"annotate"/"work it out by hand" → annotation (or writing for a single character); "AI evaluation"/"grade"/"check my answer"/"assess" → an AI-graded activity (input, code, or annotation); "quiz"/"multiple choice" → mcq4/mcq2; "fill in the blank" → fill-blank. If they name several (e.g. text + image + tooltip + AI evaluation), make sure EACH appears on the relevant slide(s). You have all these buttons — use the ones that match.',
    '4. ONE reading + ONE well-chosen activity is the base unit. NEVER put two of the SAME activity type on a single slide for the same text (e.g. two mcq4 about one passage is pointless). If a slide should test more than once, either use two DIFFERENT activity types, or give the second activity its OWN reading/note above it — a slide can legitimately carry two teach→check pairs stacked so the learner scrolls down to the next one, rather than turning the page. Order components top-to-bottom the way a learner should meet them (read/see first, then do).',
    '5. ADAPT the mix to the subject KIND: Physics / chemistry / engineering / quantitative math → reading + latex (formulas) + geogebra (graphs) + image (diagrams) + table, assessed with mcq / fill-blank / typed (input); Humanities / arts / social science / theory → reading + image + table (timelines) + mcq / fill-blank / input / deco-hint, few or no formulas; Language → reading + audio + translate + fill-blank + input, and a two-column table for grammar. Pick activities that genuinely fit the subject.',
    '5b. STRICT COMPONENT GATING — do NOT misuse specialised components: use `code` / `codeblock` ONLY for PROGRAMMING / computer-science / software subjects — NEVER for physics, chemistry, pure math, humanities, language or any non-coding topic. Use `annotation` ONLY when the answer truly requires DRAWING / sketching / diagramming / labelling / working a derivation out BY HAND — never as a generic written answer (use `input` for a typed answer). Use `writing` only for practising a single handwritten character/symbol. When unsure, prefer reading + image + mcq/fill/typed. A theoretical, text-based subject should have NO code and NO annotation.',
    '6. The author will be able to EDIT every slide, its components and its order afterwards, so propose a confident best-effort design — don\'t leave slides empty "for them to fill in".',
  ].join('\n');
  // Templates come first: the author curated a library of slide patterns. Tell the
  // AI to PICK a matching template per slide (by #hashtags) and follow its order, or
  // compose a custom one from the palette when nothing fits.
  const templateRule = templateGuide ? [
    'SLIDE TEMPLATES — USE THESE FIRST. The author curated a library of slide templates: ordered component sequences, each tagged with #hashtags for the subjects/levels it suits. For EVERY slide, PICK the template whose #hashtags best match this subject and level, and FOLLOW its component order. Only if NO template fits should you COMPOSE A CUSTOM slide from the palette above — still text-first. Vary templates across the deck so it is not repetitive.',
    'Map template names/super-components to palette ids: Text/Statement → reading; Visual → image OR table OR latex OR geogebra (pick what fits); Multiple choice → mcq4; 2-option/True-false → mcq2; Multi-select → mcq4; Fill blank → fill-blank; Typed/Ask-AI → input; Code box → code; Code → codeblock; Formula → latex; Graph → geogebra; Audio → audio; Handwriting → writing; Annotate → annotation; Button/action → deco-note.',
    `THE TEMPLATE LIBRARY: ${templateGuide}`,
  ].join('\n') : '';
  const shape = `Return STRICT JSON only: { "title": short lesson title, "subject": the subject/topic, "pages": [ { "components": ["reading",{"id":"mcq4","instr":"..."}], "length": "brief|medium|detailed", "paragraphs": 1 }, ... ] }. Always fill in a good "title" and "subject" (invent sensible ones if the user left them blank).${imageRule}\n${SAFETY_GUARDRAILS}`;

  let system: string; let user: string; let minPages = 3; let maxPages = 10;
  const existingJson = JSON.stringify(existing);
  if (mode === 'edit' && existing.length) {
    system = ['You are a curriculum designer for SketchLearn editing an EXISTING presentation as a chat-driven MODIFIER.', palette, designRules, templateRule,
      'You are given the current slides. Read the user\'s instruction and apply EXACTLY the scope they ask for — it may be ANY of: modify ONE specific slide (e.g. "change slide 3"); change or ADD something to ALL/every slide; ADD one or more new slides; DELETE slide(s); rebuild a slide from a different template/components; or COMPLETELY REDESIGN the whole deck from scratch. If they name a slide number, change only that slide and keep the others EXACTLY as given. If they say "all"/"every"/"each", apply the change to every slide. If they ask to redesign/start over, produce a fresh deck. Otherwise make the smallest change that satisfies the request and preserve every slide you were not asked to touch. ALWAYS return the FULL updated deck (all slides, in order).', shape].join('\n');
    user = [`Subject / topic: ${subject || '(infer)'}`, title ? `Title: ${title}` : '', difficulty ? `Level: ${difficulty}` : '', tone ? `Tone: ${tone}` : '',
      `CURRENT SLIDES (JSON): ${existingJson}`, fullContext ? `INSTRUCTION / what to change:\n${fullContext}` : 'Improve and complete the deck.', 'Return the full updated presentation now.'].filter(Boolean).join('\n');
    maxPages = 12;
  } else if (mode === 'next') {
    system = ['You are a curriculum designer for SketchLearn adding ONE next slide to a presentation.', palette, templateRule,
      'Design exactly ONE new slide that logically FOLLOWS the current deck (a new sub-idea + a fitting activity). Do not repeat existing slides.', shape].join('\n');
    user = [`Subject / topic: ${subject || '(infer)'}`, title ? `Title: ${title}` : '', tone ? `Tone: ${tone}` : '',
      existing.length ? `CURRENT SLIDES (JSON): ${existingJson}` : '', fullContext ? `Focus / instruction:\n${fullContext}` : '', 'Return JSON with a single-item "pages" array (the one new slide).'].filter(Boolean).join('\n');
    minPages = 1; maxPages = 1;
  } else {
    system = ['You are a curriculum designer for SketchLearn. Design a COMPLETE multi-slide presentation that TEACHES a subject and continuously EVALUATES comprehension.', palette, designRules, templateRule, shape].join('\n');
    user = [`Subject / topic: ${subject}`, title && title !== subject ? `Lesson title: ${title}` : '', difficulty ? `Level: ${difficulty}` : '', tone ? `Tone: ${tone}` : '',
      fullContext ? `Extra context / goal:\n${fullContext}` : '', 'Design the full slide-by-slide presentation now.'].filter(Boolean).join('\n');
  }
  // An explicit "N slides" request caps the deck at exactly N (except in "next"
  // mode, which always adds a single slide). We keep the minimum at 1 so a short
  // count returns the AI's N slides rather than falling back to the generic deck.
  if (wantCount && mode !== 'next') { minPages = 1; maxPages = wantCount; }

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: mode === 'edit' ? 0.4 : 0.5, maxTokens: 3000, provider });
    await recordTextUsage({ username: a.user.username, kind: 'studio-design', provider: provider === 'auto' ? 'auto' : provider, input: system + user, output: JSON.stringify(r || {}), subject: subject || title });
    const raw: any[] = Array.isArray(r?.pages) ? r.pages : (Array.isArray(r) ? r : []);
    const pages = raw.map((pg: any) => {
      const comps = (Array.isArray(pg?.components) ? pg.components : [])
        .map((c: any) => (typeof c === 'string' ? { id: c } : { id: String(c?.id || ''), instr: String(c?.instr || '').slice(0, 400) }))
        .filter((c: any) => ALLOWED.has(c.id))
        .slice(0, 6);
      const length = ['brief', 'medium', 'detailed'].includes(pg?.length) ? pg.length : 'medium';
      const paragraphs = Math.max(1, Math.min(4, parseInt(pg?.paragraphs, 10) || 1));
      return { components: comps, length, paragraphs };
    }).filter((pg: any) => pg.components.length > 0).slice(0, Math.min(maxPages, MAX_SLIDES));
    const outTitle = String(r?.title || title || subject || '').slice(0, 120);
    const outSubject = String(r?.subject || subject || title || '').slice(0, 120);
    if (pages.length < minPages) {
      // For edit/next, echo the existing deck rather than a generic template.
      if (existing.length) return NextResponse.json({ pages: existing, title: outTitle, subject: outSubject });
      return NextResponse.json({ ...fallback, title: outTitle, subject: outSubject });
    }
    return NextResponse.json({ pages, title: outTitle, subject: outSubject });
  } catch {
    if (existing.length) return NextResponse.json({ pages: existing, title: title || subject, subject });
    return NextResponse.json({ ...fallback, title: title || subject, subject });
  }
}
