import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, moonshotEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const textAI = () => openrouterEnabled || geminiEnabled || deepseekEnabled || moonshotEnabled;

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
    'You lay out each SLIDE by choosing an ordered list of components. Each component is either an id string, or { "id": string, "instr": short note of exactly what to teach/ask there }. Use only these ids:',
    '• reading — a reading passage / explanation of the concept.',
    '• note — a hidden instruction telling the slide generator exactly what to teach or show here (explanations, worked examples, tooltips, definitions).',
    '• deco-hint — a tappable hint pencil (a guiding question). deco-note — a sticky-note message. deco-banner — a headline banner (good on slide 1).',
    '• mcq4 / mcq2 — multiple-choice checks (4 options / true-false). fill-blank — fill in the missing word. input — a typed answer the AI grades (short answer or reflection). code — an answer typed in a code/text box, AI-graded. annotation — the learner works the full answer out by hand on a paper pad, AI-graded (math working, derivations, diagrams, labelling).',
    '• latex — a typeset formula. wolfram — step-by-step equation solving. geogebra — an interactive graph/plot. codeblock — a code / pseudocode snippet. table — a table (data, comparisons, TIMELINES). image — an AI diagram or picture.',
    '• audio — the content is read aloud. translate — a translate button (language subjects).',
  ].join('\n');
  const designRules = [
    'DESIGN RULES:',
    '1. Produce 5–8 slides in a sensible teaching ORDER: an intro/overview first, then each middle slide teaches ONE sub-idea and immediately PRACTISES it, and a final slide is a comprehension CHECK / recap.',
    '2. EVERY slide carries substance to read/see AND most slides include an activity so progress is measured. VARY activity types across the lesson. Keep each slide focused: about 2–4 components.',
    '3. ADAPT the mix to the subject KIND: STEM/quantitative → latex/codeblock/geogebra/image/table + wolfram + assess with annotation/code/input/mcq; Humanities/arts/text → reading/image/table (timelines) + mcq/fill-blank/input/deco-hint, few or no formulas; Language → reading/audio/translate/fill-blank/input. Pick activities that genuinely fit.',
  ].join('\n');
  const shape = 'Return STRICT JSON only: { "title": short lesson title, "subject": the subject/topic, "pages": [ { "components": ["reading",{"id":"mcq4","instr":"..."}], "length": "brief|medium|detailed", "paragraphs": 1 }, ... ] }. Always fill in a good "title" and "subject" (invent sensible ones if the user left them blank).';

  let system: string; let user: string; let minPages = 3; let maxPages = 10;
  const existingJson = JSON.stringify(existing);
  if (mode === 'edit' && existing.length) {
    system = ['You are a curriculum designer for SketchLearn editing an EXISTING presentation.', palette, designRules,
      'You are given the current slides. APPLY the user\'s instruction: modify the existing slides where asked (change/add/remove components, adjust order, level, density, and the per-component instr) AND add new slides if the instruction calls for it. Keep the slides that still make sense. Return the FULL updated deck.', shape].join('\n');
    user = [`Subject / topic: ${subject || '(infer)'}`, title ? `Title: ${title}` : '', difficulty ? `Level: ${difficulty}` : '', tone ? `Tone: ${tone}` : '',
      `CURRENT SLIDES (JSON): ${existingJson}`, fullContext ? `INSTRUCTION / what to change:\n${fullContext}` : 'Improve and complete the deck.', 'Return the full updated presentation now.'].filter(Boolean).join('\n');
    maxPages = 12;
  } else if (mode === 'next') {
    system = ['You are a curriculum designer for SketchLearn adding ONE next slide to a presentation.', palette,
      'Design exactly ONE new slide that logically FOLLOWS the current deck (a new sub-idea + a fitting activity). Do not repeat existing slides.', shape].join('\n');
    user = [`Subject / topic: ${subject || '(infer)'}`, title ? `Title: ${title}` : '', tone ? `Tone: ${tone}` : '',
      existing.length ? `CURRENT SLIDES (JSON): ${existingJson}` : '', fullContext ? `Focus / instruction:\n${fullContext}` : '', 'Return JSON with a single-item "pages" array (the one new slide).'].filter(Boolean).join('\n');
    minPages = 1; maxPages = 1;
  } else {
    system = ['You are a curriculum designer for SketchLearn. Design a COMPLETE multi-slide presentation that TEACHES a subject and continuously EVALUATES comprehension.', palette, designRules, shape].join('\n');
    user = [`Subject / topic: ${subject}`, title && title !== subject ? `Lesson title: ${title}` : '', difficulty ? `Level: ${difficulty}` : '', tone ? `Tone: ${tone}` : '',
      fullContext ? `Extra context / goal:\n${fullContext}` : '', 'Design the full slide-by-slide presentation now.'].filter(Boolean).join('\n');
  }

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: mode === 'edit' ? 0.4 : 0.5, maxTokens: 3000, provider });
    const raw: any[] = Array.isArray(r?.pages) ? r.pages : (Array.isArray(r) ? r : []);
    const pages = raw.map((pg: any) => {
      const comps = (Array.isArray(pg?.components) ? pg.components : [])
        .map((c: any) => (typeof c === 'string' ? { id: c } : { id: String(c?.id || ''), instr: String(c?.instr || '').slice(0, 400) }))
        .filter((c: any) => ALLOWED.has(c.id))
        .slice(0, 6);
      const length = ['brief', 'medium', 'detailed'].includes(pg?.length) ? pg.length : 'medium';
      const paragraphs = Math.max(1, Math.min(4, parseInt(pg?.paragraphs, 10) || 1));
      return { components: comps, length, paragraphs };
    }).filter((pg: any) => pg.components.length > 0).slice(0, maxPages);
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
