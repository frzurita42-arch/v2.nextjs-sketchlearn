import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, youtubeEnabled } from '@/src/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { geminiSearchVideos, youtubeDataVideos } = require('@/src/ai/providers');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// POST { query, limit? } -> { videos: [{ videoId, title, channel, desc, thumb, url, embed }] }
// Real, embeddable YouTube video recommendations. Prefers the YouTube Data API v3
// (YOUTUBE_API_KEY): a topic searches that topic, an empty topic returns what's most
// popular right now (stands in for a personal feed, which would need viewer OAuth).
// Falls back to Gemini + Google Search grounding when only GEMINI_API_KEY is set.
// Free — no token debit.
export async function POST(req: Request) {
  if (!youtubeEnabled && !geminiEnabled) {
    return NextResponse.json({ error: 'Video recommendations need YOUTUBE_API_KEY (or GEMINI_API_KEY).' }, { status: 200 });
  }
  const b = (await req.json().catch(() => ({}))) || {};
  const query = String(b.query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const limit = Math.max(1, Math.min(6, Number(b.limit) || 4));

  // Preferred path: the real YouTube Data API (topic search, or most-popular when no topic).
  if (youtubeEnabled) {
    try {
      const videos = await youtubeDataVideos(query, limit);
      if (Array.isArray(videos) && videos.length) {
        return NextResponse.json({ videos, source: 'youtube', popular: !query }, { headers: { 'Cache-Control': 'no-cache' } });
      }
      if (!geminiEnabled) return NextResponse.json({ videos: [], error: 'No matching videos found — try rephrasing the topic.' }, { status: 200 });
    } catch (e: any) {
      if (!geminiEnabled) return NextResponse.json({ error: e?.message || 'Video search failed.' }, { status: 200 });
      // else fall through to the Gemini grounding path below
    }
  }

  // Fallback: Gemini + Google Search grounding (needs a topic).
  if (!query) return NextResponse.json({ error: 'Tell me a topic to find videos for.' }, { status: 400 });
  try {
    const videos = await geminiSearchVideos(query, limit);
    if (!Array.isArray(videos) || !videos.length) {
      return NextResponse.json({ videos: [], error: 'No matching videos found — try rephrasing the topic.' }, { status: 200 });
    }
    return NextResponse.json({ videos, source: 'gemini' }, { headers: { 'Cache-Control': 'no-cache' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Video search failed.' }, { status: 200 });
  }
}
