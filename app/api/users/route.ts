import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { userState, makeUser, persistUsers, loadUsers } from '@/src/db/users';
import { readGames } from '@/src/db/games';
import { db } from '@/src/db/pool';
import { requireAdmin } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Always sync the in-memory user list from the DB before reading/mutating it, so
// a different serverless instance's stale copy can't hide a just-added user or
// clobber others on the next persist (persistUsers replaces the whole table).
async function freshUsers() {
  if (db.pool) { try { userState.users = await loadUsers(); } catch { /* keep memory */ } }
  return userState.users;
}

export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const users = await freshUsers();
  const games = await readGames();
  return NextResponse.json(users.map((u: any) => ({
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
    gamesPlayed: games.filter((g: any) => g.username === u.username).length,
  })));
}

export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const { username, password, role } = (await req.json().catch(() => ({}))) || {};
  if (!username || !password) return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
  const uname = String(username).trim();
  const users = await freshUsers();
  if (users.some((u: any) => u.username === uname)) return NextResponse.json({ error: 'User already exists' }, { status: 409 });
  const safeRole = role === 'admin' ? 'admin' : role === 'moderator' ? 'moderator' : 'user';
  users.push(makeUser(uname, password, safeRole));   // password is hashed by makeUser (scrypt)
  await persistUsers(users);
  // A new moderator is created WITH a starter wallet so their creator buttons work
  // right away (a moderator with 0 tokens would make no sense). They fall back to a
  // plain user if they later spend into the negative.
  if (safeRole === 'moderator') {
    try { const { addUserTokens } = require('@/src/db/platform'); await addUserTokens(uname, 500); } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true });
}
