import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { optionalAuth } from '@/lib/auth-guard';
import { toolCategory } from '@/lib/tool-category';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools, getExampleOverrides } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EXAMPLE_TOOLS, applyOverrides } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { favs?, like?, limit? } -> { picks }
// The AI recommender: asks the model to hand-pick up to `limit` tools AND
// repositories from the ones available that best fit the viewer's interests
// (the tools they own + favorited, and optionally the tool they're on), with a
// short reason each. Falls back to an interest-overlap ranking when no model.
const wordsOf = (t: any): string[] => {
  const def = t.definition || {};
  const subject = def.lesson?.subject || def.repo?.title || '';
  return [...(Array.isArray(t.tags) ? t.tags : []), toolCategory(t), ...String(subject).toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length > 3), t.archetype]
    .filter(Boolean).map((s: string) => String(s).toLowerCase());
};
const pickFields = (t: any, reason: string) => ({ slug: t.slug, title: t.title, description: t.description || '', thumbnail: t.thumbnail || '', archetype: t.archetype, owner: t.owner, visibility: t.visibility || 'public', tags: Array.isArray(t.tags) ? t.tags : [], category: toolCategory(t), reason });

export async function POST(req: Request) {
  const { user } = await optionalAuth(req);   // public: guests get recommendations too
  const uname = user?.username || '';
  const isAdmin = user?.role === 'admin';
  const b = (await req.json().catch(() => ({}))) || {};
  const favs = new Set(String(b.favs || '').split(',').map((s: string) => s.trim()).filter(Boolean));
  const like = String(b.like || '');
  const limit = Math.max(1, Math.min(20, parseInt(b.limit, 10) || 10));
  // Optional free-text query (e.g. the coach chat topic) to bias toward a subject.
  const queryWords = String(b.query || '').toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length > 3);
  // Optionally restrict to PLAYABLE presentations (a "run to play").
  const playableOnly = !!b.playable;

  const real: any[] = (await listTools({ viewer: uname, viewerIsAdmin: isAdmin, limit: 300 })) || [];
  const exs = applyOverrides(Array.isArray(EXAMPLE_TOOLS) ? EXAMPLE_TOOLS : [], await getExampleOverrides());
  const all = [...real, ...exs].filter(t => t.slug && (t.visibility !== 'private' || t.owner === uname));

  // Interest profile from owned + favorited (+ current tool) + the chat query, and
  // the known set.
  const profile = new Map<string, number>();
  const known = new Set<string>();
  const bump = (t: any, w: number) => { for (const k of wordsOf(t)) profile.set(k, (profile.get(k) || 0) + w); };
  for (const t of all) {
    if (uname && t.owner === uname) { bump(t, 2); known.add(t.slug); }
    if (favs.has(t.slug)) { bump(t, 3); known.add(t.slug); }
    if (t.slug === like) { bump(t, 4); known.add(t.slug); }
  }
  for (const w of queryWords) profile.set(w, (profile.get(w) || 0) + 5);   // topic dominates
  const hasProfile = profile.size > 0;
  const candidates = all.filter(t => !known.has(t.slug) && (!playableOnly || t.archetype === 'lesson'));
  // Rank a shortlist deterministically first (bounds the AI prompt).
  const shortlist = candidates
    .map(t => ({ t, s: hasProfile ? wordsOf(t).reduce((n, k) => n + (profile.get(k) || 0), 0) : 0 }))
    .sort((x, y) => y.s - x.s)
    .slice(0, 30)
    .map(x => x.t);

  const interests = Array.from(profile.entries()).sort((x, y) => y[1] - x[1]).slice(0, 8).map(e => e[0]).join(', ');

  // Ask the AI to choose, when a model is available.
  if ((openrouterEnabled || geminiEnabled || deepseekEnabled) && shortlist.length) {
    const menu = shortlist.map((t, i) => `${i + 1}. [${t.slug}] "${t.title}" (${toolCategory(t)}) — ${String(t.description || '').slice(0, 100)}`).join('\n');
    const system = [
      'You are the warm curator of SketchLearn, a community of AI-built tools and repositories.',
      `Recommend up to ${limit} items from the numbered list that this person would most enjoy, based on their interests: ${interests || '(new user — pick a friendly, varied mix)'}.`,
      'Favour variety across subjects and tool types, and mix in a repository if a good one fits. Give each a short, specific reason (why THEM).',
      'Only choose from the list; use each slug at most once.',
      'MENU:', menu,
      'Return STRICT JSON: { "picks": [ { "slug": "...", "reason": "..." } ] }.',
    ].join('\n');
    try {
      const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: 'Recommend for me.' }], { temperature: 0.8, maxTokens: 700 });
      const bySlug = new Map(shortlist.map(t => [t.slug, t]));
      const seen = new Set<string>();
      const picks = (Array.isArray(r?.picks) ? r.picks : [])
        .map((p: any) => ({ t: bySlug.get(String(p?.slug || '')), reason: String(p?.reason || '').slice(0, 120) }))
        .filter((x: any) => x.t && !seen.has(x.t.slug) && seen.add(x.t.slug))
        .slice(0, limit)
        .map((x: any) => pickFields(x.t, x.reason || 'A great match for you'));
      if (picks.length) return NextResponse.json({ picks, ai: true });
    } catch { /* fall through to deterministic */ }
  }

  // Deterministic fallback.
  const picks = shortlist.slice(0, limit).map(t => {
    const shared = wordsOf(t).find(k => (profile.get(k) || 0) > 0 && k !== t.archetype);
    return pickFields(t, hasProfile && shared ? `Because you like ${shared}` : (t.archetype === 'repo' ? 'A repository to explore' : 'Popular right now'));
  });
  return NextResponse.json({ picks, ai: false });
}
