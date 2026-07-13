import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, listTools } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { slug } -> { title, description }
// The "AI tap mixer": rephrases a tool's title + description to say the SAME thing
// in a slightly different way, in the warm voice of the platform's curator —
// subtly reflecting its core values (positivity, cohesion, engagement) when it
// fits, grounded in what the tool does and the other tools on the site.
// Owner/admin only.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');

  // Examples are virtual; an admin may remix them (the result is saved via rename).
  const ex = exampleBySlug(slug);
  const tool = ex || await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ex) {
    if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit an example.' }, { status: 403 });
  } else if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can remix this.' }, { status: 403 });
  }
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ error: 'No AI model is configured.' }, { status: 200 });
  }

  const d = tool.definition || {};
  // A little context about what else lives on the platform (for tone + relevance).
  let samples = '';
  try {
    const others = await listTools({ includePrivateFor: a.user.username, limit: 12 });
    samples = (others || []).filter((t: any) => t.slug !== slug).slice(0, 8)
      .map((t: any) => `• ${t.title}${t.description ? ` — ${String(t.description).slice(0, 80)}` : ''}`).join('\n');
  } catch { /* ignore */ }

  const ctx = [
    `Tool type: ${d.archetype || tool.archetype}.`,
    `Current title: "${tool.title}".`,
    tool.description ? `Current description: "${tool.description}".` : 'No description yet.',
    d.lesson?.subject ? `Lesson subject: ${d.lesson.subject}.` : '',
    d.generator?.promptTemplate ? `It generates from: "${String(d.generator.promptTemplate).slice(0, 200)}".` : '',
    d.repo ? 'It is a repository of nested cards with links.' : '',
    d.app?.entryFields?.length ? `Users add entries with: ${d.app.entryFields.map((f: any) => f.label).join(', ')}.` : '',
  ].filter(Boolean).join('\n');

  const system = [
    'You are the warm, upbeat curator of SketchLearn — a community platform where people publish AI-built tools: lesson/slide generators, repositories of links to other tools and AI-built games, to-do lists, payment monitors, and more.',
    'Core values you gently embody: positivity, cohesion/community, and encouraging engagement.',
    'Rephrase the tool\'s TITLE and DESCRIPTION so they mean the SAME thing but are worded a little differently — as if a kind person who holds those values were naming and describing it. Stay accurate to what the tool actually does; do NOT invent features. Hint at the values only when it feels natural, never forced or salesy.',
    'Keep the title short (≤ ~8 words). Keep the description to 1–3 sentences.',
    'What this tool is:',
    ctx,
    samples ? `Other tools on the platform (for tone/relevance only):\n${samples}` : '',
    'Return STRICT JSON: { "title": "...", "description": "..." }.',
  ].filter(Boolean).join('\n');

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: 'Remix the title and description.' }],
      { temperature: 0.8, maxTokens: 300 });
    const title = String(r?.title || '').replace(/^["']|["']$/g, '').slice(0, 100) || tool.title;
    const description = String(r?.description || '').slice(0, 400) || tool.description || '';
    return NextResponse.json({ title, description });
  } catch {
    return NextResponse.json({ error: 'Could not remix — try again.' }, { status: 200 });
  }
}
