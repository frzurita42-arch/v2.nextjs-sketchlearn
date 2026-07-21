import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, imageEnabled } from '@/src/config';
import { generateStructured, generateImageWithMeta } from '@/src/ai/providers';
import { imageStyleDirective, DIAGRAM_RULE, VARIED_RULE } from '@/lib/image-styles';
import { requireAuth } from '@/lib/auth-guard';
import { recordTextUsage, recordImageUsage } from '@/lib/usage-log';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fallbackImageDataUrl } = require('@/src/slides/visual-policy');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wolframShortAnswer, wolframFull } = require('@/src/connectors/wolfram');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { levelDepthGuidance } = require('@/src/ai/level-depth');

// Generates ONE support material for a slide (image / code / table / formula /
// wolfram). The slide route returns a `supportPlan` of types; the player calls
// this once per type and streams each card in with its own spinner, so a slide
// can hold several pieces of material without one big generation truncating.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function inferKind(subject: string, language?: string): string {
  const s = subject.toLowerCase();
  if (language) return 'language';
  if (/\b(math|algebra|calculus|geometry|trigonometry|statistics|probability|equation|arithmetic)\b/.test(s)) return 'math';
  if (/\b(programming|coding|code|python|javascript|java|c\+\+|software|algorithm|sql|rust|typescript)\b/.test(s)) return 'programming';
  if (/\b(french|spanish|german|italian|portuguese|japanese|chinese|mandarin|arabic|hindi|english|language)\b/.test(s)) return 'language';
  return 'general';
}

// Returns the image URL AND which backend produced it ('placeholder' when the
// keyless SVG fallback was used) so the slide can label it under the picture.
async function makeImage(prompt: string, provider?: string): Promise<{ url: string; by: string }> {
  if (imageEnabled) {
    try { const r = await generateImageWithMeta(prompt, provider ? { provider } : {}); if (r?.url) return { url: r.url, by: r.provider || '' }; } catch { /* fall through */ }
  }
  return { url: fallbackImageDataUrl(prompt, ''), by: 'placeholder' };
}

