import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { page, current, currentBody } -> { title, body }
// The 🎨 "generate explanation with AI" tool for the instruction banner — writes a
// short, friendly "how to use this" board for a page (or the whole site).
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) || {};
  const page = String(b.page || 'the site').slice(0, 60);
  const current = String(b.current || '').slice(0, 120);
  const currentBody = String(b.currentBody || '').slice(0, 400);

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ error: 'No AI model is configured — type it manually instead.' }, { status: 200 });
  }

  const system = [
    'You write the "instruction board" for SketchLearn — a playful, hand-drawn sketchbook site where people build and share AI-powered educational tools (lessons, presentations, repositories, galleries).',
    `Explain, in a warm and encouraging voice, how to use "${page}".`,
    current ? `Current title: "${current}".` : '',
    currentBody ? `Current text: "${currentBody}".` : '',
    'Return a SHORT title (max ~6 words) and a body of 1–3 short sentences that tell a newcomer what to do here.',
    'Plain language, no markdown. Return STRICT JSON: { "title": "…", "body": "…" }.',
  ].filter(Boolean).join('\n');

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: 'Write the instruction board.' }],
      { temperature: 0.8, maxTokens: 220 });
    const title = String(r?.title || '').replace(/^["']|["']$/g, '').slice(0, 120).trim();
    const body = String(r?.body || '').replace(/^["']|["']$/g, '').slice(0, 400).trim();
    if (!title && !body) return NextResponse.json({ error: 'Could not generate — try again or type it.' }, { status: 200 });
    return NextResponse.json({ title, body });
  } catch {
    return NextResponse.json({ error: 'Could not generate — try again or type it.' }, { status: 200 });
  }
}
