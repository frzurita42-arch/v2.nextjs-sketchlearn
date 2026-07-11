import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, insertEntry, listEntries, setEntryStatus } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tools/entries?slug=xyz -> entries for an app tool.
// Non-owners only see 'active'/'approved'; the owner sees everything (incl. pending).
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const slug = new URL(req.url).searchParams.get('slug') || '';
  const tool = await getToolBySlug(slug);
  if (!tool || !['app', 'lesson'].includes(tool.archetype)) return NextResponse.json({ entries: [] });
  const all = await listEntries(tool.id, { limit: 300 });
  const isOwner = tool.owner === a.user.username;
  const entries = isOwner ? all : all.filter((e: any) => e.status === 'active' || e.status === 'approved');
  return NextResponse.json({ entries, isOwner, review: !!tool.definition?.app?.review }, { headers: { 'Cache-Control': 'no-cache' } });
}

// POST /api/tools/entries { slug, data } -> add an entry (pending if the tool uses review).
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const tool = await getToolBySlug(String(b.slug || ''));
  if (!tool || !['app', 'lesson'].includes(tool.archetype)) return NextResponse.json({ error: 'Not an app or lesson tool' }, { status: 400 });
  const data = (b.data && typeof b.data === 'object') ? b.data : {};
  // Guard against oversized payloads (e.g. a huge embedded image data URL).
  if (JSON.stringify(data).length > 2_200_000) {
    return NextResponse.json({ error: 'Entry too large — use a smaller image.' }, { status: 413 });
  }
  const record = {
    id: `e-${crypto.randomUUID().slice(0, 12)}`,
    toolId: tool.id,
    username: a.user.username,
    status: tool.definition?.app?.review ? 'pending' : 'active',
    data,
    createdAt: new Date().toISOString(),
  };
  await insertEntry(record);
  return NextResponse.json({ entry: record });
}

// PUT /api/tools/entries { slug, entryId, status } -> owner approves/rejects.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const tool = await getToolBySlug(String(b.slug || ''));
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tool.owner !== a.user.username) return NextResponse.json({ error: 'Only the owner can moderate entries' }, { status: 403 });
  const status = ['active', 'approved', 'rejected', 'pending'].includes(b.status) ? b.status : 'approved';
  const okUpd = await setEntryStatus(String(b.entryId || ''), status);
  return NextResponse.json({ ok: okUpd });
}
