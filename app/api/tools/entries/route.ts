import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, optionalAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, insertEntry, listEntries, setEntryStatus, getEntry, updateEntryData, deleteEntry } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userState } = require('@/src/db/users');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Resolve a slug to a real DB tool OR a built-in virtual example/admin tool. The
// example objects are already tool-shaped (id === slug), so their renditions are
// keyed by the slug — letting example & admin lessons save/load a History feed too.
async function resolveTool(slug: string) {
  return (await getToolBySlug(slug)) || exampleBySlug(slug) || null;
}

// GET /api/tools/entries?slug=xyz -> entries for an app tool.
// Non-owners only see 'active'/'approved'; the owner sees everything (incl. pending).
export async function GET(req: Request) {
  // Public read: signed-out visitors can browse a tool's saved presentation runs
  // (and open the owner's saved results). A user (if any) unlocks their own
  // private submissions and the owner/admin view.
  const { user } = await optionalAuth(req);
  const slug = new URL(req.url).searchParams.get('slug') || '';
  const tool = await resolveTool(slug);
  if (!tool || !['app', 'lesson', 'repo'].includes(tool.archetype)) return NextResponse.json({ entries: [] });
  const all = await listEntries(tool.id, { limit: 300 });
  const isOwner = !!user && (tool.owner === user.username || user.role === 'admin');
  // Repository contributions (e.g. payment proofs) are private-by-default: each
  // user sees only their own submissions; the owner/admin sees everyone's.
  let entries;
  if (tool.archetype === 'repo') {
    // Contributions are private (each user sees only their own); favorites (__fav)
    // are public signals so the ★ / liked-by-admin / OP filters work for everyone.
    entries = isOwner ? all : all.filter((e: any) => (user && e.username === user.username) || e?.data?.__fav);
  } else {
    entries = isOwner ? all : all.filter((e: any) => e.status === 'active' || e.status === 'approved');
  }
  // Flag entries authored by an admin (for the "liked by admin" feed filter).
  const admins = new Set((userState.users || []).filter((u: any) => u.role === 'admin').map((u: any) => u.username));
  const mods = new Set((userState.users || []).filter((u: any) => u.role === 'moderator').map((u: any) => u.username));
  const flagged = entries.map((e: any) => ({ ...e, byAdmin: admins.has(e.username), byModerator: mods.has(e.username) }));
  return NextResponse.json({ entries: flagged, isOwner, review: !!tool.definition?.app?.review }, { headers: { 'Cache-Control': 'no-cache' } });
}

// POST /api/tools/entries { slug, data } -> add an entry (pending if the tool uses review).
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const tool = await resolveTool(String(b.slug || ""));
  if (!tool || !['app', 'lesson', 'repo'].includes(tool.archetype)) return NextResponse.json({ error: 'Not an app, lesson, or repo tool' }, { status: 400 });
  const data = (b.data && typeof b.data === 'object') ? b.data : {};
  // Guard against oversized payloads (e.g. a huge embedded image data URL).
  if (JSON.stringify(data).length > 2_200_000) {
    return NextResponse.json({ error: 'Entry too large — use a smaller image.' }, { status: 413 });
  }
  const record = {
    id: `e-${crypto.randomUUID().slice(0, 12)}`,
    toolId: tool.id,
    username: a.user.username,
    status: tool.definition?.app?.review ? 'pending' : 'active',
    data,
    createdAt: new Date().toISOString(),
  };
  await insertEntry(record);
  return NextResponse.json({ entry: record });
}

// PATCH /api/tools/entries { slug, entryId, config } -> merge the run's final
// tweaked config (theme, level, image style, …) onto a rendition. This is how a
// learner's in-play adjustments are PERSISTED: the player calls it only when the
// run reaches the end, so the saved gallery card carries the tweaks and a replay
// starts from them. The entry's own author (the player), the tool owner, or an
// admin may finalize it.
export async function PATCH(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const tool = await resolveTool(String(b.slug || ''));
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const entry = await getEntry(String(b.entryId || ''));
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  const isOwner = tool.owner === a.user.username || a.user.role === 'admin';
  if (entry.username !== a.user.username && !isOwner) {
    return NextResponse.json({ error: 'Only the entry author, the tool owner, or an admin can update it.' }, { status: 403 });
  }
  // Only persist known config knobs the player can tweak mid-run — never let this
  // overwrite a card's title/subtitle/thumbnail or other rendition data.
  const src = (b.config && typeof b.config === 'object') ? b.config : {};
  const ALLOWED = ['theme', 'level', 'difficulty', 'imageStyle', 'imageProvider', 'voice', 'tone', 'topic', 'slides', 'paragraphs', 'length', 'category', 'score', 'density'];
  const patch: Record<string, any> = {};
  for (const k of ALLOWED) if (src[k] !== undefined) patch[k] = typeof src[k] === 'string' ? String(src[k]).slice(0, 200) : src[k];
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, data: entry.data });
  const data = await updateEntryData(entry.id, patch);
  return NextResponse.json({ ok: true, data });
}

// PUT /api/tools/entries { slug, entryId, status } -> owner approves/rejects.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const tool = await resolveTool(String(b.slug || ""));
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tool.owner !== a.user.username && a.user.role !== 'admin') return NextResponse.json({ error: 'Only the owner or an admin can moderate entries' }, { status: 403 });
  // Repositories carry custom, per-card status labels (e.g. pending → paid /
  // graded), so accept any short label there. App/lesson tools keep the fixed set.
  const status = tool.archetype === 'repo'
    ? String(b.status || '').slice(0, 24).trim() || 'pending'
    : (['active', 'approved', 'rejected', 'pending'].includes(b.status) ? b.status : 'approved');
  const okUpd = await setEntryStatus(String(b.entryId || ''), status);
  return NextResponse.json({ ok: okUpd });
}

// DELETE /api/tools/entries { slug, entryId } -> remove a rendition/entry.
// The entry's author, the tool owner, or an admin may delete it.
export async function DELETE(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const tool = await resolveTool(String(b.slug || ""));
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const entry = await getEntry(String(b.entryId || ''));
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  const isOwner = tool.owner === a.user.username || a.user.role === 'admin';
  if (!(isOwner || entry.username === a.user.username)) {
    return NextResponse.json({ error: 'You can only delete your own renditions.' }, { status: 403 });
  }
  const ok = await deleteEntry(entry.id);
  return NextResponse.json({ ok });
}
