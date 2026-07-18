import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { MODELS, mergePrices, type PriceTable } from '@/lib/model-registry';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSiteSettings, setSiteSetting } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchModelPricesOnline } = require('@/src/ai/providers');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 70;

// GET /api/dashboard/model-prices (admin) -> the model list + the current price
// table (saved DB prices merged over defaults).
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  let saved: any = null;
  try { const s = await getSiteSettings(); saved = s?.modelPrices || null; } catch { /* defaults */ }
  const prices: PriceTable = mergePrices(saved);
  return NextResponse.json({ models: MODELS, prices }, { headers: { 'Cache-Control': 'no-cache' } });
}

// POST /api/dashboard/model-prices (admin) -> refresh prices from the web (via
// OpenRouter web search), merge over defaults, save to the DB, and return them.
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const r = await fetchModelPricesOnline(MODELS);
  if (r?.error) return NextResponse.json({ error: r.error }, { status: 502 });
  const merged: PriceTable = mergePrices({ ...(r.data || {}), updatedAt: new Date().toISOString(), source: 'web' });
  try { await setSiteSetting('modelPrices', merged); } catch { /* still return the fetched prices */ }
  return NextResponse.json({ models: MODELS, prices: merged });
}
