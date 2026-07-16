import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, moonshotEnabled } from '@/src/config';
import { generateText } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const textAI = () => openrouterEnabled || geminiEnabled || deepseekEnabled || moonshotEnabled;

// POST { text, kind?: 'title'|'subject'|'generic', context? } -> { text }
// The 🎨 palette "diffuser": reword a short label into a SIMILAR-but-different
// phrasing (same meaning), so the author can shuffle a title/subject to taste.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const text = String(b.text || '').slice(0, 200).trim();
  const kind = ['title', 'subject', 'generic'].includes(String(b.kind)) ? String(b.kind) : 'generic';
  const context = String(b.context || '').slice(0, 400);
  if (!text) return NextResponse.json({ error: 'Nothing to reword.' }, { status: 200 });
  if (!textAI()) return NextResponse.json({ text });

  const what = kind === 'title' ? 'a lesson/tool TITLE' : kind === 'subject' ? 'a subject / topic label' : 'a short label';
  const system = [
    `Reword ${what} into a fresh, similar-but-different version that keeps the SAME meaning.`,
    'Keep it short (title: <= ~8 words; subject: <= ~5 words). No quotes, no punctuation at the ends, no explanation.',
    'Return ONLY the reworded text on one line.',
  ].join('\n');
  const user = [context ? `Context: ${context}` : '', `Current: ${text}`, 'Reworded:'].filter(Boolean).join('\n');
  try {
    const out = await generateText([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.9, maxTokens: 40 });
    const cleaned = String(out || '').replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].slice(0, 120).trim();
    return NextResponse.json({ text: cleaned || text });
  } catch {
    return NextResponse.json({ text });
  }
}
