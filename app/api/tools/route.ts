import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition, slugify } from '@/lib/tool-schema';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertTool, getToolBySlug, listTools, deleteTool } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EXAMPLE_TOOLS, exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tools            -> list visible tools (public + your own)
// GET /api/tools?slug=xyz   -> one tool by slug
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  if (slug) {
    const example = exampleBySlug(slug);
    if (example) return NextResponse.json({ tool: example }, { headers: { 'Cache-Control': 'no-cache' } });
    const tool = await getToolBySlug(slug);
    if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Private tools are visible only to their owner.
    if (tool.visibility === 'private' && tool.owner !== a.user.username) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ tool }, { headers: { 'Cache-Control': 'no-cache' } });
  }
  const tools = await listTools({ includePrivateFor: a.user.username, limit: 60 });
  // Prepend the built-in examples so the gallery always has a working lesson to try.
  return NextResponse.json({ tools: [...EXAMPLE_TOOLS, ...tools] }, { headers: { 'Cache-Control': 'no-cache' } });
}

// POST /api/tools  { definition, visibility, aiGenerated? } -> publish a tool
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const { ok, errors, def } = validateToolDefinition(b.definition);
  if (!ok || !def) return NextResponse.json({ error: 'Invalid tool definition', details: errors }, { status: 400 });

  const visibility = ['private', 'unlisted', 'public'].includes(b.visibility) ? b.visibility : 'private';

  // Unique slug: base on the title, add a short suffix if taken.
  let slug = slugify(def.title);
  if (await getToolBySlug(slug)) slug = `${slug}-${crypto.randomUUID().slice(0, 5)}`;

  const record = {
    id: `tool-${crypto.randomUUID().slice(0, 12)}`,
    slug,
    owner: a.user.username,
    title: def.title,
    description: def.description || '',
    archetype: def.archetype,
    definition: def,
    visibility,
    tags: def.tags || [],
    thumbnail: null,
    likeCount: 0,
    aiGenerated: !!b.aiGenerated,
  };
  await insertTool(record);
  return NextResponse.json({ slug, id: record.id, visibility });
}

// DELETE /api/tools?slug=  -> owner or admin removes a tool. Examples aren't deletable.
export async function DELETE(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (exampleBySlug(slug)) return NextResponse.json({ error: 'Built-in examples cannot be deleted.' }, { status: 400 });
  const tool = await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (a.user.role !== 'admin' && tool.owner !== a.user.username) {
    return NextResponse.json({ error: 'Only the tool owner or an admin can delete this.' }, { status: 403 });
  }
  const ok = await deleteTool(slug);
  return NextResponse.json({ ok });
}
