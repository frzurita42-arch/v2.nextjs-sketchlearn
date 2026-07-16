import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listRecentEntries, listTools } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tools/recent-lessons -> recent lessons GENERATED across the platform
// (entries on lesson-archetype tools), each enriched with its parent tool so a
// front-page card can open the tool and play that rendition. Only public tools'
// visible (active/approved) entries are surfaced.
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const viewerIsAdmin = a.user.role === 'admin';

  // Public tools only (plus what the viewer can see); build an id→tool map.
  let tools: any[] = [];
  try { tools = await listTools({ viewer: a.user.username, viewerIsAdmin, limit: 300 }); } catch { tools = []; }
  const byId = new Map<string, any>();
  for (const t of tools) byId.set(t.id, t);

  const entries = await listRecentEntries({ limit: 80 });
  const lessons: any[] = [];
  for (const e of entries) {
    if (e.status && e.status !== 'active' && e.status !== 'approved') continue;
    const tool = byId.get(e.toolId) || exampleBySlug(e.toolId);
    if (!tool) continue;                                   // private/unknown parent → skip
    const archetype = tool.archetype || tool.definition?.archetype;
    if (archetype !== 'lesson') continue;                  // only surface lessons
    const d = e.data || {};
    lessons.push({
      id: e.id,
      toolSlug: tool.slug,
      toolTitle: tool.title || tool.definition?.title || 'Lesson',
      subject: tool.definition?.lesson?.subject || '',
      subjectKind: tool.definition?.lesson?.subjectKind || '',
      tags: tool.tags || tool.definition?.tags || [],
      title: d.title || '',
      subtitle: d.subtitle || d.why || '',
      topic: d.topic || '',
      level: d.level || d.difficulty || '',
      thumbnail: d.thumbnail || null,
      username: e.username || 'anon',
      createdAt: e.createdAt,
      config: d,
    });
    if (lessons.length >= 24) break;
  }
  return NextResponse.json({ lessons }, { headers: { 'Cache-Control': 'no-cache' } });
}
