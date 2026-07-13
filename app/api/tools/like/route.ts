import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setToolLikeDelta } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST { slug, liked } -> bump the tool's like counter (+1 when liking, -1 when
// un-liking). The client tracks its own liked state in localStorage; this just
// keeps the visible count. Returns the new count.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  const count = await setToolLikeDelta(slug, b.liked ? 1 : -1, a.user.username);
  return NextResponse.json({ likeCount: count });
}
