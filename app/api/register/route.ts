import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { AUTH_TOKEN_TTL_SEC } from '@/src/config';
import { db } from '@/src/db/pool';
import { userState, makeUser, persistUsers, loadUsers } from '@/src/db/users';
import { signAuthToken } from '@/src/auth';
import { ensureReady } from '@/lib/bootstrap';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setUserPref } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/register -> create a plain 'user' account and sign them in. Beyond the
// username/password we also collect an email, date of birth and country (stored in
// the user's profile prefs). Auto-logs-in on success (returns a token).
export async function POST(req: Request) {
  await ensureReady();
  const body = (await req.json().catch(() => ({}))) || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const email = String(body.email || '').trim();
  const dob = String(body.dob || '').trim();
  const country = String(body.country || '').trim();

  // Required: email, username, password. Date of birth and country are optional.
  if (!username || !password) return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  if (username.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
  if (password.length < 6 || password.length > 15) return NextResponse.json({ error: 'Password must be between 6 and 15 characters.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  // Only validate a date of birth if one was given (it's optional).
  if (dob) { const dobDate = new Date(dob); if (isNaN(dobDate.getTime()) || dobDate.getTime() > Date.now()) return NextResponse.json({ error: 'Enter a valid date of birth.' }, { status: 400 }); }

  // Sync fresh so a concurrent instance's stale list can't miss an existing name or
  // drop other users on persist.
  if (db.pool) { try { userState.users = await loadUsers(); } catch { /* keep memory */ } }
  if (userState.users.some((u: any) => u.username === username)) {
    return NextResponse.json({ error: 'That username is taken.' }, { status: 409 });
  }

  const user = makeUser(username, password, 'user');   // password hashed (scrypt) by makeUser
  userState.users.push(user);
  await persistUsers(userState.users);
  // Profile details live in the user's prefs (kept out of the auth table).
  try { await setUserPref(username, 'profile', { email, dob, country, registeredAt: new Date().toISOString() }); } catch { /* non-fatal */ }

  const now = Math.floor(Date.now() / 1000);
  const token = signAuthToken({ u: username, iat: now, exp: now + AUTH_TOKEN_TTL_SEC, v: 1 });
  return NextResponse.json({ token, username, role: 'user' });
}
