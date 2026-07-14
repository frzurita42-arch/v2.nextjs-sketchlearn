import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { insertComment, listComments, getComment, updateComment, deleteComment } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED = ['post', 'tool'];

// Keep attachment links safe + small: http(s)/relative URLs, capped, coloured
// blue (clip) or green (folder) exactly like the repo cards.
function cleanLinks(raw: any): { label: string; url: string; color?: 'green' }[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((l: any) => {
    let url = String(l?.url || '').trim();
    if (url && !/^https?:\/\//i.test(url) && !url.startsWith('/')) url = 'https://' + url;
    const link: { label: string; url: string; color?: 'green' } = { label: String(l?.label || 'Link').slice(0, 30), url };
    if (l?.color === 'green') link.color = 'green';
    return link;
  }).filter((l) => /^https?:\/\//i.test(l.url) || l.url.startsWith('/'));
}

// GET /api/comments?targetType=post&targetId=... -> all comments (a flat list;
// the client threads them by parentId).
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const targetType = String(url.searchParams.get('targetType') || '');
  const targetId = String(url.searchParams.get('targetId') || '');
  if (!ALLOWED.includes(targetType) || !targetId) return NextResponse.json({ comments: [] });
  const comments = await listComments(targetType, targetId, { limit: 400 });
  return NextResponse.json({ comments }, { headers: { 'Cache-Control': 'no-cache' } });
}

// POST { targetType, targetId, body, parentId?, links? } -> add a comment/reply.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const targetType = String(b.targetType || '');
  const targetId = String(b.targetId || '');
  const body = String(b.body || '').trim().slice(0, 1000);
  const links = cleanLinks(b.links);
  if (!ALLOWED.includes(targetType) || !targetId || (!body && !links.length)) {
    return NextResponse.json({ error: 'Missing target or body.' }, { status: 400 });
  }
  // A reply must point at a real comment on the same target.
  let parentId: string | null = null;
  if (b.parentId) {
    const parent = await getComment(String(b.parentId));
    if (parent && parent.targetType === targetType && parent.targetId === targetId) parentId = parent.id;
  }
  const record = {
    id: `c-${crypto.randomUUID().slice(0, 12)}`,
    targetType, targetId, author: a.user.username, body,
    parentId, links, likedBy: [], aiGenerated: false, createdAt: new Date().toISOString(),
  };
  await insertComment(record);
  return NextResponse.json({ comment: record });
}

// PUT { id, action } -> like (toggle, anyone) / addLink / removeLink (author or
// admin). Returns the updated comment.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const id = String(b.id || '');
  const action = String(b.action || '');
  const c = id ? await getComment(id) : null;
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const isOwnerAdmin = a.user.role === 'admin' || c.author === a.user.username;

  if (action === 'like') {
    const likedBy: string[] = Array.isArray(c.likedBy) ? c.likedBy : [];
    const has = likedBy.includes(a.user.username);
    const next = has ? likedBy.filter((u: string) => u !== a.user.username) : [...likedBy, a.user.username];
    const updated = await updateComment(id, { likedBy: next });
    return NextResponse.json({ comment: updated });
  }
  if (action === 'addLink' || action === 'removeLink') {
    if (!isOwnerAdmin) return NextResponse.json({ error: 'Only the author or an admin can change attachments.' }, { status: 403 });
    const links = Array.isArray(c.links) ? [...c.links] : [];
    if (action === 'addLink') {
      const [nl] = cleanLinks([b.link]);
      if (nl) links.push(nl);
    } else {
      const green = b.color === 'green';
      for (let i = links.length - 1; i >= 0; i--) { if (((links[i] as any).color === 'green') === green) { links.splice(i, 1); break; } }
    }
    const updated = await updateComment(id, { links });
    return NextResponse.json({ comment: updated });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

// DELETE { id } -> remove a comment and its replies (author or admin).
export async function DELETE(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const id = String(b.id || '');
  const c = id ? await getComment(id) : null;
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(a.user.role === 'admin' || c.author === a.user.username)) {
    return NextResponse.json({ error: 'Only the author or an admin can delete this comment.' }, { status: 403 });
  }
  await deleteComment(id);
  return NextResponse.json({ ok: true });
}
