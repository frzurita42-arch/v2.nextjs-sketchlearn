import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools, listRecentEntries } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listUsage } = require('@/src/db/usage');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EXAMPLE_USAGE } = require('@/src/tools/example-usage');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EXAMPLE_COMPONENT_USAGE } = require('@/src/tools/example-component-usage');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WEBSITE_BUILD_LOG } = require('@/src/tools/website-build-log');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { COMPONENT_REGISTRY } = require('@/src/tools/component-registry');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSiteSettings } = require('@/src/db/platform');

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

  // Component usage — which slide components are actually being used, how, and how
  // learners do on them. Derive REAL rows from every tool's saved deck (its slides
  // carry the components + the author's results), then backfill with clearly-marked
  // EXAMPLE rows so the table/chart are never empty.
  const realComponentUsage: any[] = [];
  for (const t of rawTools) {
    const deck = t.definition?.lesson?.savedDeck;
    if (!deck || !Array.isArray(deck.slides)) continue;
    const subjectKind = t.definition?.lesson?.subjectKind || 'general';
    const results = (deck.results && typeof deck.results === 'object') ? deck.results : {};
    deck.slides.forEach((sl: any, si: number) => {
      const template = String(sl?.template || sl?.layout || 'default');
      const topic = String(deck.config?.topic || t.title || '');
      const level = String(deck.config?.level || deck.config?.difficulty || t.definition?.lesson?.level || '');
      const base = { tool: t.title, slug: t.slug, user: deck.savedBy || t.owner || 'anon', topic, level, subjectKind, template, createdAt: deck.savedAt || t.createdAt || null };
      // Content components on the slide.
      for (const comp of (Array.isArray(sl?.components) ? sl.components : [])) {
        const type = String(comp?.type || comp?.kind || '').trim();
        if (type) realComponentUsage.push({ id: `cu-${t.slug}-${si}-${type}-${realComponentUsage.length}`, component: type, role: (type === 'image' || type === 'svg' || type === 'chart') ? 'visual' : 'teaching', correct: null, ...base });
      }
      // Question components — correctness from the saved results.
      (Array.isArray(sl?.questions) ? sl.questions : []).forEach((q: any, qi: number) => {
        const kind = String(q?.kind || 'mcq');
        const ans = results[si]?.answers?.[qi];
        realComponentUsage.push({ id: `cu-${t.slug}-${si}-q${qi}`, component: kind, role: 'question', correct: typeof ans?.correct === 'boolean' ? ans.correct : null, ...base });
      });
    });
  }
  const componentUsage = [...realComponentUsage, ...EXAMPLE_COMPONENT_USAGE].map((c: any) => ({
    id: c.id, component: c.component || '', role: c.role || '', correct: c.correct,
    template: c.template || '', tool: c.tool || '', topic: c.topic || '', level: c.level || '',
    subjectKind: c.subjectKind || '', createdAt: c.createdAt || null, user: c.user || 'anon',
  }));

  // Rows the admin has hidden from the dashboard (soft-delete). Stored as
  // "table:id" strings in site_settings; the client filters each table by these.
  const settings = await getSiteSettings();
  const hiddenRows = Array.isArray(settings?.dashHiddenRows) ? settings.dashHiddenRows : [];

  return NextResponse.json({ tools, runs, usage, usageByUser, componentUsage, buildLog: WEBSITE_BUILD_LOG, registry: COMPONENT_REGISTRY, hiddenRows }, { headers: { 'Cache-Control': 'no-cache' } });
}

function countCards(cards: any[]): number {
  let n = 0;
  for (const c of (Array.isArray(cards) ? cards : [])) { n += 1; if (Array.isArray(c.children)) n += countCards(c.children); }
  return n;
}
