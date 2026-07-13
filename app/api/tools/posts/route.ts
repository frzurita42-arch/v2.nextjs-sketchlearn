import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listRecentEntries, listTools } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userState } = require('@/src/db/users');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tools/posts?limit=20 -> { posts }
// "Posts from the tools": the recent generated renditions/entries people made
// across ALL tools, each linked back to the tool that produced it. (Distinct from
// the tools themselves — those are the tool SYSTEM.)
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const limit = Math.max(1, Math.min(30, parseInt(new URL(req.url).searchParams.get('limit') || '20', 10) || 20));

  const [entries, tools] = await Promise.all([
    listRecentEntries({ limit: 120 }),
    listTools({ viewer: a.user.username, viewerIsAdmin: a.user.role === 'admin', limit: 300 }),
  ]);
  const byId = new Map((tools || []).map((t: any) => [t.id, t]));
  const admins = new Set((userState.users || []).filter((u: any) => u.role === 'admin').map((u: any) => u.username));

  const posts = (entries || []).map((e: any) => {
    const t: any = byId.get(e.toolId);
    if (!t) return null;                                   // orphan / not visible to this viewer
    if (t.visibility === 'private' && t.owner !== a.user.username && a.user.role !== 'admin') return null;
    const subject = t.definition?.lesson?.subject || '';
    const label = String(e.data?.title
      || [subject, e.data?.level || e.data?.difficulty, e.data?.topic].filter(Boolean).join(' · ')
      || 'Activity').slice(0, 90);
    return {
      entryId: e.id, toolSlug: t.slug, toolTitle: t.title, archetype: t.archetype,
      username: e.username || 'anon', byAdmin: admins.has(e.username),
      label, subtitle: String(e.data?.subtitle || e.data?.why || '').slice(0, 120),
      thumbnail: e.data?.thumbnail || '', category: e.data?.category || '',
      score: typeof e.data?.score === 'number' ? e.data.score : undefined,
      createdAt: e.createdAt || null,
    };
  }).filter(Boolean).slice(0, limit);

  return NextResponse.json({ posts }, { headers: { 'Cache-Control': 'no-cache' } });
}
