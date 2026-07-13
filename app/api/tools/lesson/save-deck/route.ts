import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition } from '@/lib/tool-schema';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, updateTool } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { slug, config, slides }  -> save the current generated deck as the tool's
//                                   "original" (viewers can replay it with answers).
// POST { slug, clear: true }     -> remove the saved deck.
// OWNER or ADMIN only.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const tool = await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((tool.tags || []).includes('example')) return NextResponse.json({ error: 'Example tools cannot be edited.' }, { status: 400 });
  if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can save the original deck.' }, { status: 403 });
  }
  if (tool.definition?.archetype !== 'lesson') {
    return NextResponse.json({ error: 'This tool is not a lesson/presentation.' }, { status: 400 });
  }

  const lesson = { ...(tool.definition.lesson || {}) };
  if (b.clear) {
    delete lesson.savedDeck;
  } else {
    const slides = Array.isArray(b.slides) ? b.slides.filter(Boolean).slice(0, 75) : [];
    if (!slides.length) return NextResponse.json({ error: 'No generated slides to save yet — play through the deck first.' }, { status: 400 });
    const deck: any = {
      config: (b.config && typeof b.config === 'object') ? b.config : {},
      slides,
      savedAt: new Date().toISOString(),
      savedBy: a.user.username,
    };
    // The finisher's own results (score + per-question outcomes), when provided.
    if (b.results && typeof b.results === 'object') deck.results = b.results;
    // Guard against an oversized deck (many embedded AI images).
    if (JSON.stringify(deck).length > 3_500_000) {
      return NextResponse.json({ error: 'This deck is too large to save — use fewer AI images or slides.' }, { status: 413 });
    }
    lesson.savedDeck = deck;
  }

  const nextDef = { ...tool.definition, lesson };
  const { ok, errors, def } = validateToolDefinition(nextDef);
  if (!ok || !def) return NextResponse.json({ error: 'Invalid definition', details: errors }, { status: 400 });
  await updateTool(slug, { definition: def });
  return NextResponse.json({ ok: true, saved: !b.clear, slideCount: def.lesson?.savedDeck?.slides?.length || 0 });
}
