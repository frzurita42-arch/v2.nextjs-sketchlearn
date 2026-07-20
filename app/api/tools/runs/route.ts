import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { optionalAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools, listRecentEntries } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userState } = require('@/src/db/users');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tools/runs?singleSource=1&limit=300
// Public-facing saved lesson runs, joined to their lesson tool metadata.
export async function GET(req: Request) {
  const { user } = await optionalAuth(req);
  const url = new URL(req.url);
  const singleSource = url.searchParams.get('singleSource') === '1';
  const limitQ = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '300', 10) || 300));

  const viewerIsAdmin = user?.role === 'admin';
  const adminOwners = (userState.users || []).filter((u: any) => u.role === 'admin').map((u: any) => u.username);

  let tools: any[] = [];
  let entries: any[] = [];
  try {
    [tools, entries] = await Promise.all([
      listTools({ includePrivateFor: user?.username || null, adminOwners, viewerIsAdmin, limit: 300, strictDb: singleSource }),
      listRecentEntries({ limit: Math.max(limitQ, 1200), strictDb: singleSource }),
    ]);
  } catch {
    return NextResponse.json({ error: 'Could not load runs from the primary source.' }, { status: 503 });
  }

  const lessonTools = (tools || []).filter((t: any) => (t?.archetype || t?.definition?.archetype) === 'lesson');
  const byId = new Map(lessonTools.map((t: any) => [String(t.id || ''), t]));

  const runs = (entries || []).map((e: any) => {
    const tool = byId.get(String(e?.toolId || ''));
    if (!tool) return null;
    const isOwner = !!user && (tool.owner === user.username || user.role === 'admin');
    if (!isOwner && !['active', 'approved'].includes(String(e?.status || 'active'))) return null;
    const d = e?.data || {};
    return {
      id: e.id,
      toolId: tool.id,
      toolSlug: tool.slug,
      toolTitle: tool.title,
      toolOwner: tool.owner,
      toolCreatedAt: tool.createdAt || null,
      toolUpdatedAt: tool.updatedAt || null,
      title: String(d?.title || '').trim(),
      topic: String(d?.topic || tool?.definition?.lesson?.subject || '').trim(),
      level: String(d?.level || d?.difficulty || tool?.definition?.lesson?.level || '').trim(),
      slides: parseInt(d?.slides, 10) || parseInt(tool?.definition?.lesson?.totalSlides, 10) || (Array.isArray(tool?.definition?.lesson?.pages) ? tool.definition.lesson.pages.length : 0) || 0,
      score: typeof d?.score === 'number' ? d.score : null,
      thumbnail: String(d?.thumbnail || '').trim(),
      username: e.username || 'anon',
      createdAt: e.createdAt || null,
      updatedAt: e.updatedAt || e.createdAt || null,
      data: d,
    };
  }).filter(Boolean)
    .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, limitQ);

  return NextResponse.json({ runs }, { headers: { 'Cache-Control': 'no-cache' } });
}
