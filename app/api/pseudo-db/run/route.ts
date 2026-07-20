import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import path from 'path';
import { spawn } from 'child_process';
import { requireAuth } from '@/lib/auth-guard';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ROOT_DIR } = require('@/src/config');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/pseudo-db/run { action: 'pull' | 'push' | 'push-replace' }
// Starts a background sync job and returns immediately.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can run pseudo-db sync.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action || '').trim();
  if (!['pull', 'push', 'push-replace'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action. Use pull, push, or push-replace.' }, { status: 400 });
  }

  const syncScript = path.join(ROOT_DIR, 'scripts', 'pseudo-db-sync.cjs');
  const args = [syncScript, action === 'pull' ? 'pull' : 'push'];
  if (action === 'push-replace') args.push('--replace');

  try {
    const child = spawn(process.execPath, args, {
      cwd: ROOT_DIR,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
    return NextResponse.json({ ok: true, started: action });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not start sync job.' }, { status: 500 });
  }
}
