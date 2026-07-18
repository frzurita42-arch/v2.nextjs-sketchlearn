import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { userState, loadUsers } from '@/src/db/users';
import { readGames } from '@/src/db/games';
import { db } from '@/src/db/pool';
import { optionalAuth, requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getUserPrefs, setUserPref } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// The public "Active moderators" directory. Anyone (even a guest) may READ it; the
// moderator themselves or an admin may EDIT a profile. Profiles are stored per user
// in user_prefs under the "moderatorProfile" key.
const PROFILE_KEY = 'moderatorProfile';

async function freshUsers() {
  if (db.pool) { try { userState.users = await loadUsers(); } catch { /* keep memory */ } }
  return userState.users;
}

type Profile = { title?: string; subtitle?: string; interests?: string; whatsapp?: string; age?: number; image?: string };

function cleanProfile(raw: any): Profile {
  const s = (v: any, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const age = Number(raw?.age);
  const rawImage = String(raw?.image || '').slice(0, 2_000_000);
  const image = (/^https?:\/\//i.test(rawImage) || /^data:image\//i.test(rawImage)) ? rawImage : '';
  return {
    title: s(raw?.title, 80),
    subtitle: s(raw?.subtitle, 120),
    interests: s(raw?.interests, 300),
    whatsapp: s(raw?.whatsapp, 120),
    age: Number.isFinite(age) && age > 0 && age < 130 ? Math.round(age) : undefined,
    image,
  };
}

// GET -> { moderators: [{ username, role, createdAt, profile }] }
export async function GET(req: Request) {
  await optionalAuth(req); // public, but resolve any token harmlessly
  const users = await freshUsers();
  const mods = (users as any[]).filter((u) => u.role === 'moderator' || u.role === 'admin');
  const games = await readGames();
  const out = await Promise.all(mods.map(async (u: any) => {
    let profile: Profile = {};
    try { profile = cleanProfile((await getUserPrefs(u.username))?.[PROFILE_KEY] || {}); } catch { /* none */ }
    return {
      username: u.username,
      role: u.role,
      createdAt: u.createdAt || null,
      gamesPlayed: games.filter((g: any) => g.username === u.username).length,
      profile,
    };
  }));
  // Admins after moderators isn't important; sort by name for a stable directory.
  out.sort((a, b) => String(a.username).localeCompare(String(b.username)));
  return NextResponse.json({ moderators: out }, { headers: { 'Cache-Control': 'no-cache' } });
}

// PUT { username, profile } -> save a moderator's card. Owner or admin only.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const username = String(b.username || '').trim();
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });
  if (!(a.user.role === 'admin' || a.user.username === username)) {
    return NextResponse.json({ error: 'Only the moderator or an admin can edit this card.' }, { status: 403 });
  }
  const users = await freshUsers();
  const target = (users as any[]).find((u) => u.username === username);
  if (!target || !(target.role === 'moderator' || target.role === 'admin')) {
    return NextResponse.json({ error: 'Not a moderator.' }, { status: 404 });
  }
  const profile = cleanProfile(b.profile || {});
  try { await setUserPref(username, PROFILE_KEY, profile); } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, profile });
}
