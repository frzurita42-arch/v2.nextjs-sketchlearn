import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserTokens, addUserTokens, listUserTokens } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listUsage } = require('@/src/db/usage');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadUsers, persistUsers } = require('@/src/db/users');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Last `n` calendar months as 'YYYY-MM', oldest first.
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
const monthOf = (iso: any) => { const d = new Date(iso || 0); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// Roll usage rows up into { [month]: {tokens, cost} }, optionally for one user.
function byMonth(rows: any[], user?: string) {
  const acc: Record<string, { tokens: number; cost: number }> = {};
  for (const u of rows) {
    if (user && u.username !== user) continue;
    const m = monthOf(u.createdAt); if (!m) continue;
    if (!acc[m]) acc[m] = { tokens: 0, cost: 0 };
    acc[m].tokens += Number(u.totalTokens) || 0;
    acc[m].cost += Number(u.costUsd) || 0;
  }
  return acc;
}

// GET /api/tokens -> the signed-in user's token window (balance + used-per-month),
// plus, for admins, every user's balance/role and the whole platform's monthly
// usage & spend.
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const me = a.user.username;
  const role = a.user.role;
  const isAdmin = role === 'admin';

  const months = lastMonths(6);
  const usage: any[] = await listUsage({ limit: 2000 });
  const balance = await getUserTokens(me);

  // My used-tokens per month, and my available balance shown against them.
  const mine = byMonth(usage, me);
  const myMonthly = months.map((m) => ({ month: m, used: Math.round(mine[m]?.tokens || 0) }));
  // Raw usage events (timestamp + tokens + cost) so the client can bucket the
  // history into minutes / hours / days / weeks / months, finance-app style.
  const myEvents = usage
    .filter((u: any) => u.username === me)
    .map((u: any) => ({ t: u.createdAt, tokens: Math.round(Number(u.totalTokens) || 0), cost: Number(u.costUsd) || 0 }))
    .filter((e: any) => e.t);

  if (!isAdmin) {
    return NextResponse.json({ role, balance, months, myMonthly, myEvents });
  }

  // Admin extras: platform-wide monthly usage + spend, and every wallet + role.
  const all = byMonth(usage);
  const platformMonthly = months.map((m) => ({ month: m, used: Math.round(all[m]?.tokens || 0), cost: Number((all[m]?.cost || 0).toFixed(4)) }));
  const balances = await listUserTokens();
  const users: any[] = await loadUsers();
  const usedThisMonth = byMonth(usage);
  const thisMonth = months[months.length - 1];
  void usedThisMonth;
  const wallets = users.map((u: any) => ({
    username: u.username, role: u.role,
    balance: Number(balances[u.username]) || 0,
    usedThisMonth: Math.round(byMonth(usage, u.username)[thisMonth]?.tokens || 0),
  })).sort((x: any, y: any) => y.usedThisMonth - x.usedThisMonth);

  // Raw platform-wide usage events so the admin chart can use the same sliding
  // time-window as the personal one.
  const platformEvents = usage
    .map((u: any) => ({ t: u.createdAt, tokens: Math.round(Number(u.totalTokens) || 0), cost: Number(u.costUsd) || 0 }))
    .filter((e: any) => e.t);

  return NextResponse.json({ role, balance, months, myMonthly, myEvents, platformMonthly, platformEvents, wallets });
}

// POST /api/tokens (admin only) -> grant tokens to a user's wallet. Granting to a
// plain 'user' also promotes them to 'moderator' (their purchase unlocks the
// creator tools). { username, add } — `add` may be negative to deduct.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can grant tokens.' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) || {};
  const username = String(b.username || '').trim();
  const add = Math.trunc(Number(b.add) || 0);
  if (!username) return NextResponse.json({ error: 'Pick a user.' }, { status: 400 });

  const balance = await addUserTokens(username, add);

  // Promote a plain user to moderator once their wallet is actually POSITIVE
  // (their "purchase" unlocks the creator tools). Topping up a user who is still
  // in the red doesn't promote them until the debt is cleared. Never demote here.
  let promoted = false;
  if (add > 0 && balance > 0) {
    try {
      const users: any[] = await loadUsers();
      const idx = users.findIndex((u: any) => u.username === username);
      if (idx >= 0 && users[idx].role === 'user') { users[idx] = { ...users[idx], role: 'moderator' }; await persistUsers(users); promoted = true; }
    } catch { /* balance still granted */ }
  }
  return NextResponse.json({ ok: true, username, balance, promoted });
}
