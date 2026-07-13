import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

// POST { text, kind, instruction? } -> { text }
// A "tap-mixer" for the platform's editable copy — a page title / subtitle, or a
// section BANNER (a how-to note). With no instruction it gently rewords the same
// meaning (a small distortion); with an instruction it rewrites to follow that
// request. ADMIN only.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit page copy.' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) || {};
  const kind = b.kind === 'title' ? 'title' : b.kind === 'banner' ? 'banner' : 'subtitle';
  const cap = kind === 'banner' ? 600 : 240;
  const text = String(b.text || '').slice(0, cap);
  const instruction = String(b.instruction || '').slice(0, 400).trim();
  if (!text && !instruction) return NextResponse.json({ error: 'text required' }, { status: 400 });
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json({ error: 'No AI model is configured.' }, { status: 200 });

  const lenRule = kind === 'title' ? 'Keep it a short heading (≤ ~5 words).'
    : kind === 'banner' ? 'Keep it a short, friendly how-to note — 1 to 3 sentences. You may keep helpful emojis.'
    : 'Keep it one short inviting sentence.';
  const task = instruction
    ? `Write the ${kind} to follow this request from the admin: "${instruction}". Stay accurate to what the section does.`
    : `Reword this ${kind} so it means the SAME thing but is phrased a little differently — a small, gentle distortion, like ripples after you touch water.`;

  const system = [
    'You are the warm curator of SketchLearn — a community platform where people publish AI-built tools (lesson/slide generators, repositories of links, AI games, to-do lists, payment monitors, and more).',
    task,
    'Keep it natural; subtly reflect the values positivity, cohesion, productivity and community engagement when it fits.',
    lenRule,
    'Return STRICT JSON: { "text": "the copy" }.',
  ].join('\n');

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: `Current ${kind}: "${text || '(none yet)'}"` }],
      { temperature: 0.85, maxTokens: kind === 'banner' ? 260 : 80 });
    const out = String(r?.text || '').replace(/^["']|["']$/g, '').slice(0, cap);
    return NextResponse.json({ text: out || text });
  } catch {
    return NextResponse.json({ error: 'Could not remix — try again.' }, { status: 200 });
  }
}
