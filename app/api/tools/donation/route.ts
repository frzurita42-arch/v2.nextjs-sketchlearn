import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDonation, setDonation, getToolBySlug } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// The Bitcoin wallet + collapse state for a tool's donation cup. The owner (OP)
// or an admin may edit it; anyone signed in may read it.

async function ownerOf(slug: string): Promise<string | null> {
  const t = await getToolBySlug(slug);
  if (t) return t.owner || null;
  const ex = exampleBySlug(slug);
  return ex ? (ex.owner || null) : null;
}

// GET /api/tools/donation?slug= -> { address, collapsed }
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const slug = new URL(req.url).searchParams.get('slug') || '';
  const d = await getDonation(slug);
  return NextResponse.json({ address: d.address || '', collapsed: !!d.collapsed }, { headers: { 'Cache-Control': 'no-cache' } });
}

// PUT /api/tools/donation { slug, address?, collapsed? } -> save. OWNER or ADMIN.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  const owner = await ownerOf(slug);
  const isAdmin = a.user.role === 'admin';
  const isOwner = !!owner && a.user.username === owner;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: 'Only the creator (OP) or an admin can edit this.' }, { status: 403 });
  const patch: Record<string, unknown> = {};
  if (b.address !== undefined) patch.address = String(b.address || '').slice(0, 120);
  if (b.collapsed !== undefined) patch.collapsed = !!b.collapsed;
  const next = await setDonation(slug, patch);
  return NextResponse.json({ ok: true, address: next.address || '', collapsed: !!next.collapsed });
}
