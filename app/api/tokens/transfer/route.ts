import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserTokens, addUserTokens } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadUsers, persistUsers } = require('@/src/db/users');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/tokens/transfer  { username, amount } -> a MODERATOR sends some of
// their own credits to another user. Unlike an admin grant, this is a real
// transfer: the amount is deducted from the sender and cannot overdraw them
// (you can only send what you have). The recipient must already exist. A plain
// user who ends up with a positive balance is promoted to moderator (their
// credits unlock the creator tools), matching the admin-grant rule.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'moderator' && a.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only a moderator can send tokens.' }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) || {};
  const target = String(b.username || '').trim();
  const amount = Math.trunc(Number(b.amount) || 0);
  if (!target) return NextResponse.json({ error: 'Enter a username.' }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: 'Enter an amount greater than zero.' }, { status: 400 });
  if (target === a.user.username) return NextResponse.json({ error: "You can't send tokens to yourself." }, { status: 400 });

  // The recipient must exist (fresh load so a concurrent instance can't miss them).
  const users: any[] = await loadUsers();
  const idx = users.findIndex((u: any) => u.username === target);
  if (idx < 0) return NextResponse.json({ error: `User "${target}" doesn't exist.` }, { status: 404 });

  // No overdraw: a moderator can only send what they currently hold. Admins are
  // effectively unlimited, but this route is really for moderators.
  if (a.user.role !== 'admin') {
    const bal = Number(await getUserTokens(a.user.username)) || 0;
    if (amount > bal) return NextResponse.json({ error: `You only have ${bal.toLocaleString()} credits to send.` }, { status: 400 });
    await addUserTokens(a.user.username, -amount);
  }

  const targetBalance = await addUserTokens(target, amount);
  // Promote a plain user to moderator once their wallet is positive.
  let promoted = false;
  if (targetBalance > 0 && users[idx].role === 'user') {
    users[idx] = { ...users[idx], role: 'moderator' };
    await persistUsers(users);
    promoted = true;
  }
  const senderBalance = a.user.role === 'admin' ? null : (Number(await getUserTokens(a.user.username)) || 0);
  return NextResponse.json({ ok: true, target, amount, targetBalance, senderBalance, promoted });
}
