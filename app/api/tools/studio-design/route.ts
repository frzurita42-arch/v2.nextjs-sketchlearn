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
  if (!subject) return NextResponse.json({ error: 'A subject is required.' }, { status: 200 });

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
  if (!textAI()) return NextResponse.json(fallback);

  const system = [
    'You are a curriculum designer for SketchLearn, a playable lesson platform. Design a COMPLETE multi-slide presentation that TEACHES a subject and continuously EVALUATES the learner\'s comprehension and progress. Think about what the presentation can do and use its components purposefully.',
    'You lay out each SLIDE by choosing an ordered list of component ids from this palette (use only these ids):',
    '• reading — a reading passage / explanation of the concept.',
    '• note — a hidden instruction telling the slide generator exactly what to teach or show here (use it to add explanations, worked examples, tooltips, definitions).',
    '• deco-hint — a tappable hint pencil (a guiding question or nudge). deco-note — a sticky-note message. deco-banner — a headline banner (good on the first slide).',
    '• mcq4 / mcq2 — multiple-choice checks (4 options / true-false). fill-blank — fill in the missing word. input — a typed answer the AI grades (short answer or reflection/mini-essay). code — an answer typed in a code/text box, AI-graded. annotation — the learner works the full answer out by hand on a paper pad, AI-graded (great for math working, derivations, diagrams, labelling).',
    '• latex — a cleanly typeset formula. wolfram — step-by-step equation solving. geogebra — an interactive graph/plot (functions, geometry, vectors). codeblock — a code / pseudocode snippet. table — a table (data, comparisons, TIMELINES). image — an AI diagram or picture.',
    '• audio — the content is read aloud. translate — a translate button (for language subjects).',
    'DESIGN RULES:',
    '1. Produce 5–8 slides in a sensible teaching ORDER: an intro/overview first, then each middle slide teaches ONE sub-idea and immediately PRACTISES it, and a final slide is a comprehension CHECK / recap that evaluates overall progress.',
    '2. EVERY slide must carry substance to read/see (reading and/or note, plus a visual where it helps) AND most slides should include an activity so progress is measured. Use a VARIETY of activity types across the lesson, not the same one every slide. Keep each slide focused: about 2–4 components.',
    '3. ADAPT the component mix to the KIND of subject:',
    '   • STEM / quantitative (math, physics, chemistry, engineering, statistics, computer science): teach with latex / codeblock / geogebra / image / table, and make the learner PRACTISE by solving — use wolfram for worked steps, and assess with annotation (worked-out steps), code, input and mcq. Give real exercises to attempt.',
    '   • Humanities / arts / text-based (literature, history, art, philosophy, civics, social studies, music appreciation): teach with reading passages, image, and table (timelines / comparisons); assess with mcq, fill-blank and especially input (short reflective / analytical / essay answers) and deco-hint guiding questions. Use few or no formulas. Favour interpretation, analysis and discussion over calculation.',
    '   • Language learning: reading + audio + translate + fill-blank + input.',
    '   Always pick the activities that genuinely fit the subject so the lesson feels right for it.',
    'Return STRICT JSON only: { "pages": [ { "components": ["reading","mcq4"], "length": "brief|medium|detailed", "paragraphs": 1 }, ... ] } — components is an ORDERED list of ids from the palette; length/paragraphs set the text density for that slide.',
  ].join('\n');
  const user = [
    `Subject / topic: ${subject}`,
    title && title !== subject ? `Lesson title: ${title}` : '',
    difficulty ? `Level: ${difficulty}` : '',
    tone ? `Tone: ${tone}` : '',
    context ? `Extra context / goal:\n${context}` : '',
    'Design the full slide-by-slide presentation now.',
  ].filter(Boolean).join('\n');

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: 0.5, maxTokens: 2600, provider });
    let raw: any[] = Array.isArray(r?.pages) ? r.pages : (Array.isArray(r) ? r : []);
    // Sanitise: keep only allowed component ids, ensure each slide has content,
    // clamp to 3–10 slides.
    const pages = raw.map((pg: any) => {
      const comps = (Array.isArray(pg?.components) ? pg.components : [])
        .map((c: any) => (typeof c === 'string' ? c : c?.id))
        .filter((id: any) => ALLOWED.has(String(id)))
        .slice(0, 6)
        .map((id: string) => ({ id }));
      const length = ['brief', 'medium', 'detailed'].includes(pg?.length) ? pg.length : 'medium';
      const paragraphs = Math.max(1, Math.min(4, parseInt(pg?.paragraphs, 10) || 1));
      return { components: comps, length, paragraphs };
    }).filter((pg: any) => pg.components.length > 0).slice(0, 10);
    // Guarantee some content — if the model returned nothing usable, fall back.
    if (pages.length < 3) return NextResponse.json(fallback);
    return NextResponse.json({ pages });
  } catch (e: any) {
    // Never leave the caller empty-handed — a designed lesson should always appear.
    return NextResponse.json(fallback);
  }
}
