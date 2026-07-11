import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertPost } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST { kind?, title?, body, image? } -> create a real feed post as the current user.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const bodyText = String(b.body || '').trim().slice(0, 2000);
  if (!bodyText) return NextResponse.json({ error: 'A post needs some text.' }, { status: 400 });
  const record = {
    id: `post-${crypto.randomUUID().slice(0, 12)}`,
    author: a.user.username,
    kind: b.image ? 'image' : 'text',
    title: String(b.title || '').trim().slice(0, 120) || null,
    body: bodyText,
    image: typeof b.image === 'string' && b.image.startsWith('data:') ? b.image.slice(0, 500000) : null,
    likeCount: 0,
    aiGenerated: false,
    createdAt: new Date().toISOString(),
  };
  await insertPost(record);
  return NextResponse.json({ post: record });
}
