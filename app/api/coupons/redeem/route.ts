import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { redeemCoupon, addUserTokens } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userState, loadUsers, persistUsers } = require('@/src/db/users');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db } = require('@/src/db/pool');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/coupons/redeem (any signed-in user) -> { code }. Credits the user's
// wallet once, then (like buying tokens) promotes a plain user to moderator when
// their balance ends up positive.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const code = String(b.code || '').trim().toUpperCase();

  const r = await redeemCoupon(code, a.user.username);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  const balance = await addUserTokens(a.user.username, r.credits);
  let promoted = false;
  if (balance > 0) {
    try {
      if (db.pool) { try { userState.users = await loadUsers(); } catch { /* keep memory */ } }
      const users: any[] = userState.users;
      const i = users.findIndex((u: any) => u.username === a.user.username);
      if (i >= 0 && users[i].role === 'user') { users[i] = { ...users[i], role: 'moderator' }; await persistUsers(users); promoted = true; }
    } catch { /* credited regardless */ }
  }
  return NextResponse.json({ ok: true, credits: r.credits, balance, promoted });
}
