import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateDummyPosts } = require('@/src/feed/seed');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { morphPost } = require('@/src/feed/morph');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listPosts, listTools } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const AVATAR_EMOJIS = ['🦊', '📊', '🐛', '🦉', '🤖', '⚙️', '🗣️', '🛡️', '🔧', '📈', '✏️', '☁️', '🎨', '🔐', '📝', '🌊'];
const AVATAR_COLORS = ['#f9a03f', '#5c80bc', '#7fb069', '#e4572e', '#9b5de5', '#00b4d8', '#f15bb5', '#2d6a4f'];
function avatarFor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { emoji: AVATAR_EMOJIS[h % AVATAR_EMOJIS.length], color: AVATAR_COLORS[(h >> 4) % AVATAR_COLORS.length] };
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// POST { seen: { [postId]: seenCount } } -> a shuffled, merged feed of dummy
// posts + real user posts + published tools, with the morph applied to any post
// the viewer has already seen. seen is a body (not a query) because it can be large.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const body = (await req.json().catch(() => ({}))) || {};
  const seen: Record<string, number> = (body && typeof body.seen === 'object' && body.seen) || {};

  const feed: any[] = generateDummyPosts(100);

  // Real user posts, mapped into the feed-post shape.
  try {
    const real = await listPosts({ limit: 100 });
    for (const p of real) {
      feed.push({
        id: p.id, kind: p.kind || 'text',
        author: { handle: p.author, name: p.author, avatar: avatarFor(p.author) },
        title: p.title || '', body: p.body, image: p.image || null, tool: null,
        likeCount: p.likeCount || 0, commentCount: 0, comments: [],
        aiGenerated: !!p.aiGenerated, createdAt: p.createdAt,
      });
    }
  } catch { /* feed still works with just dummy posts */ }

  // Published (public) tools surface in the feed as tool-publication posts.
  try {
    const tools = await listTools({ limit: 50 });
    for (const t of tools) {
      feed.push({
        id: `tool-${t.id}`, kind: 'tool',
        author: { handle: t.owner, name: t.owner, avatar: avatarFor(t.owner) },
        title: t.title || 'Untitled tool', body: t.description || '',
        image: t.thumbnail || null,
        // Enough of the definition for the client to categorise/filter the tool.
        tool: {
          title: t.title, tags: t.tags || [], slug: t.slug, archetype: t.archetype,
          lesson: t.definition?.lesson ? { activityTypes: t.definition.lesson.activityTypes || [], totalSlides: t.definition.lesson.totalSlides } : undefined,
          appDisplay: t.definition?.app?.display,
        },
        likeCount: t.likeCount || 0, commentCount: 0, comments: [],
        aiGenerated: !!t.aiGenerated, createdAt: t.updatedAt || t.createdAt,
      });
    }
  } catch { /* ignore */ }

  const withMorph = feed.map((p) => morphPost(p, seen[p.id] || 0));
  return NextResponse.json({ posts: shuffle(withMorph) }, { headers: { 'Cache-Control': 'no-cache' } });
}
