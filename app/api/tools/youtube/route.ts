import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { youtubeEnabled, YOUTUBE_API_KEY, YOUTUBE_API_BASE } from '@/src/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

// POST { query, limit? } -> { videos: [{ videoId, title, channel, thumb, url, published }] }
// Real YouTube video recommendations via the YouTube Data API v3 (search.list).
// Read-only + free Google quota, so it costs the learner nothing. The coach chat
// turns each result into a red "video" sticky note with a Watch button.
export async function POST(req: Request) {
  if (!youtubeEnabled) {
    return NextResponse.json({ error: 'YouTube recommendations are not configured (set YOUTUBE_API_KEY).' }, { status: 200 });
  }
  const b = (await req.json().catch(() => ({}))) || {};
  const query = String(b.query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!query) return NextResponse.json({ error: 'Tell me a topic to find videos for.' }, { status: 400 });
  const limit = Math.max(1, Math.min(6, Number(b.limit) || 4));

  const params = new URLSearchParams({
    key: String(YOUTUBE_API_KEY || ''),
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(limit),
    safeSearch: 'strict',
    videoEmbeddable: 'true',
  });

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${String(YOUTUBE_API_BASE).replace(/\/$/, '')}/search?${params.toString()}`, { signal: ctrl.signal }).catch((e) => { throw e; });
    clearTimeout(t);
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      return NextResponse.json({ error: `YouTube search failed (${res.status}).`, detail }, { status: 200 });
    }
    const data: any = await res.json().catch(() => ({}));
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    const videos = items
      .map((it) => {
        const id = it?.id?.videoId;
        const s = it?.snippet || {};
        if (!id) return null;
        const th = s.thumbnails || {};
        const thumb = th.medium?.url || th.high?.url || th.default?.url || '';
        return {
          videoId: id,
          title: String(s.title || 'Untitled').slice(0, 160),
          channel: String(s.channelTitle || '').slice(0, 100),
          thumb,
          url: `https://www.youtube.com/watch?v=${id}`,
          published: s.publishedAt || '',
        };
      })
      .filter(Boolean);
    return NextResponse.json({ videos }, { headers: { 'Cache-Control': 'no-cache' } });
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'YouTube search timed out — try again.' : (e?.message || 'YouTube search failed.');
    return NextResponse.json({ error: msg }, { status: 200 });
  }
}
