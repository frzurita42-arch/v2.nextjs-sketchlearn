import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition, slugify } from '@/lib/tool-schema';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertTool, getToolBySlug, listTools, deleteTool } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EXAMPLE_TOOLS, exampleBySlug } = require('@/src/tools/examples');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userState } = require('@/src/db/users');

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
    // Private tools are visible only to their owner (or an admin). Unlisted tools
    // stay reachable by link (that's the point of the share button).
    if (tool.visibility === 'private' && tool.owner !== a.user.username && a.user.role !== 'admin') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ tool }, { headers: { 'Cache-Control': 'no-cache' } });
  }
  const viewerIsAdmin = a.user.role === 'admin';
  const adminOwners = (userState.users || []).filter((u: any) => u.role === 'admin').map((u: any) => u.username);
  const tools = await listTools({ includePrivateFor: a.user.username, adminOwners, viewerIsAdmin, limit: 60 });
  // Flag tools an admin has liked (for the "liked by admin" gallery filter) and
  // drop the raw liker list from the public payload.
  const adminSet = new Set(adminOwners);
  const decorated = tools.map((t: any) => {
    const likers: string[] = Array.isArray(t.likedBy) ? t.likedBy : [];
    const likedByAdmin = likers.some((u: string) => adminSet.has(u));
    const likedByOwner = likers.includes(t.owner);   // the creator (OP) favorited their own tool
    const { likedBy, ...rest } = t;   // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, likedByAdmin, likedByOwner };
  });
  // Prepend the built-in examples so the gallery always has a working lesson to try.
  return NextResponse.json({ tools: [...EXAMPLE_TOOLS, ...decorated] }, { headers: { 'Cache-Control': 'no-cache' } });
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
    // Stamped for file-storage mode; in DB mode the created_at column default wins.
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
