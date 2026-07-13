import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { toolCategory } from '@/lib/tool-category';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EXAMPLE_TOOLS } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tools/suggestions?favs=slug1,slug2&seed=123&limit=10
// "Top picks for you": tools AND repositories ranked by how well their blocks of
// interest (category, tags, subject) overlap the viewer's activity — the tools
// they own and the ones they favorited (passed in `favs`). A `seed` reshuffles
// ties so Refresh yields a fresh set. Optional `like` biases toward one tool's
// interests (used on a tool page: "more like this"). Cheap + deterministic; no
// model call, so Refresh is instant and free.
const words = (t: any): string[] => {
  const def = t.definition || {};
  const subject = def.lesson?.subject || def.repo?.title || '';
  return [
    ...(Array.isArray(t.tags) ? t.tags : []),
    toolCategory(t),
    ...String(subject).toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length > 3),
    t.archetype,
  ].filter(Boolean).map((s: string) => String(s).toLowerCase());
};

// A small seeded shuffle key so Refresh varies the order deterministically.
function seededKey(id: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 0x01000193)) >>> 0;
  return h / 0xffffffff;
}

export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const favs = new Set((url.searchParams.get('favs') || '').split(',').map(s => s.trim()).filter(Boolean));
  const like = String(url.searchParams.get('like') || '');
  const seed = parseInt(url.searchParams.get('seed') || '0', 10) || 0;
  const limit = Math.max(1, Math.min(20, parseInt(url.searchParams.get('limit') || '10', 10) || 10));

  const real: any[] = (await listTools({ viewer: a.user.username, viewerIsAdmin: a.user.role === 'admin', limit: 300 })) || [];
  // Include the built-in examples too (they're virtual, not in the DB), so the
  // shelf is never empty for a brand-new user with no tools yet.
  const all: any[] = [...real, ...(Array.isArray(EXAMPLE_TOOLS) ? EXAMPLE_TOOLS : [])];
  const visible = all.filter(t => t.slug && (t.visibility !== 'private' || t.owner === a.user.username));

  // Interest profile: weighted bag of words from the tools you own + favorited +
  // (optionally) the tool you're currently on.
  const profile = new Map<string, number>();
  const bump = (t: any, w: number) => { for (const k of words(t)) profile.set(k, (profile.get(k) || 0) + w); };
  const known = new Set<string>();
  for (const t of visible) {
    if (t.owner === a.user.username) { bump(t, 2); known.add(t.slug); }
    if (favs.has(t.slug)) { bump(t, 3); known.add(t.slug); }
    if (t.slug === like) { bump(t, 4); known.add(t.slug); }
  }
  const hasProfile = profile.size > 0;

  // Candidates: everything the viewer doesn't already know. Prefer real tools, but
  // keep examples as a backfill so new users still get a full, non-empty shelf.
  const candidates = visible.filter(t => !known.has(t.slug));
  const nonExample = candidates.filter(t => !(t.tags || []).includes('example'));
  const pool = nonExample.length >= limit ? nonExample : candidates;
  const scored = pool
    .map(t => {
      const score = hasProfile ? words(t).reduce((s, k) => s + (profile.get(k) || 0), 0) : 0;
      // Blend the interest score with a seeded jitter so Refresh reshuffles and
      // new users (no profile) still get a varied, non-empty set.
      return { t, rank: score + seededKey(t.slug, seed || 1) * (hasProfile ? 1.5 : 5) };
    })
    .sort((x, y) => y.rank - x.rank)
    .slice(0, limit)
    .map(({ t }) => {
      const cat = toolCategory(t);
      const shared = words(t).find(k => (profile.get(k) || 0) > 0 && k !== t.archetype);
      const reason = hasProfile && shared
        ? `Because you like ${shared}`
        : (t.archetype === 'repo' ? 'A repository to explore' : 'Popular right now');
      return { slug: t.slug, title: t.title, description: t.description || '', thumbnail: t.thumbnail || '', archetype: t.archetype, owner: t.owner, category: cat, reason };
    });

  return NextResponse.json({ picks: scored }, { headers: { 'Cache-Control': 'no-cache' } });
}
