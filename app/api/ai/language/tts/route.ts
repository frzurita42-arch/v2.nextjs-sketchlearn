import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { ttsEnabled } from '@/src/config';
import { generateSpeech } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/* Proxy text-to-speech through the server so the ElevenLabs key never reaches the
 * client. Returns { audio: dataUrl } or { audio: null } (client shows the text). */
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const { text = '' } = (await req.json().catch(() => ({}))) || {};
  if (!ttsEnabled) return NextResponse.json({ audio: null, enabled: false });
  const audio = await generateSpeech(text);
  return NextResponse.json({ audio, enabled: true });
}
