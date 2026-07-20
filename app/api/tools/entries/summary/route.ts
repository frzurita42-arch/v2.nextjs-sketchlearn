import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { optionalAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools, listRecentEntries } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userState } = require('@/src/db/users');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function supportTokens(support: any) {
  const out: string[] = [];
  if (support?.images) out.push('img');
  if (support?.tables) out.push('table');
  if (support?.formulas) out.push('formula');
  if (support?.code) out.push('code');
  if (support?.audio) out.push('audio');
  if (support?.geogebra) out.push('graph');
  return out;
}

function activityToken(kind: string) {
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'mcq') return 'mcq4';
  if (k === 'fill-blank') return 'fill-blank';
  if (k === 'input') return 'write-answer';
  if (k === 'writing') return 'handwriting';
  if (k === 'annotation') return 'annotation';
  if (k === 'code') return 'code-box';
  return k || 'mcq4';
}

function slideComboHint(lesson: any) {
  const pages = Array.isArray(lesson?.pages) ? lesson.pages : [];
  const lessonSupport = lesson?.support || {};
  const lessonActivities = Array.isArray(lesson?.activityTypes) ? lesson.activityTypes : [];
  const buildRecipe = (page: any, index: number) => {
    const readingOn = page?.reading !== false;
    const paraCount = Math.max(1, Math.min(4, parseInt(page?.paragraphsPerSlide, 10) || parseInt(lesson?.paragraphsPerSlide, 10) || 1));
    const seq: string[] = [];
    if (readingOn) {
      for (let i = 0; i < paraCount; i += 1) seq.push('text');
    }
    seq.push(...supportTokens({ ...lessonSupport, ...(page?.support || {}) }));
    const acts = (Array.isArray(page?.activityTypes) && page.activityTypes.length ? page.activityTypes : lessonActivities)
      .map(activityToken)
      .filter(Boolean);
    const evalPart = acts.length ? `[${acts.join(' | ')}]` : '[mcq4 | fill-blank | write-answer]';
    return `${index + 1}: ${[...seq, evalPart].join(', ')}`;
  };
  if (!pages.length) return buildRecipe({}, 0);
  return pages.slice(0, 12).map(buildRecipe).join(' ; ');
}

// GET /api/tools/entries/summary?archetype=lesson&singleSource=1&limit=200
// Returns one row per tool with latest-access metadata from its most recent entry.
export async function GET(req: Request) {
  const { user } = await optionalAuth(req);
  const url = new URL(req.url);
  const archetypeQ = (url.searchParams.get('archetype') || 'lesson').trim();
  const singleSource = url.searchParams.get('singleSource') === '1';
  const limitQ = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '200', 10) || 200));

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

  const lessonTools = (tools || []).filter((t: any) => {
    const kind = t?.archetype || t?.definition?.archetype;
    return !archetypeQ || kind === archetypeQ;
  });

  let recentEntries: any[] = [];
  try {
    recentEntries = await listRecentEntries({ limit: Math.max(200, Math.min(4000, limitQ * 20)), strictDb: singleSource });
  } catch {
    return NextResponse.json({ error: 'Could not load entry summaries from the primary source.' }, { status: 503 });
  }

  const latestByToolId = new Map<string, any>();
  for (const entry of (recentEntries || [])) {
    const key = String(entry?.toolId || '');
    if (key && !latestByToolId.has(key)) latestByToolId.set(key, entry);
  }

  const summaries = lessonTools.map((t: any) => {
    const latest = latestByToolId.get(String(t?.id || '')) || null;
    const slideCount = Number(t?.definition?.lesson?.totalSlides || t?.definition?.lesson?.pages?.length || 0) || 0;
    const lesson = t?.definition?.lesson || {};
    const comboHint = slideComboHint(lesson);
    return {
      slug: t.slug,
      title: t.title,
      owner: t.owner,
      topic: String(t?.definition?.lesson?.subject || t?.definition?.lesson?.topic || '').trim() || '',
      slideCount,
      createdAt: t?.createdAt || null,
      updatedAt: t?.updatedAt || null,
      lastAccessedAt: latest?.updatedAt || latest?.createdAt || t?.updatedAt || t?.createdAt || null,
      lastAccessedBy: latest?.username || '',
      aiSlideComboHint: comboHint,
    };
  });

  return NextResponse.json({ summaries }, { headers: { 'Cache-Control': 'no-cache' } });
}
