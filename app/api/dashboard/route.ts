import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools, listRecentEntries } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listUsage } = require('@/src/db/usage');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EXAMPLE_USAGE } = require('@/src/tools/example-usage');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/dashboard -> grouped data for the admin dashboard (admin only):
//   tools: every published tool (light — no embedded media), with a slide/card
//          count so the "slide tools" and "repositories" tables can group them.
//   runs:  every saved presentation RUN (a lesson entry), enriched with its tool's
//          title and the run's grade / level / theme / topic — the "who scored
//          what" table.
// The underlying storage stays normalised (separate tools / entries / users /
// comments tables); this endpoint just joins what the dashboard needs to display.
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;

  const rawTools: any[] = await listTools({ viewerIsAdmin: true, limit: 200 });
  const tools = rawTools.map((t: any) => {
    const def = t.definition || {};
    const cardCount = (def.repo && Array.isArray(def.repo.cards)) ? countCards(def.repo.cards) : 0;
    const slideCount = def.lesson ? (parseInt(def.lesson.totalSlides, 10) || (Array.isArray(def.lesson.pages) ? def.lesson.pages.length : 0)) : 0;
    const hasSavedDeck = !!(def.lesson && def.lesson.savedDeck && Array.isArray(def.lesson.savedDeck.slides) && def.lesson.savedDeck.slides.length);
    return {
      id: t.id, slug: t.slug, title: t.title, owner: t.owner,
      archetype: t.archetype, visibility: t.visibility,
      createdAt: t.createdAt || t.updatedAt || null,
      tags: Array.isArray(t.tags) ? t.tags : [],
      aiGenerated: !!t.aiGenerated, likeCount: t.likeCount || 0,
      cardCount, slideCount, hasSavedDeck,
    };
  });
  const byId: Record<string, any> = {};
  for (const t of tools) byId[t.id] = t;

  const rawEntries: any[] = await listRecentEntries({ limit: 200 });
  // A "run" is a saved lesson rendition (skip favorites and non-lesson submissions).
  const runs = rawEntries
    .filter((e: any) => e && e.data && !e.data.__fav)
    .map((e: any) => {
      const tool = byId[e.toolId] || {};
      const d = e.data || {};
      const scoreNum = typeof d.score === 'number' ? d.score : null;
      return {
        id: e.id, user: e.username || 'anon',
        toolTitle: tool.title || '(deleted tool)', toolSlug: tool.slug || '', archetype: tool.archetype || '',
        topic: d.topic || '', level: d.level || d.difficulty || '', theme: d.theme && d.theme !== 'Any' ? d.theme : '',
        imageStyle: d.imageStyle && d.imageStyle !== 'Any' ? d.imageStyle : '',
        density: d.density || '', slides: parseInt(d.slides, 10) || tool.slideCount || 0,
        score: scoreNum, createdAt: e.createdAt || null,
      };
    })
    .filter((r: any) => r.archetype === 'lesson' || r.score !== null);

  // AI token / cost usage — per event + a per-user roll-up for profitability. Real
  // logged rows lead; a few clearly-marked EXAMPLE rows backfill so the tables and
  // charts are never empty before real generations accrue.
  const realUsage: any[] = await listUsage({ limit: 500 });
  const rawUsage: any[] = [...realUsage, ...EXAMPLE_USAGE];
  const usage = rawUsage.map((u: any) => ({
    id: u.id, user: u.username || 'anon', kind: u.kind || '', provider: u.provider || '',
    promptTokens: u.promptTokens || 0, completionTokens: u.completionTokens || 0, totalTokens: u.totalTokens || 0,
    costUsd: Number(u.costUsd) || 0, subject: u.subject || '', prompt: (u.meta && u.meta.prompt) || '',
    createdAt: u.createdAt || null,
  }));
  const byUser: Record<string, any> = {};
  for (const u of usage) {
    const k = u.user;
    if (!byUser[k]) byUser[k] = { user: k, events: 0, tokens: 0, images: 0, cost: 0 };
    byUser[k].events += 1;
    byUser[k].tokens += u.totalTokens;
    if (u.kind.includes('image') || u.kind === 'thumbnail') byUser[k].images += 1;
    byUser[k].cost += u.costUsd;
  }
  const usageByUser = Object.values(byUser).sort((a: any, b: any) => b.cost - a.cost);

  return NextResponse.json({ tools, runs, usage, usageByUser }, { headers: { 'Cache-Control': 'no-cache' } });
}

function countCards(cards: any[]): number {
  let n = 0;
  for (const c of (Array.isArray(cards) ? cards : [])) { n += 1; if (Array.isArray(c.children)) n += countCards(c.children); }
  return n;
}
