import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, updateTool } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST { slug, title } -> rename a tool. OWNER or ADMIN only; examples are locked.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  const title = String(b.title || '').trim().slice(0, 100);
  if (!slug || !title) return NextResponse.json({ error: 'slug and title are required' }, { status: 400 });
  const tool = await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((tool.tags || []).includes('example')) return NextResponse.json({ error: 'Example tools cannot be renamed.' }, { status: 400 });
  if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can rename this tool.' }, { status: 403 });
  }
  await updateTool(slug, { title });
  return NextResponse.json({ ok: true, title });
}