// The per-type instruction telling the model what support object to return.
function supSpecFor(type: string, mathish: boolean, kind: string): string {
  const codeHint = kind === 'language'
    ? 'a short snippet showing the SYNTAX/grammar logic (e.g. "subject + verb(conjugated) + object", or a conjugation pattern)'
    : kind === 'math'
      ? 'a short worked computation or proof shown as code/pseudocode, using COMMENTS to explain each step (e.g. "# derivative of x^2\\nf = x**2\\n# power rule: 2*x**(2-1)\\nf_prime = 2*x") — no Wolfram needed'
      : 'a short, correct code snippet';
  if (type === 'image') return mathish
    ? 'Return support = { "type": "image", "prompt": "a CLEAN, LABELLED educational DIAGRAM / INFOGRAPHIC / CHART of the actual SUBJECT of this slide — e.g. a labelled plant or cell with its parts named by leader lines; a labelled diagram of an organ or a device; a right triangle with base/height/hypotenuse/angle labelled; a free-body force sketch; a simple bar/line chart of the quantities. Describe the subject itself and its labelled parts precisely so it reads like a textbook figure. NO people unless the topic is literally about the human body.", "caption": "what the figure shows" }.'
    : 'Return support = { "type": "image", "prompt": "<the BEST-FITTING visual for THIS slide — VARY the type, do NOT always pick people. Prefer a clear photo/illustration of the key OBJECT(s), or a simple infographic/diagram when the slide explains how something works; only describe a candid activity scene when the topic is genuinely about people or an everyday social situation (then people are mid-action, never posing or facing the camera)>", "caption": "..." }.';
  if (type === 'code') return `Return support = { "type": "code", "language": "...", "code": ${JSON.stringify(codeHint)} }.`;
  if (type === 'table') return mathish
    ? 'Return support = { "type": "table", "headers": ["Step", "Equation", "What we did"], "rows": [["1", "the equation for this step (plain math text)", "short reason"], ...] } — a 3-column step-by-step working table.'
    : 'Return support = { "type": "table", "headers": [...], "rows": [[...]] } summarising this slide.';
  if (type === 'wolfram') return 'Return support = { "type": "wolfram", "query": "a precise, self-contained Wolfram Alpha query that SOLVES or COMPUTES this concept so it shows the STEP-BY-STEP working (e.g. \\"solve x^2-5x+6=0\\", \\"derivative of sin(x)*x^2\\", \\"integrate 1/(1+x^2)\\", \\"simplify (x^2-1)/(x-1)\\")", "latex": "the key formula in LaTeX", "caption": "what it shows" }. Make the query something Wolfram can work out (an equation to solve, a derivative/integral/simplification), not an open-ended question.';
  if (type === 'geogebra') return 'Return support = { "type": "geogebra", "commands": ["valid GeoGebra input commands that plot/build the visual for THIS slide, e.g. \\"f(x)=x^2\\", \\"g(x)=2x+1\\", \\"A=(1,2)\\", \\"Circle((0,0),3)\\""], "caption": "what the graph shows" }. Use 1–4 correct GeoGebra commands that visualise the concept (functions, points, lines, circles, vectors…). ONLY do this when a coordinate graph GENUINELY illuminates THIS specific slide — an actual function to plot, a geometric construction, a vector diagram, or data to chart. If the slide is conceptual/descriptive and a graph would be generic, decorative, or unrelated (e.g. two points labelled "stick length"), return { "type": "geogebra", "commands": [] } — an EMPTY commands array — so no graph is shown. Never invent a filler graph.';
  return 'Return support = { "type": "formula", "latex": "a valid LaTeX formula (e.g. \\"c = \\\\sqrt{a^2+b^2}\\", \\"\\\\frac{d}{dx}x^n = n x^{n-1}\\") — NOT plain ASCII", "caption": "what it means" }.';
}

// Turn the model's raw support object into the shape the player renders.
// The composition rule for a slide image: STEM/explanatory slides get a labelled
// diagram/infographic of the subject; everyday slides vary (object/infographic/
// scene) instead of always showing people.
function imageComposition(mathish: boolean, imgStyle?: string): string {
  return mathish ? DIAGRAM_RULE : `${imageStyleDirective(imgStyle)} ${VARIED_RULE}`;
}

