import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

// POST { query, rows: [{ id, text }] } -> { ids: ["row-id", ...] }
// AI search for the dashboard's 🧱 Components registry table: the admin describes
// what they need in plain words and the AI returns the ids of the rows that
// genuinely match, so the table shows only those. ADMIN only.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can search the registry.' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) || {};
  const query = String(b.query || '').slice(0, 400).trim();
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 200)
    .map((r: any) => ({ id: String(r?.id || '').slice(0, 80), text: String(r?.text || '').slice(0, 800) }))
    .filter((r: { id: string; text: string }) => r.id && r.text);
  if (!query || !rows.length) return NextResponse.json({ error: 'query and rows required' }, { status: 400 });
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json({ error: 'No AI model is configured.' }, { status: 200 });

  const system = [
    'You filter a table of reusable UI components/containers for the SketchLearn admin dashboard.',
    'Given the admin\'s request and the table rows (id + text), decide which rows genuinely satisfy the request.',
    'Match on MEANING, not just keywords — e.g. "things I could reuse on new pages" should match reusable layout containers.',
    'If nothing matches, return an empty list rather than guessing.',
    'Return STRICT JSON: { "ids": ["row-id", ...] } using ONLY ids from the provided rows.',
  ].join('\n');
  const user = `Request: "${query}"\n\nRows:\n${rows.map((r: { id: string; text: string }) => `- ${r.id}: ${r.text}`).join('\n')}`;

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: 0, maxTokens: 500 });
    const valid = new Set(rows.map((x: { id: string }) => x.id));
    const ids = (Array.isArray(r?.ids) ? r.ids : []).map((x: any) => String(x)).filter((x: string) => valid.has(x));
    return NextResponse.json({ ids });
  } catch {
    return NextResponse.json({ error: 'AI search failed — try again.' }, { status: 200 });
  }
}
