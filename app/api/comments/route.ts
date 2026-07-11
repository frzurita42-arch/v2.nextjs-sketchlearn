import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertComment, listComments } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED = ['post', 'tool'];

// GET /api/comments?targetType=post&targetId=... -> user-added comments for a target.
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const targetType = String(url.searchParams.get('targetType') || '');
  const targetId = String(url.searchParams.get('targetId') || '');
  if (!ALLOWED.includes(targetType) || !targetId) return NextResponse.json({ comments: [] });
  const comments = await listComments(targetType, targetId, { limit: 200 });
  return NextResponse.json({ comments }, { headers: { 'Cache-Control': 'no-cache' } });
}

// POST { targetType, targetId, body } -> add a comment as the current user.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const targetType = String(b.targetType || '');
  const targetId = String(b.targetId || '');
  const body = String(b.body || '').trim().slice(0, 1000);
  if (!ALLOWED.includes(targetType) || !targetId || !body) {
    return NextResponse.json({ error: 'Missing target or body.' }, { status: 400 });
  }
  const record = {
    id: `c-${crypto.randomUUID().slice(0, 12)}`,
    targetType, targetId, author: a.user.username, body,
    aiGenerated: false, createdAt: new Date().toISOString(),
  };
  await insertComment(record);
  return NextResponse.json({ comment: record });
}
