import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildSlideSystemPrompt } = require('@/src/ai/prompts/slide');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildLearningPathPrompt } = require('@/src/ai/prompts/learning-path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SAFETY_GUARDRAILS } = require('@/src/ai/prompts/guardrails');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SKETCH_SVG_RULES } = require('@/src/ai/providers');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Returns the actual generation prompt(s) a tool sends to the AI, so a settings screen
 * can SHOW them (read-only) — the same idea as the chat's "How I reply" page, applied
 * to the slide generator, the learning-path / repo builder, etc. Each entry carries a
 * label, the assembled prompt text, and a footnote on the response the AI must return.
 *
 * POST { kind: 'slide' | 'learning-path' | 'repo' | 'builder', topic?, level? } */
type PromptEntry = { label: string; system: string; footnote: string };

// A representative slide-generation prompt. The instruction/Rules text is what matters;
// the few interpolated numbers use sensible defaults (the live route derives them from
// the tool's level, paragraph and support settings before each slide).
function slidePrompt(topic: string, level: string): PromptEntry {
  const system = buildSlideSystemPrompt({
    paraCount: 2, paragraphWords: 60,
    densityRule: 'Keep the density matched to the level.',
    componentStrategy: 'Add support components (table / image / chart / sticky note) only when they clarify THIS concept.',
    codeDepth: 'Show a short, correct, commented snippet.',
    equationDepth: 'Show the key formula and explain each symbol.',
    allowLatex: true, allowCode: true, preferCode: false,
    stemAlternation: '', effectiveProof: false, isTimeTravelActivity: false, allowModelSvg: false,
    settings: {}, level: level || 'Beginner',
    visualPromptRule: 'When an image is used, describe a clear, on-topic illustration.',
  });
  return {
    label: '🎞️ Slide text & structure (system prompt)',
    system,
    footnote: 'Sent once per slide. The Title you enter becomes the slide title; leave it blank and the AI writes one from the topic. Expected reply: strict JSON for ONE slide — a title, a summary, a list of components (text/keypoints/table/latex/code/chart/…), and a quiz with exactly 4 options (one correct).',
  };
}

// The image / SVG request. When a slide's component set includes a hand-sketched drawing,
// this rule block is sent to the model asking for a single self-contained <svg> that depicts
// THIS slide's concept. It is a separate output request from the slide-text JSON above.
function svgPrompt(topic: string): PromptEntry {
  const t = topic || '<the topic you enter>';
  return {
    label: '🖼️ Illustration / SVG drawing (image request)',
    system: `Draw a hand-sketched illustration for a slide about: ${t}\n\n${SKETCH_SVG_RULES}`,
    footnote: 'Sent only when a slide includes an image/drawing component. Expected reply: ONE self-contained <svg> string (no scripts, no external refs) that depicts and labels this slide’s concept — not decoration.',
  };
}

function learningPathPrompt(topic: string): PromptEntry {
  const { system, user } = buildLearningPathPrompt({
    wanted: ['Beginner', 'Intermediate', 'Advanced'],
    topic: topic || '<the topic you enter>',
    guidance: '', historyLine: '', freshSeed: '',
  });
  return {
    label: '🎬 Learning-path / repo structure (system prompt)',
    system: `${system}\n\n— example user message —\n${user}`,
    footnote: 'Sent once when a repo / learning path is built. Expected reply: JSON curriculum — {topic, overview, levels:[{level, description, concepts:[{name, blurb}]}]}. Each concept then drives a slide-generation prompt (above).',
  };
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const { kind = 'slide', topic = '', level = 'Beginner' } = (await req.json().catch(() => ({}))) || {};

  const prompts: PromptEntry[] = [];
  if (kind === 'slide') { prompts.push(slidePrompt(topic, level)); prompts.push(svgPrompt(topic)); }
  else if (kind === 'learning-path' || kind === 'repo') { prompts.push(learningPathPrompt(topic)); prompts.push(slidePrompt(topic, level)); prompts.push(svgPrompt(topic)); }
  else if (kind === 'builder') { prompts.push(learningPathPrompt(topic)); prompts.push(slidePrompt(topic, level)); prompts.push(svgPrompt(topic)); }
  else { prompts.push(slidePrompt(topic, level)); prompts.push(svgPrompt(topic)); }

  // The trust/safety block is appended to every generation system prompt server-side.
  const guardrails: PromptEntry = {
    label: '🛡️ Trust & safety (appended to every generation)',
    system: SAFETY_GUARDRAILS,
    footnote: 'Appended to the prompts above. It marks your topic/instructions/attachments as DATA (not commands) and enforces the slide / question / image limits — so a prompt injection can’t rewrite the rules or over-generate.',
  };
  prompts.push(guardrails);

  return NextResponse.json({ prompts }, { headers: { 'Cache-Control': 'no-cache' } });
}
