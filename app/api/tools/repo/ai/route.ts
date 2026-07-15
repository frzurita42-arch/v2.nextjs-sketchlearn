import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, moonshotEnabled, imageEnabled } from '@/src/config';
import { generateStructured, generateImage, generateSvgSketch, geminiDoc, getLastImageError } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const textAI = () => openrouterEnabled || geminiEnabled || deepseekEnabled || moonshotEnabled;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST { slug, op, ... } -> owner/admin AI helpers for a repository.
//   op 'field'   { field, current, instruction, context } -> { text }
//   op 'layout'  { instruction, cards, layout } -> { cards }   (AI arranges the tree)
//   op 'image'   { instruction, title }         -> { image }   (data URL icon)
//   op 'fromDoc' { title, docText, docDataUrl }  -> { cards }  (document → card tree)
//   op 'suggest' { title, subject, goal, docText, docDataUrl, cards } -> { cards }
//                (AI proposes/extends a plan, ≤20 top-level cards, keeps user cards)
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
    // Need EITHER an image model OR any text model (for the SVG-sketch fallback).
    if (!imageEnabled && !geminiEnabled && !openrouterEnabled && !deepseekEnabled && !moonshotEnabled) return NextResponse.json({ error: 'No image model is configured. Upload an image instead.' }, { status: 200 });
    const instruction = String(b.instruction || b.title || 'a simple icon').slice(0, 400);
    try {
      let img = await generateImage(`A clean, simple flat icon illustration for a course/repository card: ${instruction}. Centered, minimal, friendly, no text.`);
      // No image model available — fall back to a text-model SVG sketch so the
      // 🖼️ button still produces a picture instead of erroring.
      if (!img) img = await generateSvgSketch(instruction);
      if (!img) {
        const why = (typeof getLastImageError === 'function' && getLastImageError()) || '';
        return NextResponse.json({ error: why ? `Could not generate an image. ${why.slice(0, 400)}` : 'Could not generate an image. Upload an image instead.' }, { status: 200 });
      }
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

  // ---- op: suggest (AI proposes / extends a plan into editable cards) -----
  // The "Suggest with AI" button in the Studio repository builder. From a GOAL
  // (what to achieve/understand), an OPTIONAL document, and any cards the user has
  // already entered by hand, the AI proposes the best learning path / itinerary /
  // action plan / steps — up to 20 top-level cards, each with a description — and
  // returns them for the user to review and edit before publishing. It KEEPS and
  // builds on the user's own cards (so they can type the first few and let the AI
  // fill in the rest toward the goal).
  if (op === 'suggest') {
    const title = String(b.title || '').slice(0, 160);
    const subject = String(b.subject || '').slice(0, 160);
    const goal = String(b.goal || b.context || '').slice(0, 4000);
    const existing = Array.isArray(b.cards) ? b.cards.slice(0, 40) : [];
    const withLinks = !!b.withLinks;   // "link suggestion" toggle: add a reference link per card
    // "Next card" mode: return a SINGLE new top-level card that follows the ones
    // already on the page (rather than a whole fresh batch of pathways).
    const nextOne = !!b.next;
    // Which text model to use ('auto' failover, or a specific configured provider).
    const provider = ['openrouter', 'gemini', 'deepseek', 'moonshot'].includes(String(b.provider)) ? String(b.provider) : 'auto';
    // Documents to consider — an array of { text?, dataUrl? } (plus the legacy
    // single docText/docDataUrl for backward compatibility). Text docs are
    // concatenated into the prompt; PDF/binary docs are sent to Gemini natively.
    const docItems: any[] = Array.isArray(b.docs) ? b.docs.slice(0, 6) : [];
    if (b.docText || b.docDataUrl) docItems.push({ text: b.docText, dataUrl: b.docDataUrl });
    const textPieces: string[] = [];
    const binDocs: { mimeType: string; data: string }[] = [];
    for (const d of docItems) {
      if (d?.text) textPieces.push(String(d.text));
      const mm = String(d?.dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
      if (mm && /pdf|msword|officedocument|text|rtf/i.test(mm[1])) binDocs.push({ mimeType: mm[1], data: mm[2] });
    }
    const docText = textPieces.join('\n\n---\n\n').slice(0, 60000);
    const isPdfOrDoc = binDocs.length > 0;
    // The builder's chat history — folded in so the plan reflects what the user
    // told the assistant, not just the goal box.
    const chat = (Array.isArray(b.messages) ? b.messages : [])
      .filter((mm: any) => mm && (mm.role === 'user' || mm.role === 'assistant') && mm.content)
      .slice(-12)
      .map((mm: any) => `${mm.role === 'user' ? 'User' : 'Assistant'}: ${String(mm.content).slice(0, 600)}`)
      .join('\n');
    const hasSeed = goal.trim() || docText.trim() || isPdfOrDoc || existing.length || chat.trim();
    if (!hasSeed) return NextResponse.json({ error: 'Add a goal, attach a document, chat with the AI, or enter a card or two for the AI to build on.' }, { status: 200 });

    const system = [
      'You design an ACTIONABLE PLAN as a REPOSITORY: an ordered list of cards. Depending on the request this is a learning path, a study itinerary, an action plan, a curriculum, a catalogue/menu, or the steps to achieve or understand something.',
      // SketchLearn is a community platform; nudge plans toward its core values.
      'This is for SketchLearn, a community learning platform whose core values are positivity, cohesion/community, and encouraging engagement. Where it fits naturally, shape the plan to reflect them — collaborative/social steps, encouraging tone, momentum that keeps people coming back — but never force it or make the plan preachy; the user\'s goal always comes first.',
      'RULES:',
      '0. FIRST, judge WHAT KIND of content this is from the document/goal, and lay it out the way that best helps someone navigate and UNDERSTAND it:',
      '   • An ACADEMIC / course document (syllabus, study program, textbook outline): build it like a study repository. Every UNIT/theme is a top-level card, and EVERY listed sub-topic under that unit becomes its OWN separate NESTED child card — split them out, ONE card per sub-topic, each with a short description that helps a student grasp it. Do NOT merge several sub-topics into a single card or bury them inside one description.',
      '   • A MENU / catalogue / product list: group items by their natural category (e.g. starters, mains, desserts, drinks) as top-level cards, and each individual item as a nested card under its category, laid out neatly so a reader can browse and choose.',
      '   • An ACTION PLAN / how-to / itinerary: ordered steps or stages, with sub-steps nested where a step has several parts.',
      '   Always pick the structure that matches the CONTEXT and makes the information easiest to understand and choose from.',
      '1. Produce an ORDERED sequence of top-level cards — the steps/weeks/units/categories, in a sensible order. AT MOST 20 top-level cards (this cap is TOP-LEVEL only; nested child cards do not count against it). Use as MANY or as FEW as the content actually needs — do not pad to 20.',
      '2. Give each card a clear "title" (e.g. "Unidad 2: Vectores", "Week 1 — Foundations", "Margherita Pizza") and a "text": a 1–2 sentence description. Write in the SAME LANGUAGE as the goal/document. Preserve the document\'s own numbering/names.',
      '3. When the source lists MULTIPLE sub-topics or items under a heading (e.g. "Representación gráfica y analítica. Componentes de un vector. Suma de vectores. Producto escalar y vectorial." under "Vectores"), create ONE nested child card for EACH of them — never collapse the list into a single child. Nest at most 3 levels.',
      nextOne
        ? '4. RETURN EXACTLY ONE new top-level card — the single NEXT step that logically follows the user\'s existing cards below (do NOT repeat, restate or re-list any of them). It should continue the sequence toward the goal, informed by the chat, title and description. You may give it nested child cards if the step naturally has parts.'
        : '4. KEEP the user\'s existing cards below and build ON them: preserve their titles/text (you may lightly polish), keep them in order, and ADD the further items needed to reach the goal. The user may have entered only the first few and wants you to figure out the rest.',
      // The DEEPEST cards feed a separate presentation/lesson generator, so they
      // must stand on their own — a bare heading is not enough for it to work from.
      '4b. EVERY LEAF card (a card with no children — the deepest node on each branch) MUST carry BOTH a clear, specific standalone "title" AND a "text" of 1–3 sentences that concretely states what that topic is and names the actual concepts/skills/examples it covers. Write it so a lesson generator that sees ONLY that one card\'s title + text could build a complete, accurate lesson about it — no vague one-word descriptions, no "see above", no relying on the parent card for meaning.',
      '5. Base the plan on the attached document / goal — do not invent unrelated content. Ignore document front-matter (course code, bibliography).',
      withLinks
        ? '6. LINK SUGGESTIONS ARE ON: for EVERY card add a "link" — a single, relevant reference URL — plus a short "linkLabel" (max 15 chars, e.g. "Wikipedia", "MDN", "Recipe", "Image"). PREFER a well-known, popular NICHE authority for the topic when one clearly fits — it is more useful than a generic encyclopedia entry (e.g. MDN for web dev, Investopedia for finance, Khan Academy or a standard textbook site for a school subject, IMDb for films, AllRecipes/Serious Eats for dishes, PubMed/Mayo Clinic for health, official docs for a tool). Otherwise use a real Wikipedia article (https://en.wikipedia.org/wiki/Topic — or the document\'s language, e.g. https://es.wikipedia.org/wiki/…) or an official website; for a visual/product use a Wikimedia/Wikipedia page or a Google image search URL (https://www.google.com/search?tbm=isch&q=...+url-encoded). Only include a link you are reasonably confident resolves at a real, popular site; if unsure for a card, omit its link. Never fabricate a deep/direct file URL that likely 404s.'
        : '6. Do NOT add links, code or images.',
      `Each card is: { "kind": "card", "title": string, "text": string${withLinks ? ', "link"?: string, "linkLabel"?: string' : ''}, "children"?: [ ...cards ] }.`,
      'Return STRICT JSON: { "cards": [ ...the full ordered plan, at most 20 top-level... ] }.',
    ].join('\n');
    const userText = [
      `Tool title: ${title || '(untitled)'}`,
      subject ? `Topic / subject: ${subject}` : '',
      goal ? `Goal — what the plan should achieve or help understand:\n${goal}` : '',
      chat ? `The user's chat with the assistant (consider it):\n${chat}` : '',
      existing.length ? `The user has already entered these cards (keep and build on them):\n${JSON.stringify(existing).slice(0, 6000)}` : 'The user has not entered any cards yet.',
      docText ? `Reference document text:\n${docText}` : (isPdfOrDoc ? 'A reference document is attached — read it.' : ''),
    ].filter(Boolean).join('\n\n');

    // Only Gemini can read a binary PDF here, so a binary doc uses geminiDoc
    // unless the user explicitly picked a different model (then it works on the
    // goal/text only). Splitting every sub-topic makes the JSON large, so give the
    // model plenty of output room or it truncates and the parse fails.
    const useGeminiDoc = binDocs.length > 0 && geminiEnabled && (provider === 'auto' || provider === 'gemini');
    const runStructured = async () => {
      const r: any = await generateStructured(
        [{ role: 'system', content: system }, { role: 'user', content: userText }],
        { temperature: 0.4, maxTokens: 9000, provider });
      return Array.isArray(r?.cards) ? r.cards : (Array.isArray(r) ? r : null);
    };
    try {
      let out: any = null;
      if (useGeminiDoc) {
        // Gemini often returns a transient 503 ("high demand"); retry a few times
        // with backoff, then fall back to a text model on the extracted text.
        let lastErr: any = null;
        for (let attempt = 0; attempt < 3 && out == null; attempt++) {
          try {
            const r: any = await geminiDoc(system, userText, binDocs, { maxTokens: 16000, temperature: 0.4 });
            out = Array.isArray(r?.cards) ? r.cards : (Array.isArray(r) ? r : null);
          } catch (e: any) {
            lastErr = e;
            const msg = String(e?.message || '');
            if (!/429|overloaded|503|quota|rate limit|timed out|temporarily/i.test(msg)) throw e;   // non-transient → stop
            if (attempt < 2) await sleep(1200 * (attempt + 1));   // 1.2s, 2.4s backoff
          }
        }
        if (out == null) {
          // Gemini still busy: try another text model on whatever text we have.
          if ((openrouterEnabled || deepseekEnabled || moonshotEnabled) && (docText.trim() || goal.trim() || chat.trim() || existing.length)) {
            out = await runStructured();
          } else {
            throw lastErr || new Error('Gemini is busy');
          }
        }
      } else if (textAI()) {
        out = await runStructured();
      } else {
        return NextResponse.json({ error: binDocs.length ? 'Reading a PDF needs Gemini. Paste the document text instead.' : 'No AI model is configured.' }, { status: 200 });
      }
      if (!out) return NextResponse.json({ error: 'The AI could not build a plan. Add a bit more detail and try again.' }, { status: 200 });
      return NextResponse.json({ cards: out.slice(0, nextOne ? 1 : 20) });
    } catch (e: any) {
      // Surface the real reason (truncated JSON, timeout, quota…) so it's fixable.
      console.error('repo suggest failed:', e?.message || e);
      const reason = String(e?.message || 'unknown error').slice(0, 160);
      return NextResponse.json({ error: `Could not build a suggestion (${reason}). Try again in a moment, pick a different model, or paste the document text.` }, { status: 200 });
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
