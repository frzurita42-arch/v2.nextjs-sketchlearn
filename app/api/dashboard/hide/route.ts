import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSiteSettings, setSiteSetting } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/dashboard/hide { rowKey, unhide? } -> soft-delete (or restore) one
// dashboard table row. rowKey is "table:id". Persisted in site_settings so it
// sticks across reloads; the dashboard filters every table by this set. Admin only.
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const rowKey = String(b.rowKey || '').slice(0, 200);
  if (!rowKey) return NextResponse.json({ error: 'rowKey required' }, { status: 400 });
  const settings = await getSiteSettings();
  const cur: string[] = Array.isArray(settings?.dashHiddenRows) ? settings.dashHiddenRows : [];
  const set = new Set(cur);
  if (b.unhide) set.delete(rowKey); else set.add(rowKey);
  const next = Array.from(set).slice(-5000);
  const ok = await setSiteSetting('dashHiddenRows', next);
  if (!ok) return NextResponse.json({ ok: false, error: 'Could not save (check /api/health).' }, { status: 200 });
  return NextResponse.json({ ok: true, hiddenRows: next });
}
