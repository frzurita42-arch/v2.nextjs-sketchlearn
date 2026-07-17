import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { dbEnabled } from '@/src/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { db, dbQuery } = require('@/src/db/pool');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSiteSettings, setSiteSetting } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/health -> the TRUTH about storage. `dbConfigured` only means a
// DATABASE_URL is set; `dbLive` means a real query actually succeeded. When
// dbLive is false the app is running on ephemeral per-instance file storage, so
// edits (titles, page text…) silently revert — this endpoint is how we SEE that.
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const out: { dbConfigured: boolean; poolPresent: boolean; dbLive: boolean; canWrite: boolean; error: string } = {
    dbConfigured: !!dbEnabled, poolPresent: !!db.pool, dbLive: false, canWrite: false, error: '',
  };
  try {
    if (!db.pool) { out.error = 'No live pool — DATABASE_URL is unset or was unreachable at boot, so the app is on file storage.'; return NextResponse.json(out, { headers: { 'Cache-Control': 'no-cache' } }); }
    await dbQuery('SELECT 1');
    out.dbLive = true;
    // Prove a write actually persists to the shared store (round-trips through DB).
    const token = `probe-${Date.now()}`;
    await setSiteSetting('__healthProbe__', token);
    const back = (await getSiteSettings())['__healthProbe__'];
    out.canWrite = String(back) === token;
    if (!out.canWrite) out.error = 'Wrote a value but read a different one back — writes are not landing in the shared database.';
  } catch (e: any) {
    out.error = `Database query failed: ${e?.message || e}`;
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-cache' } });
}
