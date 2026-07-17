import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { ttsEnabled } from '@/src/config';
import { generateSpeech } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getTtsCache, setTtsCache } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/* Proxy text-to-speech through the server so the ElevenLabs key never reaches the
 * client. Returns { audio: dataUrl } or { audio: null } (client shows the text).
 *
 * Cached: the audio for a given (voice + text) is stored in the tts_cache table
 * (data URL offloaded to the blob store when configured), so replaying/reviewing
 * a saved lesson serves the SAME line from the cache for free — no re-synthesis. */
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const { text = '', voiceId = '' } = (await req.json().catch(() => ({}))) || {};
  if (!ttsEnabled) return NextResponse.json({ audio: null, enabled: false, error: 'ELEVENLABS_API_KEY not set' });

  const clean = String(text || '').trim();
  if (!clean) return NextResponse.json({ audio: null, enabled: true, error: 'Nothing to speak.' });

  // Cache key: hash of the voice + the exact text, so the same line reused (on a
  // replay or by another student) is served from storage.
  const key = 'tts:' + createHash('sha256').update(`${voiceId}|${clean}`).digest('hex').slice(0, 40);
  try {
    const cached = await getTtsCache(key);
    if (cached) return NextResponse.json({ audio: cached, enabled: true, cached: true });
  } catch { /* fall through to synthesis */ }

  const { audio, error } = await generateSpeech(clean, voiceId);
  if (audio) {
    // Offload a data: URL to the blob store so the DB row stays light; keep the
    // data URL if there's no blob configured or the upload fails.
    let stored = audio as string;
    if (/^data:audio\//i.test(stored) && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const m = stored.match(/^data:(audio\/[\w+.-]+);base64,(.+)$/);
        if (m) {
          const { put } = await import('@vercel/blob');
          const ext = (m[1].split('/')[1] || 'mp3').replace(/[^a-z0-9]/gi, '') || 'mp3';
          const blob = await put(`tts/${key.slice(4)}.${ext}`, Buffer.from(m[2], 'base64'), { access: 'public', addRandomSuffix: true, contentType: m[1] });
          stored = blob.url;
        }
      } catch { /* keep the data URL */ }
    }
    try { await setTtsCache(key, stored, String(voiceId || '')); } catch { /* best-effort cache */ }
    return NextResponse.json({ audio: stored, enabled: true });
  }
  return NextResponse.json({ audio, enabled: true, error });
}
