import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
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
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const role = a.user.role;
  const isAdmin = role === 'admin';
  const me = a.user.username;

  const rawTools: any[] = await listTools({ viewerIsAdmin: true, limit: 200 });
  const tools = rawTools.map((t: any) => {
    const def = t.definition || {};
    const cardCount = (def.repo && Array.isArray(def.repo.cards)) ? countCards(def.repo.cards) : 0;
    const repoMeta = def.repo && Array.isArray(def.repo.cards) ? collectRepoMeta(def.repo.cards) : { lastEdited: null, imageUrl: '', imageTitle: '', imageKind: '', keywords: [] as string[] };
    const lessonMeta = def.lesson ? collectLessonMeta(def.lesson) : { lastEdited: null, keywords: [] as string[] };
    const slideCount = def.lesson ? (parseInt(def.lesson.totalSlides, 10) || (Array.isArray(def.lesson.pages) ? def.lesson.pages.length : 0)) : 0;
    const hasSavedDeck = !!(def.lesson && def.lesson.savedDeck && Array.isArray(def.lesson.savedDeck.slides) && def.lesson.savedDeck.slides.length);
    return {
      id: t.id, slug: t.slug, title: t.title, owner: t.owner,
      archetype: t.archetype, visibility: t.visibility,
      createdAt: t.createdAt || t.updatedAt || null,
      updatedAt: t.updatedAt || null,
      tags: Array.isArray(t.tags) ? t.tags : [],
      aiGenerated: !!t.aiGenerated, likeCount: t.likeCount || 0,
      cardCount, slideCount, hasSavedDeck,
      repoLastEdited: repoMeta.lastEdited,
      repoImageUrl: repoMeta.imageUrl,
      repoImageTitle: repoMeta.imageTitle,
      repoImageKind: repoMeta.imageKind,
      repoKeywords: repoMeta.keywords,
      slideLastEdited: lessonMeta.lastEdited,
      slideKeywords: lessonMeta.keywords,
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
      const createdAt = e.createdAt || null;
      const updatedAt = e.updatedAt || e.createdAt || null;
      const keywords = makeKeywords([
        tool.title || '', d.topic || '', d.level || d.difficulty || '', d.theme || '', d.imageStyle || '', d.density || '',
        d.slides ? `slides ${d.slides}` : '',
        d.subject || '', d.course || '', d.unit || '',
      ].join(' '), 10);
      return {
        id: e.id, user: e.username || 'anon',
        toolTitle: tool.title || '(deleted tool)', toolSlug: tool.slug || '', archetype: tool.archetype || '',
        topic: d.topic || '', level: d.level || d.difficulty || '', theme: d.theme && d.theme !== 'Any' ? d.theme : '',
        imageStyle: d.imageStyle && d.imageStyle !== 'Any' ? d.imageStyle : '',
        density: d.density || '', slides: parseInt(d.slides, 10) || tool.slideCount || 0,
        score: scoreNum, createdAt, updatedAt,
        runKeywords: keywords,
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

  // Role scoping. Admin sees everything (all users' work + the site's own
  // component/build-log/page-text tables). A MODERATOR sees ONLY their own work —
  // their tools, the runs of those tools, and the tokens THEY spent — and none of
  // the site-internal tables. A plain USER gets no tables here (their dashboard is
  // just the token window, fed by /api/tokens).
  if (!isAdmin) {
    if (role !== 'moderator') {
      return NextResponse.json({ tools: [], runs: [], usage: [], usageByUser: [], componentUsage: [], buildLog: [], registry: [], hiddenRows: [], role, scope: 'none' }, { headers: { 'Cache-Control': 'no-cache' } });
    }
    const myTools = tools.filter((t: any) => t.owner === me);
    const mySlugs = new Set(myTools.map((t: any) => t.slug));
    const myRuns = runs.filter((r: any) => mySlugs.has(r.toolSlug));
    const myUsage = usage.filter((u: any) => u.user === me);
    const myByUser = [{ user: me, events: myUsage.length, tokens: myUsage.reduce((s: number, u: any) => s + (u.totalTokens || 0), 0), images: myUsage.filter((u: any) => u.kind.includes('image') || u.kind === 'thumbnail').length, cost: myUsage.reduce((s: number, u: any) => s + (u.costUsd || 0), 0) }];
    const myComponentUsage = componentUsage.filter((c: any) => c.user === me);
    return NextResponse.json({ tools: myTools, runs: myRuns, usage: myUsage, usageByUser: myByUser, componentUsage: myComponentUsage, buildLog: [], registry: [], hiddenRows: [], role, scope: 'own' }, { headers: { 'Cache-Control': 'no-cache' } });
  }

  return NextResponse.json({ tools, runs, usage, usageByUser, componentUsage, buildLog: WEBSITE_BUILD_LOG, registry: COMPONENT_REGISTRY, hiddenRows, role, scope: 'all' }, { headers: { 'Cache-Control': 'no-cache' } });
}

function countCards(cards: any[]): number {
  let n = 0;
  for (const c of (Array.isArray(cards) ? cards : [])) { n += 1; if (Array.isArray(c.children)) n += countCards(c.children); }
  return n;
}

function collectRepoMeta(cards: any[]): { lastEdited: string | null; imageUrl: string; imageTitle: string; imageKind: string; keywords: string[] } {
  let lastEdited: string | null = null;
  let imageUrl = '';
  let imageTitle = '';
  let imageKind = '';
  const keywords = new Set<string>();
  const walk = (nodes: any[]) => {
    for (const c of (Array.isArray(nodes) ? nodes : [])) {
      const edited = String(c?.lastEdited || c?.createdAt || '').trim();
      if (edited && (!lastEdited || new Date(edited).getTime() > new Date(lastEdited).getTime())) lastEdited = edited;
      addKeywords(keywords, [c?.title, c?.subtitle, c?.text, c?.aiPrompt, c?.icon, c?.mode]);
      if (!imageUrl) {
        const url = String(c?.genImage || c?.image || '').trim();
        if (url) {
          imageUrl = url;
          imageTitle = String(c?.title || 'Untitled card');
          imageKind = c?.genImage ? 'AI-generated image' : 'Attached image';
        }
      }
      if (Array.isArray(c?.children)) walk(c.children);
    }
  };
  walk(cards);
  return { lastEdited, imageUrl, imageTitle, imageKind, keywords: takeKeywords(keywords, 10) };
}

function collectLessonMeta(lesson: any): { lastEdited: string | null; keywords: string[] } {
  const keywords = new Set<string>();
  const deck = lesson?.savedDeck;
  let lastEdited: string | null = null;
  if (deck && deck.savedAt) lastEdited = String(deck.savedAt);
  addKeywords(keywords, [lesson?.title, lesson?.description, lesson?.subjectKind, lesson?.mode, lesson?.totalSlides]);
  const pages = Array.isArray(lesson?.pages) ? lesson.pages : [];
  for (const p of pages) addKeywords(keywords, [p?.title, p?.subtitle, p?.text, p?.kind, p?.type]);
  if (deck && Array.isArray(deck.slides)) {
    for (const s of deck.slides) {
      addKeywords(keywords, [s?.title, s?.subtitle, s?.text, s?.template]);
      if (Array.isArray(s?.questions)) for (const q of s.questions) addKeywords(keywords, [q?.prompt, q?.kind, q?.answer]);
    }
  }
  return { lastEdited, keywords: takeKeywords(keywords, 10) };
}

function addKeywords(set: Set<string>, values: any[]) {
  const words = makeKeywords(values.join(' '), 40);
  for (const w of words) set.add(w);
}

function makeKeywords(text: string, limit = 10): string[] {
  const stop = new Set(['the','and','for','with','from','that','this','your','you','are','was','were','will','have','has','had','not','but','into','onto','about','slide','slides','tool','tools','presentation','presentations','repo','repository','run','runs','card','cards','lesson','lessons']);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (raw.length < 3 || stop.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= limit) break;
  }
  return out;
}

function takeKeywords(set: Set<string>, limit = 10): string[] {
  return Array.from(set).slice(0, limit);
}
