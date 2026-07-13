'use client';
/* "Top picks for you" — a self-contained sliding feed of personalized tool +
 * repository suggestions (based on the viewer's activity: what they own and
 * favorited). Drop it in anywhere: the Tools home page and below the comments on
 * a tool page both render <SuggestionCarousel/>. Refresh pulls a fresh set. */
import { useCallback, useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { isRenderableImage } from '@/lib/img';
import { Carousel } from '@/components/ui/Carousel';

const kindOf = (a: string) => a === 'app' ? 'APP' : a === 'lesson' ? 'LESSON' : a === 'repo' ? 'REPO' : 'GEN';

export function SuggestionCarousel({ likeSlug, title = '✨ Top picks for you', limit = 10 }: { likeSlug?: string; title?: string; limit?: number }) {
  const app = useApp();
  const [picks, setPicks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));

  const favSlugs = (): string => {
    try { const m = JSON.parse(localStorage.getItem('sl_tool_likes') || '{}'); return Object.keys(m).filter(k => m[k]).join(','); } catch { return ''; }
  };

  const load = useCallback(async (s: number) => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ seed: String(s), limit: String(limit) });
      const favs = favSlugs(); if (favs) qs.set('favs', favs);
      if (likeSlug) qs.set('like', likeSlug);
      const r = await API.get(`/api/tools/suggestions?${qs.toString()}`);
      setPicks(Array.isArray(r?.picks) ? r.picks : []);
    } catch { setPicks([]); }
    finally { setBusy(false); }
  }, [likeSlug, limit]);

  useEffect(() => { load(seed); }, [load, seed]);
  const refresh = () => setSeed(Math.floor(Math.random() * 1e6));

  const open = async (slug: string) => {
    try {
      const r = await API.get(`/api/tools?slug=${encodeURIComponent(slug)}`);
      if (r?.tool) { appState.activeTool = r.tool; app.nav('tool'); }
    } catch { /* ignore */ }
  };

  const card = (p: any) => (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', cursor: 'pointer' }} onClick={() => open(p.slug)}>
      {isRenderableImage(p.thumbnail)
        ? <img src={p.thumbnail} alt="" loading="lazy" style={{ width: '100%', height: 96, objectFit: 'cover', borderBottom: '2px solid var(--ink)' }} />
        : <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.04)', borderBottom: '2px dashed var(--ink)', fontSize: 12, opacity: 0.55 }}>🖼️ No photo</div>}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 14, lineHeight: 1.2 }}>{p.title}</strong>
          <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.55 }}>{kindOf(p.archetype)}</span>
        </div>
        <div style={{ fontSize: 11, opacity: 0.7, flex: 1 }}>{p.reason}</div>
        <button className="btn small green" style={{ alignSelf: 'flex-start' }} onClick={(e) => { e.stopPropagation(); open(p.slug); }}>Open →</button>
      </div>
    </div>
  );

  return (
    <Carousel title={title} onRefresh={refresh} refreshing={busy} cardWidth={190}
      empty={busy ? 'Finding picks…' : 'No suggestions yet — favorite a few tools and check back.'}>
      {picks.map((p) => <div key={p.slug}>{card(p)}</div>)}
    </Carousel>
  );
}
