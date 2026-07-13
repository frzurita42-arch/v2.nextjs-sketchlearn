import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { slug, field: 'title'|'description', instruction } -> { text }
// Writes a title or description for a published tool using the CONTEXT the site
// knows about it (its type, subject, what it generates, its prompt) — NOT just a
// copy of the prompt. Owner/admin only.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  const field = b.field === 'title' ? 'title' : 'description';
  const instruction = String(b.instruction || '').slice(0, 400);

  const ex = exampleBySlug(slug);
  const tool = ex || await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ex) {
    if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit an example.' }, { status: 403 });
  } else if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can edit this.' }, { status: 403 });
  }
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ error: 'No AI model is configured — type it manually instead.' }, { status: 200 });
  }

  const d = tool.definition || {};
  // Build a rich context summary so the AI describes what the tool DOES.
  const ctx: string = [
    `Platform: SketchLearn — a site where people build and share AI-powered educational tools (lessons/presentations, generators, apps, repositories).`,
    `Tool type (archetype): ${d.archetype || tool.archetype}.`,
    tool.title ? `Current title: "${tool.title}".` : '',
    d.description ? `Current description: "${d.description}".` : '',
    Array.isArray(d.tags) && d.tags.length ? `Tags: ${d.tags.join(', ')}.` : '',
    d.lesson?.subject ? `Lesson subject: ${d.lesson.subject}${d.lesson.subjectKind ? ` (${d.lesson.subjectKind})` : ''}.` : '',
    d.lesson?.style ? `Lesson design notes: ${String(d.lesson.style).slice(0, 300)}.` : '',
    d.generator?.promptTemplate ? `It generates output from this prompt: "${String(d.generator.promptTemplate).slice(0, 300)}".` : '',
    d.app?.entryFields?.length ? `Users add entries with fields: ${d.app.entryFields.map((f: any) => f.label).join(', ')}.` : '',
    d.repo ? `It is a repository of nested cards (${d.repo.layout || 'course'}-style).` : '',
  ].filter(Boolean).join('\n');

  const system = field === 'title'
    ? [
        'Write a SHORT, catchy title for this educational tool based on what it actually does.',
        ctx,
        instruction ? `Extra instruction from the owner: ${instruction}` : '',
        'Return a plain title, max ~8 words, no quotes, no markdown.',
        'Return STRICT JSON: { "text": "the title" }.',
      ].filter(Boolean).join('\n')
    : [
        'Write a clear, inviting description (1–3 sentences) of what this tool does and who it helps — grounded in the context below.',
        'Do NOT just repeat the prompt template verbatim; describe the experience and value in natural language.',
        ctx,
        instruction ? `Extra instruction from the owner: ${instruction}` : '',
        'Return STRICT JSON: { "text": "the description" }.',
      ].filter(Boolean).join('\n');

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: instruction || `Write the ${field}.` }],
      { temperature: 0.6, maxTokens: field === 'title' ? 60 : 400 });
    const text = String(r?.text || '').replace(/^["']|["']$/g, '').slice(0, field === 'title' ? 100 : 400);
    if (!text) return NextResponse.json({ error: 'Could not generate — try again or type it.' }, { status: 200 });
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: 'Could not generate — try again or type it.' }, { status: 200 });
  }
}
