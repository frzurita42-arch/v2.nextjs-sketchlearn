import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

// POST { text, kind } -> { text }
// A tiny "tap-mixer" for the gallery's page copy (title / subtitle): a small
// distortion — the same meaning, slightly reworded — in the platform's warm
// voice, adhering to its values (productivity, cohesion, engagement). ADMIN only.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit page copy.' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) || {};
  const text = String(b.text || '').slice(0, 240);
  const kind = b.kind === 'title' ? 'title' : 'subtitle';
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json({ error: 'No AI model is configured.' }, { status: 200 });

  const system = [
    'You are the warm curator of SketchLearn — a community platform where people publish AI-built tools (lesson/slide generators, repositories of links, AI games, to-do lists, payment monitors, and more).',
    `Reword this page ${kind} so it means the SAME thing but is phrased a little differently — a small, gentle distortion, like ripples after you touch water. Keep it natural and short; subtly reflect the values positivity, cohesion, productivity, and community engagement when it fits.`,
    kind === 'title' ? 'Keep it a short heading (≤ ~5 words).' : 'Keep it one short inviting sentence.',
    'Return STRICT JSON: { "text": "the reworded copy" }.',
  ].join('\n');

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: `Current ${kind}: "${text}"` }],
      { temperature: 0.85, maxTokens: 80 });
    const out = String(r?.text || '').replace(/^["']|["']$/g, '').slice(0, 200);
    return NextResponse.json({ text: out || text });
  } catch {
    return NextResponse.json({ error: 'Could not remix — try again.' }, { status: 200 });
  }
}
