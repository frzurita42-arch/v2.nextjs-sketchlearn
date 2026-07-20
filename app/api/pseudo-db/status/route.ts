import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '@/lib/auth-guard';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ROOT_DIR } = require('@/src/config');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/pseudo-db/status -> last local pseudo-db sync status (admin only)
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can view pseudo-db status.' }, { status: 403 });
  }

  const filePath = path.join(ROOT_DIR, 'data', 'pseudo_db_sync_status.json');
  let status: any = null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    status = JSON.parse(raw);
  } catch {
    status = null;
  }

  return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-cache' } });
}
