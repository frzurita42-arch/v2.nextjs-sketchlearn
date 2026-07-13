'use client';
/* "Posts from the tools" — a self-contained sliding feed of the recent renditions
 * people generated across all tools (distinct from the tools themselves). Each
 * card links back to the tool that produced it. Reuses the shared Carousel. */
import { useCallback, useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { isRenderableImage } from '@/lib/img';
import { Carousel } from '@/components/ui/Carousel';

const kindOf = (a: string) => a === 'app' ? 'APP' : a === 'lesson' ? 'LESSON' : a === 'repo' ? 'REPO' : 'GEN';

export function PostsCarousel({ title = '📰 Posts from the tools', limit = 20,
  canEditTitle, onRenameTitle, onRemixTitle, remixingTitle }: {
  title?: string; limit?: number;
  canEditTitle?: boolean; onRenameTitle?: (t: string) => void; onRemixTitle?: () => void; remixingTitle?: boolean;
}) {
  const app = useApp();
  const [posts, setPosts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { const r = await API.get(`/api/tools/posts?limit=${limit}`); setPosts(Array.isArray(r?.posts) ? r.posts : []); }
    catch { setPosts([]); } finally { setBusy(false); }
  }, [limit]);
  useEffect(() => { load(); }, [load]);

  const open = async (slug: string) => {
    try { const r = await API.get(`/api/tools?slug=${encodeURIComponent(slug)}`); if (r?.tool) { appState.activeTool = r.tool; app.nav('tool'); } }
    catch { /* ignore */ }
  };

  const card = (p: any) => (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', cursor: 'pointer' }} onClick={() => open(p.toolSlug)}>
      {isRenderableImage(p.thumbnail)
        ? <img src={p.thumbnail} alt="" loading="lazy" style={{ width: '100%', height: 110, objectFit: 'cover', borderBottom: '2px solid var(--ink)' }} />
        : <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.04)', borderBottom: '2px dashed var(--ink)', fontSize: 12, opacity: 0.55 }}>🖼️ No photo</div>}
      <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 14, lineHeight: 1.2 }}>{p.label}</strong>
          <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.55 }}>{kindOf(p.archetype)}</span>
        </div>
        {p.subtitle && <div style={{ fontSize: 12, opacity: 0.8 }}>{p.subtitle}</div>}
        <div style={{ fontSize: 11, opacity: 0.65, flex: 1 }}>
          from <b>{p.toolTitle}</b> · @{p.username}{p.byAdmin ? ' 🛡️' : ''}{typeof p.score === 'number' ? ` · ${p.score >= 80 ? '🌟' : p.score >= 50 ? '📈' : '🌱'} ${p.score}%` : ''}
        </div>
        <span style={{ fontSize: 10, opacity: 0.5 }}>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}</span>
      </div>
    </div>
  );

  return (
    <Carousel title={title} onRefresh={load} refreshing={busy} cardWidth={230} cardHeight={360}
      canEditTitle={canEditTitle} onRenameTitle={onRenameTitle} onRemixTitle={onRemixTitle} remixingTitle={remixingTitle}
      empty={busy ? 'Loading posts…' : 'No posts yet — generate something from a tool and it will appear here.'}>
      {posts.map((p) => <div key={p.entryId} style={{ height: '100%' }}>{card(p)}</div>)}
    </Carousel>
  );
}
