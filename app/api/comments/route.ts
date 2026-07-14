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
// blue (POSTER — author's) or green (USER — a viewer's own upload). `by` records
// the uploader of a User link so only they (or an admin) can later remove it.
type CLink = { label: string; url: string; color?: 'green'; by?: string };
function cleanLinks(raw: any): CLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((l: any) => {
    let url = String(l?.url || '').trim();
    if (url && !/^https?:\/\//i.test(url) && !url.startsWith('/')) url = 'https://' + url;
    const link: CLink = { label: String(l?.label || 'Link').slice(0, 30), url };
    if (l?.color === 'green') link.color = 'green';
    if (l?.by) link.by = String(l.by).slice(0, 40);
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

// PUT { id, action } -> like (toggle, anyone) / addLink / removeLink. POSTER
// (blue) attachments belong to the comment's author — only they or an admin
// add/remove them. USER (green) attachments are uploaded by any signed-in
// viewer; the uploader (by) or an admin may remove one, but the author (like an
// OP) may NOT remove another user's upload. Returns the updated comment.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const id = String(b.id || '');
  const action = String(b.action || '');
  const c = id ? await getComment(id) : null;
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const me = a.user.username;
  const isAdmin = a.user.role === 'admin';
  const isAuthorAdmin = isAdmin || c.author === me;

  if (action === 'like') {
    const likedBy: string[] = Array.isArray(c.likedBy) ? c.likedBy : [];
    const has = likedBy.includes(me);
    const next = has ? likedBy.filter((u: string) => u !== me) : [...likedBy, me];
    const updated = await updateComment(id, { likedBy: next });
    return NextResponse.json({ comment: updated });
  }
  if (action === 'addLink') {
    const color: 'blue' | 'green' = b.color === 'green' ? 'green' : 'blue';
    // Only the author/admin post (blue); any signed-in viewer uploads a User (green).
    if (color === 'blue' && !isAuthorAdmin) return NextResponse.json({ error: 'Only the author or an admin can post an attachment.' }, { status: 403 });
    const links = Array.isArray(c.links) ? [...c.links] : [];
    const [nl] = cleanLinks([{ ...(b.link || {}), color: color === 'green' ? 'green' : undefined, by: color === 'green' ? me : undefined }]);
    if (nl) links.push(nl);
    const updated = await updateComment(id, { links });
    return NextResponse.json({ comment: updated });
  }
  if (action === 'removeLink') {
    const links = Array.isArray(c.links) ? [...c.links] : [];
    const index = Number.isInteger(b.index) ? b.index : -1;
    const target = index >= 0 && index < links.length ? (links[index] as any) : null;
    if (!target) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
    const canRemove = target.color === 'green' ? (target.by === me || isAdmin) : isAuthorAdmin;
    if (!canRemove) return NextResponse.json({ error: 'You are not allowed to remove that attachment.' }, { status: 403 });
    links.splice(index, 1);
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
