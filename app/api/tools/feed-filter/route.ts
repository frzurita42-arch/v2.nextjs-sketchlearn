import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, updateTool } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FILTERS = ['all', 'fav', 'admin', 'owner'];

// POST { slug, filter } -> record this tool page's default feed filter (the
// mutually-exclusive All / My favorites / Liked by admin / OP favorited choice).
// OWNER or ADMIN only; everyone else sees this as the initial state but their own
// changes are session-only (reset on refresh). Stored on the tool definition.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  const filter = String(b.filter || 'all');
  if (!FILTERS.includes(filter)) return NextResponse.json({ error: 'Unknown filter.' }, { status: 400 });
  const tool = await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((tool.tags || []).includes('example')) return NextResponse.json({ error: 'Example tools cannot be edited.' }, { status: 400 });
  if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can set the default filter.' }, { status: 403 });
  }
  const definition = { ...(tool.definition || {}), feedFilter: filter };
  await updateTool(slug, { definition });
  return NextResponse.json({ ok: true, filter });
}
