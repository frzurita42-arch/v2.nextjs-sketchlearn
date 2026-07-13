import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, updateTool, setExampleOverride } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST { slug, title?, description? } -> rename / re-describe a tool.
// OWNER or ADMIN only; examples are locked. Either field may be provided.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  const hasTitle = typeof b.title === 'string';
  const hasDesc = typeof b.description === 'string';
  const title = String(b.title || '').trim().slice(0, 100);
  const description = String(b.description || '').trim().slice(0, 400);
  if (!slug || (!hasTitle && !hasDesc)) return NextResponse.json({ error: 'slug and title or description are required' }, { status: 400 });
  if (hasTitle && !title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
  // Built-in examples are virtual: an ADMIN may curate them (saved as overrides).
  const ex = exampleBySlug(slug);
  const tool = ex || await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ex) {
    if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit an example.' }, { status: 403 });
  } else if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can edit this tool.' }, { status: 403 });
  }
  const patch: any = {};
  if (hasTitle) patch.title = title;
  if (hasDesc) patch.description = description;
  await (ex ? setExampleOverride(slug, patch) : updateTool(slug, patch));
  return NextResponse.json({ ok: true, title: hasTitle ? title : tool.title, description: hasDesc ? description : tool.description });
}
