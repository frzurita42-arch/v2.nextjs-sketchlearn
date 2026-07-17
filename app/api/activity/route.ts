import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { logActivity, listActivity } = require('@/src/db/activity');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/activity { action, target, detail } -> record one activity event.
// Any signed-in user may log their own actions (navigation, preset changes).
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const action = String(b.action || '').slice(0, 40);
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });
  await logActivity({
    username: a.user.username,
    action,
    target: String(b.target || '').slice(0, 120),
    detail: (b.detail && typeof b.detail === 'object') ? b.detail : {},
  });
  return NextResponse.json({ ok: true });
}

// GET /api/activity -> recent activity (admin only; it's a cross-user audit trail).
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const limit = parseInt(new URL(req.url).searchParams.get('limit') || '300', 10) || 300;
  const items = await listActivity({ limit });
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-cache' } });
}
