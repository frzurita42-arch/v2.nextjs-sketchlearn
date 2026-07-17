import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { userState, persistUsers, loadUsers } from '@/src/db/users';
import { db } from '@/src/db/pool';
import { requireAdmin } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const { username } = await params;
  if (username === a.user.username) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
  // Sync from the DB first so the whole-table persist can't drop other users.
  if (db.pool) { try { userState.users = await loadUsers(); } catch { /* keep memory */ } }
  const before = userState.users.length;
  userState.users = userState.users.filter((u: any) => u.username !== username);
  if (userState.users.length === before) return NextResponse.json({ error: 'No such user' }, { status: 404 });
  await persistUsers(userState.users);
  return NextResponse.json({ ok: true });
}
