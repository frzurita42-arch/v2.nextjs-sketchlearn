import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserPrefs, setUserPref } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET  /api/prefs            -> { prefs } for the signed-in user
// PUT  /api/prefs { key, value } -> save one preference for the signed-in user
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const prefs = await getUserPrefs(a.user.username);
  return NextResponse.json({ prefs }, { headers: { 'Cache-Control': 'no-cache' } });
}

export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const key = String(b.key || '').slice(0, 60);
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 });
  // Values are small (a sort mode, a toggle…) — cap to avoid abuse.
  const value = typeof b.value === 'string' ? b.value.slice(0, 200) : b.value;
  await setUserPref(a.user.username, key, value);
  return NextResponse.json({ ok: true, key, value });
}