async function parseSupport(type: string, s: any, subject: string, imgStyle?: string, imgProvider?: string, mathish = false): Promise<any> {
  if (!s || typeof s !== 'object') s = {};
  if (type === 'image') { const m = await makeImage(`${String(s.prompt || subject)}. ${imageComposition(mathish, imgStyle)}`, imgProvider); return { type: 'image', url: m.url, by: m.by, caption: String(s.caption || '') }; }
  if (type === 'code') return { type: 'code', language: String(s.language || '').slice(0, 20), code: String(s.code || '').slice(0, 1200) };
  if (type === 'table' && Array.isArray(s.headers)) return {
    type: 'table',
    headers: s.headers.map((h: any) => String(h).slice(0, 40)).slice(0, 6),
    rows: (Array.isArray(s.rows) ? s.rows : []).slice(0, 12).map((row: any) => (Array.isArray(row) ? row.map((c: any) => String(c).slice(0, 80)).slice(0, 6) : [])),
  };
  if (type === 'wolfram') {
    const [result, steps] = await Promise.all([wolframShortAnswer(s.query), wolframFull(s.query)]);
    const base = { query: String(s.query || '').slice(0, 300), latex: String(s.latex || '').slice(0, 300), caption: String(s.caption || '').slice(0, 200) };
    return (result || (steps && steps.length))
      ? { type: 'wolfram', ...base, result: result ? String(result).slice(0, 400) : '', steps: Array.isArray(steps) ? steps : [] }
      : (base.latex ? { type: 'formula', latex: base.latex, caption: base.caption } : null);
  }
  if (type === 'geogebra') {
    const commands = (Array.isArray(s.commands) ? s.commands : (s.command ? [s.command] : []))
      .map((c: any) => String(c).slice(0, 200)).filter(Boolean).slice(0, 6);
    return commands.length ? { type: 'geogebra', commands, caption: String(s.caption || '').slice(0, 200) } : null;
  }
  if (type === 'formula') return { type: 'formula', latex: String(s.latex || s.formula || '').slice(0, 300), caption: String(s.caption || '').slice(0, 200) };
  return null;
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const lesson = b.lesson || {};
  const type = ['image', 'code', 'table', 'formula', 'wolfram', 'geogebra'].includes(b.type) ? b.type : '';
  if (!type) return NextResponse.json({ support: null });
  const subject = String(lesson.subject || 'the topic').slice(0, 80);
  const level = String(b.values?.difficulty || b.values?.level || lesson.level || 'Beginner').slice(0, 40);
  const topic = String(b.values?.topic || '').slice(0, 120);
  const language = String(lesson.language || '').slice(0, 40);
  const kind = lesson.subjectKind || inferKind(subject, language);
  const content = String(b.content || '').slice(0, 1500);
  const title = String(b.title || '').slice(0, 120);
  const mathish = kind === 'math' || /\b(physics|chemistry|chemical|biolog|trigonometry|geometry|calculus|algebra|equation|mechanics|thermodynamic|kinematic|electromag|stoichiom|\bmole\b|reaction|force|velocity|acceleration|vector|momentum|circuit|optics|astronom|statistic|probability)\b/.test(`${subject} ${topic}`.toLowerCase());
  // Preferred art style for images (per-tool preset or per-slide override). Empty
  // / "Any" -> tasteful, adult-leaning default (see imageStyleDirective).
  const imgStyle = String(b.imageStyle || b.values?.imageStyle || '').slice(0, 40);
  // Which image backend to TRY first (user-chosen). Empty = the default order.
  const imgProvider = String(b.imageProvider || b.values?.imageProvider || '').slice(0, 20);

  // Image needs no text model — build it directly from the slide context.
  if (type === 'image' && !openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    const base = mathish ? `a clear, labelled diagram / infographic of: ${content || title || subject}` : (content || title || subject);
    const m = await makeImage(`${base}. ${imageComposition(mathish, imgStyle)}`, imgProvider);
    await recordImageUsage({ username: a.user.username, kind: 'support-image', provider: m.by, subject: [subject, topic].filter(Boolean).join(' — '), meta: { prompt: base } });
    return NextResponse.json({ support: { type: 'image', url: m.url, by: m.by, caption: '' } });
  }
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json({ support: null });

  const system = [
    `Produce ONE piece of support material for a ${subject} slide at ${level} level${topic ? ` about ${topic}` : ''}.`,
    `LEVEL DEPTH (${level}): ${levelDepthGuidance(level)}`,
    title ? `Slide title: ${title}.` : '',
    content ? `The slide teaches: ${content}` : '',
    supSpecFor(type, mathish, kind),
    'Return STRICT JSON only — exactly one object under the key "support", no markdown fences, no commentary.',
  ].filter(Boolean).join('\n');
  const user = 'Return JSON like: { "support": { ... } } for the requested type only.';

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.6, maxTokens: 1200 });
    const raw = r?.support && typeof r.support === 'object' ? r.support : r;
    const support = await parseSupport(type, raw, subject, imgStyle, imgProvider, mathish);
    const subj = [subject, topic].filter(Boolean).join(' — ');
    if (support && (support as any).type === 'image') await recordImageUsage({ username: a.user.username, kind: 'support-image', provider: (support as any).by, subject: subj, meta: { prompt: content || title } });
    else if (support) await recordTextUsage({ username: a.user.username, kind: `support-${type}`, input: system + user, output: JSON.stringify(r || {}), subject: subj });
    return NextResponse.json({ support: support || null });
  } catch {
    return NextResponse.json({ support: null });
  }
}
