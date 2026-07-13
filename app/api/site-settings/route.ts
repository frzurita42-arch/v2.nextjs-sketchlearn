import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSiteSettings, setSiteSetting } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Which page-copy keys admins may edit (allow-list keeps this from becoming a
// free-form store). Values are short strings.
const KEYS = ['galleryTitle', 'gallerySubtitle', 'galleryFilter', 'toolsShelfTitle', 'picksShelfTitle'];

// GET /api/site-settings -> the editable page copy (any signed-in viewer reads it).
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const all = await getSiteSettings();
  const out: Record<string, string> = {};
  for (const k of KEYS) if (typeof all?.[k] === 'string') out[k] = all[k];
  return NextResponse.json({ settings: out }, { headers: { 'Cache-Control': 'no-cache' } });
}

// PUT /api/site-settings { key, value } -> save one page-copy string. ADMIN only.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit page copy.' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) || {};
  const key = String(b.key || '');
  if (!KEYS.includes(key)) return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 });
  const value = String(b.value ?? '').slice(0, 240);
  await setSiteSetting(key, value);
  return NextResponse.json({ ok: true, key, value });
}
