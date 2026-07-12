'use client';
/* Reusable comment section backed by /api/comments. Drops onto any target
 * (a tool or a feed post) so the platform provides the "comments" chrome — tools
 * therefore never need to build their own comment field. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';

function timeAgo(iso: string): string {
  if (!iso) return '';
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}

export function CommentSection({ targetType, targetId }: { targetType: 'tool' | 'post'; targetId: string }) {
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  // Filters: free-text search + sort (recent / popular / my favorites).
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'popular' | 'fav'>('recent');
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setFavs(JSON.parse(localStorage.getItem('sl_comment_favs') || '{}')); } catch { /* ignore */ } }, []);
  const toggleFav = (id: string) => setFavs(f => { const n = { ...f }; if (n[id]) delete n[id]; else n[id] = true; try { localStorage.setItem('sl_comment_favs', JSON.stringify(n)); } catch { /* ignore */ } return n; });

  useEffect(() => {
    let cancelled = false;
    API.get(`/api/comments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`)
      .then((r: any) => { if (!cancelled) { setComments(Array.isArray(r?.comments) ? r.comments : []); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [targetType, targetId]);

  const add = async () => {
    const body = text.trim(); if (!body) return; setText('');
    try { const r = await API.post('/api/comments', { targetType, targetId, body }); if (r?.comment) setComments(c => [r.comment, ...c]); } catch { /* ignore */ }
  };

  const likesOf = (c: any) => Number(c.likeCount ?? c.likes ?? 0);
  const shown = comments
    .filter((c: any) => {
      if (sort === 'fav' && !favs[c.id]) return false;
      if (!q.trim()) return true;
      const s = q.trim().toLowerCase();
      return String(c.body || '').toLowerCase().includes(s) || String(c.author || '').toLowerCase().includes(s);
    })
    .sort((a: any, b: any) => {
      if (sort === 'popular') { const d = likesOf(b) - likesOf(a); if (d) return d; }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();  // recent (and popular tie-break)
    });

  return (
    <div className="card alt" style={{ padding: '14px 16px', marginTop: 16, maxWidth: 640, marginInline: 'auto' }}>
      <h4 style={{ margin: '0 0 8px' }}>💬 Comments{loaded ? ` (${comments.length})` : ''}</h4>
      <div className="chat-input-row" style={{ marginBottom: 10 }}>
        <input type="text" value={text} placeholder="Add a comment…" onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn small primary" onClick={add}>Post</button>
      </div>

      {/* Filters */}
      {comments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([['recent', 'Recent'], ['popular', 'Popular'], ['fav', '★ Favorites']] as const).map(([k, lbl]) => (
              <button key={k} className={`btn small ${sort === k ? 'blue' : 'ghost'}`} onClick={() => setSort(k)}>{lbl}</button>
            ))}
          </div>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 search comments" style={{ fontSize: 12, flex: '1 1 140px', padding: '4px 7px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
        </div>
      )}

      {comments.length === 0 && loaded && <p style={{ opacity: 0.6, fontSize: 13, margin: 0 }}>No comments yet — be the first.</p>}
      {comments.length > 0 && shown.length === 0 && <p style={{ opacity: 0.6, fontSize: 13, margin: 0 }}>No comments match these filters.</p>}
      {shown.map((c: any, i: number) => (
        <div key={c.id || i} style={{ borderTop: '1px dashed var(--ink)', padding: '8px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}><b>@{c.author}</b> · {timeAgo(c.createdAt)} {c.aiGenerated && <span style={{ opacity: 0.6 }}>· ✦AI</span>}{likesOf(c) ? <span style={{ opacity: 0.6 }}> · ❤️ {likesOf(c)}</span> : null}</div>
            <div style={{ fontSize: 14 }}>{c.body}</div>
          </div>
          <button className="btn small ghost" title={favs[c.id] ? 'Unfavorite' : 'Favorite'} style={{ flex: '0 0 auto' }} onClick={() => toggleFav(c.id)}>{favs[c.id] ? '★' : '☆'}</button>
        </div>
      ))}
    </div>
  );
}
