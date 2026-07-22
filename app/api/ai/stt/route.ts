import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { elevenlabsEnabled } from '@/src/config';
import { transcribeSpeech } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/* Speech-to-text for the coach chat's 🎤 dictation button. The browser records a
 * short audio clip and posts it here as a base64 data URL; we proxy it to ElevenLabs
 * Scribe so the API key never reaches the client, and return { text }.
 *
 * Returns { enabled:false } when no ELEVENLABS_API_KEY is set, so the UI can hide the
 * mic; returns { error } (with the real reason) on a failed transcription. */
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (!elevenlabsEnabled) return NextResponse.json({ text: '', enabled: false, error: 'ELEVENLABS_API_KEY not set' });

  const { audio = '' } = (await req.json().catch(() => ({}))) || {};
  // Parse a data: URL, tolerating codec parameters (e.g. "audio/webm;codecs=opus").
  const s = String(audio || '');
  const sep = s.indexOf(';base64,');
  const head = sep > 0 ? s.slice(0, sep) : '';
  if (!/^data:audio\//i.test(head)) return NextResponse.json({ text: '', enabled: true, error: 'No audio provided.' });

  const mime = head.replace(/^data:/, '').split(';')[0] || 'audio/webm';   // base type, params dropped
  const buffer = Buffer.from(s.slice(sep + ';base64,'.length), 'base64');
  // Guard against oversized clips (protects tokens/time): cap at ~10 MB.
  if (buffer.length > 10_000_000) return NextResponse.json({ text: '', enabled: true, error: 'Recording too long — keep it under a minute.' });

  const { text, error } = await transcribeSpeech(buffer, mime);
  if (error) return NextResponse.json({ text: '', enabled: true, error }, { status: 502 });
  return NextResponse.json({ text, enabled: true });
}
