'use client';
/* A small reusable button that asks the AI to recommend up to `limit` tools /
 * repositories from the ones available (biased to the viewer's activity), then
 * hands the picks to `onResults`. Built to be dropped into any shelf/section —
 * the Tools page carousels use it today; other places can reuse it later. */
import { useState } from 'react';
import { API } from '@/lib/api';

export function RecommendButton({ likeSlug, limit = 10, label = '✨ Recommend', onResults, onError }: {
  likeSlug?: string;
  limit?: number;
  label?: string;
  onResults: (picks: any[]) => void;
  onError?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const favSlugs = (): string => {
    try { const m = JSON.parse(localStorage.getItem('sl_tool_likes') || '{}'); return Object.keys(m).filter(k => m[k]).join(','); } catch { return ''; }
  };
  const run = async () => {
    setBusy(true);
    try {
      const r = await API.post('/api/tools/recommend', { favs: favSlugs(), like: likeSlug || '', limit });
      if (Array.isArray(r?.picks)) onResults(r.picks);
      else if (r?.error) (onError || alert)(r.error);
    } catch (e: any) { (onError || alert)(e?.message || 'Could not get recommendations.'); }
    finally { setBusy(false); }
  };
  return (
    <button className="btn small" disabled={busy} onClick={run} title="Ask the AI to recommend from what's available">
      {busy ? '…' : label}
    </button>
  );
}
