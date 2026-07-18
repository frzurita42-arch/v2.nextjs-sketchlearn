import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { page, current, subtitle, kind } -> { title, subtitle }
// The 🎨 "let AI propose a title" tool on a page heading. Given the page's role
// (e.g. the Slides gallery) and its current title/subtitle, suggest a fresh,
// on-brand heading. No tool ownership involved — this only names a page section.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) || {};
  const page = String(b.page || '').slice(0, 60);
  const current = String(b.current || '').slice(0, 120);
  const subtitle = String(b.subtitle || '').slice(0, 240);
  const kind = String(b.kind || 'page').slice(0, 60);

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ error: 'No AI model is configured — type it manually instead.' }, { status: 200 });
  }

  const system = [
    'You name sections of SketchLearn — a playful, hand-drawn "sketchbook" site where people build and share AI-powered educational tools (lessons, presentations, repositories, galleries).',
    `You are naming the "${kind}" page${page ? ` (internal key: ${page})` : ''}.`,
    current ? `Its current title is: "${current}".` : '',
    subtitle ? `Its current subtitle is: "${subtitle}".` : '',
    'Propose a fresh, friendly title (may start with ONE fitting emoji, max ~6 words) and a short one-line subtitle (max ~12 words).',
    'Keep it clearly about the same section — do not change what the page is.',
    'Return STRICT JSON: { "title": "…", "subtitle": "…" }.',
  ].filter(Boolean).join('\n');

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: 'Propose the title and subtitle.' }],
      { temperature: 0.85, maxTokens: 120 });
    const title = String(r?.title || '').replace(/^["']|["']$/g, '').slice(0, 120).trim();
    const sub = String(r?.subtitle || '').replace(/^["']|["']$/g, '').slice(0, 240).trim();
    if (!title) return NextResponse.json({ error: 'Could not generate — try again or type it.' }, { status: 200 });
    return NextResponse.json({ title, subtitle: sub });
  } catch {
    return NextResponse.json({ error: 'Could not generate — try again or type it.' }, { status: 200 });
  }
}
