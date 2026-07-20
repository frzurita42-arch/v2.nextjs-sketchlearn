import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, optionalAuth } from '@/lib/auth-guard';
import { validateToolDefinition, slugify } from '@/lib/tool-schema';
import { emojiThumb, defaultEmojiFor } from '@/lib/emoji-thumb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertTool, getToolBySlug, listTools, deleteTool, getExampleOverrides } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EXAMPLE_TOOLS, GALLERY_EXAMPLES, exampleBySlug, applyOverride, applyOverrides } = require('@/src/tools/examples');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userState } = require('@/src/db/users');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Strip the heavy embedded data out of a tool definition for the LIST payload —
// saved decks, repo card trees, entry schemas, and data-URL links should only
// come from the full slug fetch. The gallery only needs lightweight metadata.
function slimForList(def: any): any {
  if (!def || typeof def !== 'object') return def;
  const d: any = { ...def };
  if (d.lesson && typeof d.lesson === 'object') {
    const l = { ...d.lesson };
    delete l.savedDeck;
    delete l.pages;
    d.lesson = l;
  }
  if (d.repo && typeof d.repo === 'object') {
    const r = { ...d.repo };
    delete r.cards;
    d.repo = r;
  }
  if (d.app && typeof d.app === 'object') {
    const a = { ...d.app };
    delete a.entries;
    d.app = a;
  }
  return d;
}

// GET /api/tools            -> list visible tools (public + your own)
// GET /api/tools?slug=xyz   -> one tool by slug
export async function GET(req: Request) {
  // Guests (no token) may BROWSE public/unlisted content — the app lets them look
  // around and only prompts sign-in when they try to play. So this read allows an
  // optional user.
  const { user } = await optionalAuth(req);
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  const archetypeQ = (url.searchParams.get('archetype') || '').trim();
  const includeFeatured = url.searchParams.get('includeFeatured') !== '0';
  const singleSource = url.searchParams.get('singleSource') === '1';
  const limitQ = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '60', 10) || 60));
  if (slug) {
    const example = exampleBySlug(slug);
    if (example) {
      const ov = (await getExampleOverrides())[slug];
      return NextResponse.json({ tool: ov ? applyOverride(example, ov) : example }, { headers: { 'Cache-Control': 'no-cache' } });
    }
    const tool = await getToolBySlug(slug);
    if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Private tools are visible only to their owner (or an admin). Unlisted tools
    // stay reachable by link (that's the point of the share button).
    if (tool.visibility === 'private' && tool.owner !== user?.username && user?.role !== 'admin') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ tool }, { headers: { 'Cache-Control': 'no-cache' } });
  }
  const viewerIsAdmin = user?.role === 'admin';
  const adminOwners = (userState.users || []).filter((u: any) => u.role === 'admin').map((u: any) => u.username);
  let tools: any[] = [];
  try {
    tools = await listTools({
      includePrivateFor: user?.username || null,
      adminOwners,
      viewerIsAdmin,
      limit: limitQ,
      strictDb: singleSource,
    });
  } catch {
    return NextResponse.json({ error: 'Could not load tools from the primary source.' }, { status: 503 });
  }
  // Flag tools an admin has liked (for the "liked by admin" gallery filter) and
  // drop the raw liker list from the public payload. Also SLIM the definition:
  // the gallery only needs the top-level fields (title, description, thumbnail,
  // archetype, tags, owner…), so we strip the heavy embedded media out of the
  // definition (saved decks full of AI images, repo-card images and data-URL
  // links). This keeps the list payload light so the galleries load fast; the FULL
  // tool (with its media) is fetched by ?slug= when a card is opened.
  const adminSet = new Set(adminOwners);
  const decorated = tools.map((t: any) => {
    const likers: string[] = Array.isArray(t.likedBy) ? t.likedBy : [];
    const likedByAdmin = likers.some((u: string) => adminSet.has(u));
    const likedByOwner = likers.includes(t.owner);   // the creator (OP) favorited their own tool
    const { likedBy, definition, ...rest } = t;   // eslint-disable-line @typescript-eslint/no-unused-vars
    // Whether this tool has a saved presentation deck (its "original results"),
    // computed BEFORE slimForList strips it — lets the gallery show a 📖 review
    // button (e.g. for signed-out visitors, who can review but not play).
    const hasSavedDeck = !!(definition?.lesson?.savedDeck?.slides?.length);
    return { ...rest, definition: slimForList(definition), likedByAdmin, likedByOwner, hasSavedDeck };
  }).filter((t: any) => !archetypeQ || (t?.archetype || t?.definition?.archetype) === archetypeQ);

  if (!includeFeatured || singleSource) {
    return NextResponse.json({ tools: decorated }, { headers: { 'Cache-Control': 'no-cache' } });
  }

  // Include featured examples (with any admin overrides applied). For the Slides
  // gallery (archetype=lesson), expose the full built-in lesson catalog instead
  // of the tiny homepage subset.
  const featuredSeed = archetypeQ === 'lesson' ? EXAMPLE_TOOLS : GALLERY_EXAMPLES;
  const featured = applyOverrides(featuredSeed, await getExampleOverrides())
    .filter((t: any) => !archetypeQ || (t?.archetype || t?.definition?.archetype) === archetypeQ)
    .map((t: any) => ({ ...t, hasSavedDeck: !!(t.definition?.lesson?.savedDeck?.slides?.length), definition: slimForList(t.definition) }));
  const seen = new Set<string>();
  const merged = [...featured, ...decorated].filter((t: any) => {
    const s = String(t?.slug || '');
    if (!s || seen.has(s)) return false;
    seen.add(s);
    return true;
  });
  return NextResponse.json({ tools: merged }, { headers: { 'Cache-Control': 'no-cache' } });
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
    // Repos & presentations get a default EMOJI thumbnail (a topic-appropriate
    // pick) so a fresh card is never blank; the owner can swap it (🎲 die / 📎
    // upload) later. A caller-provided real thumbnail wins.
    thumbnail: (typeof b.thumbnail === 'string' && b.thumbnail)
      ? b.thumbnail
      : ((def.archetype === 'repo' || def.archetype === 'lesson') ? emojiThumb(defaultEmojiFor(`${def.title} ${def.description || ''} ${def.lesson?.subject || ''}`, def.tags)) : null),
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
