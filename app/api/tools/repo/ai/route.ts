import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, imageEnabled } from '@/src/config';
import { generateStructured, generateImage } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

const textAI = () => openrouterEnabled || geminiEnabled || deepseekEnabled;

// POST { slug, op, ... } -> owner/admin AI helpers for a repository.
//   op 'field'  { field, current, instruction, context } -> { text }
//   op 'layout' { instruction, cards, layout } -> { cards }   (AI arranges the tree)
//   op 'image'  { instruction, title }         -> { image }   (data URL icon)
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  const op = String(b.op || 'field');

  // Owner / admin gate — repository editing is not open to everyone.
  if (slug) {
    const tool = await getToolBySlug(slug);
    if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
      return NextResponse.json({ error: 'Only the owner or an admin can use the AI editor.' }, { status: 403 });
    }
  }

  // ---- op: image (AI-generated card icon) -------------------------------
  if (op === 'image') {
    if (!imageEnabled && !geminiEnabled) return NextResponse.json({ error: 'No image model is configured. Upload an image instead.' }, { status: 200 });
    const instruction = String(b.instruction || b.title || 'a simple icon').slice(0, 400);
    try {
      const img = await generateImage(`A clean, simple flat icon illustration for a course/repository card: ${instruction}. Centered, minimal, friendly, no text.`);
      if (!img) return NextResponse.json({ error: 'Could not generate an image.' }, { status: 200 });
      return NextResponse.json({ image: img });
    } catch {
      return NextResponse.json({ error: 'Image generation failed.' }, { status: 200 });
    }
  }

  if (!textAI()) return NextResponse.json({ error: 'No AI model is configured. Type the content instead.' }, { status: 200 });

  // ---- op: field (rewrite one title / subtitle / text field) ------------
  if (op === 'field') {
    const field = String(b.field || 'text').slice(0, 20);
    const current = String(b.current || '').slice(0, 2000);
    const instruction = String(b.instruction || '').slice(0, 500);
    const context = String(b.context || '').slice(0, 800);
    const isTitle = field === 'title' || field === 'subtitle';
    const system = [
      `You write concise content for one field of a repository card. Field: "${field}".`,
      context ? `Repository context: ${context}` : '',
      current ? `Current value: "${current}"` : 'The field is currently empty.',
      instruction ? `Instruction: ${instruction}` : 'Improve / write this field.',
      isTitle ? 'Return a SHORT plain-text label (no markdown, no quotes, max ~10 words).'
              : 'Return a helpful, well-written value. Plain text or light markdown is fine. Keep it focused.',
      'Return STRICT JSON: { "text": "the new value" }.',
    ].filter(Boolean).join('\n');
    try {
      const r: any = await generateStructured(
        [{ role: 'system', content: system }, { role: 'user', content: instruction || 'Write this field.' }],
        { temperature: 0.6, maxTokens: isTitle ? 60 : 700 });
      const text = String(r?.text || '').slice(0, isTitle ? 200 : 4000);
      return NextResponse.json({ text });
    } catch {
      return NextResponse.json({ error: 'Could not generate. Try again or type it.' }, { status: 200 });
    }
  }

  // ---- op: layout (AI edits / arranges the whole nested tree) ------------
  if (op === 'layout') {
    const instruction = String(b.instruction || '').slice(0, 800);
    const layout = String(b.layout || 'course');
    const cards = Array.isArray(b.cards) ? b.cards : [];
    const system = [
      'You design a REPOSITORY: a nested tree of cards (cards inside cards — "layers"), NOT slides.',
      `This repository is ${layout}-style.`,
      'Each card is an object: { "id"?, "kind": "card"|"section", "title"?, "subtitle"?, "text"?, "links"?: [{"label","url"}], "completable"?: boolean, "layout"?: "bars"|"grid", "children"?: [ ...cards ] }.',
      '- "section" is a top-level grouping div; "card" is a box that can nest children.',
      '- Keep existing ids where you can so per-user completion progress survives.',
      '- Nest at most 4 levels deep. Only use sensible content — NO API calls or code.',
      '- For a course: sections/cards = weeks or modules, children = units, deepest children = activities with links + "completable": true.',
      'Here is the current tree (may be empty):',
      JSON.stringify(cards).slice(0, 6000),
      `Apply this instruction: ${instruction || 'Improve the structure and fill in helpful content.'}`,
      'Return STRICT JSON: { "cards": [ ...the FULL updated tree... ] }.',
    ].join('\n');
    try {
      const r: any = await generateStructured(
        [{ role: 'system', content: system }, { role: 'user', content: instruction || 'Improve this repository.' }],
        { temperature: 0.5, maxTokens: 2600 });
      const out = Array.isArray(r?.cards) ? r.cards : (Array.isArray(r) ? r : null);
      if (!out) return NextResponse.json({ error: 'The AI did not return a valid layout. Try rephrasing.' }, { status: 200 });
      return NextResponse.json({ cards: out });
    } catch {
      return NextResponse.json({ error: 'Could not update the layout. Try again.' }, { status: 200 });
    }
  }

  return NextResponse.json({ error: 'Unknown operation.' }, { status: 400 });
}
