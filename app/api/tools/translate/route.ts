import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateText } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { text, to } -> a translation of `text` into language `to` (default English).
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const text = String(b.text || '').slice(0, 2000).trim();
  const to = String(b.to || 'English').slice(0, 40);
  if (!text) return NextResponse.json({ translation: '' });
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ translation: `(Translation needs an AI key.) ${text}`, fallback: true });
  }
  try {
    const out = await generateText(
      [{ role: 'system', content: 'You are a precise translator. Reply with ONLY the translation, no notes.' },
       { role: 'user', content: `Translate into ${to}:\n\n${text}` }],
      { json: false, temperature: 0.3, maxTokens: 800 }
    );
    return NextResponse.json({ translation: String(out || '').trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Translation failed' }, { status: 502 });
  }
}
