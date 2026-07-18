import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled } from '@/src/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { geminiSearchVideos } = require('@/src/ai/providers');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// POST { query, limit? } -> { videos: [{ videoId, title, channel, thumb, url, embed }] }
// Real, embeddable YouTube video recommendations found via Gemini + Google Search
// grounding, then verified against YouTube's keyless oEmbed endpoint (dead/private
// links are dropped). Free — it uses the site's existing Gemini key, no token debit.
export async function POST(req: Request) {
  if (!geminiEnabled) {
    return NextResponse.json({ error: 'Video recommendations need Google Search grounding — set GEMINI_API_KEY.' }, { status: 200 });
  }
  const b = (await req.json().catch(() => ({}))) || {};
  const query = String(b.query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!query) return NextResponse.json({ error: 'Tell me a topic to find videos for.' }, { status: 400 });
  const limit = Math.max(1, Math.min(6, Number(b.limit) || 4));

  try {
    const videos = await geminiSearchVideos(query, limit);
    if (!Array.isArray(videos) || !videos.length) {
      return NextResponse.json({ videos: [], error: 'No matching videos found — try rephrasing the topic.' }, { status: 200 });
    }
    return NextResponse.json({ videos }, { headers: { 'Cache-Control': 'no-cache' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Video search failed.' }, { status: 200 });
  }
}
