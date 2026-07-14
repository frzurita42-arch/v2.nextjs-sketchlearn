import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, imageEnabled } from '@/src/config';
import { generateStructured, generateImage, geminiDoc } from '@/src/ai/providers';
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

  // ---- op: fromDoc (build the whole card tree from a course document) -----
  // Turns an attached syllabus/program (PDF or pasted text) into a repository:
  // every UNIT becomes a top-level card, every SUBUNIT a nested child card, and
  // each card gets a short description. Used by the Studio repository builder.
  if (op === 'fromDoc') {
    const title = String(b.title || '').slice(0, 160);
    const docText = String(b.docText || '').slice(0, 40000);
    const docDataUrl = String(b.docDataUrl || '');
    const m = docDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const isPdfOrDoc = !!m && /pdf|msword|officedocument|text|rtf/i.test(m[1]);
    if (!docText && !isPdfOrDoc) return NextResponse.json({ error: 'Attach a document (PDF/text) or paste its text.' }, { status: 200 });

    const system = [
      'You convert a COURSE DOCUMENT (a syllabus / study program) into a REPOSITORY: a nested tree of cards. Read the document carefully and extract its real content.',
      'RULES:',
      '1. Every top-level UNIT, topic or theme in the document becomes ONE top-level card. Keep the document\'s own numbering/name in the "title" (e.g. "2. Vectors", "Cinemática de la partícula").',
      '2. Every SUBUNIT / sub-topic listed under a unit becomes a NESTED child card inside that unit. Split the unit\'s content into its individual items — e.g. under "Vectors" the phrases "Graphic and analytic representation", "Vector components", "Sum of vectors", "Scalar and vector products" each become their own child card.',
      '3. EVERY card — unit AND subunit — MUST have a "text": a short 1–2 sentence description, written in the SAME LANGUAGE as the document, summarising what that unit/subunit covers. Always write a helpful description even when the document only gives a heading.',
      '4. If a unit states a suggested time / number of hours, append it to that unit\'s description (e.g. "· Tiempo sugerido: 6 horas").',
      '5. Preserve the document\'s ORDER. Do NOT invent units or subunits that are not in the document. Ignore front-matter (course code, objectives, methodology, bibliography) — only the CONTENTS/units.',
      '6. Nest at most 3 levels. No links, no code, no images.',
      'Each card is: { "kind": "card", "title": string, "text": string, "children"?: [ ...cards ] }.',
      'Return STRICT JSON: { "cards": [ ...the full tree... ] }.',
    ].join('\n');
    const userText = `Course title: ${title || '(untitled)'}\n\n${docText ? 'Document text:\n' + docText : 'The course document is attached — read it.'}`;

    try {
      let out: any = null;
      if (m && geminiEnabled) {
        const r: any = await geminiDoc(system, userText, [{ mimeType: m[1], data: m[2] }], { maxTokens: 5000, temperature: 0.3 });
        out = Array.isArray(r?.cards) ? r.cards : (Array.isArray(r) ? r : null);
      } else if (docText && textAI()) {
        const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: userText }], { temperature: 0.3, maxTokens: 3500 });
        out = Array.isArray(r?.cards) ? r.cards : (Array.isArray(r) ? r : null);
      } else {
        return NextResponse.json({ error: m ? 'Reading a PDF needs Gemini. Paste the document text instead.' : 'No AI model is configured.' }, { status: 200 });
      }
      if (!out) return NextResponse.json({ error: 'The AI could not read the document. Try pasting its text.' }, { status: 200 });
      return NextResponse.json({ cards: out });
    } catch {
      return NextResponse.json({ error: 'Could not build cards from the document. Try again or paste the text.' }, { status: 200 });
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
