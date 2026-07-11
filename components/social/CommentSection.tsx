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

  return (
    <div className="card alt" style={{ padding: '14px 16px', marginTop: 16, maxWidth: 640, marginInline: 'auto' }}>
      <h4 style={{ margin: '0 0 8px' }}>💬 Comments{loaded ? ` (${comments.length})` : ''}</h4>
      <div className="chat-input-row" style={{ marginBottom: 10 }}>
        <input type="text" value={text} placeholder="Add a comment…" onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn small primary" onClick={add}>Post</button>
      </div>
      {comments.length === 0 && loaded && <p style={{ opacity: 0.6, fontSize: 13, margin: 0 }}>No comments yet — be the first.</p>}
      {comments.map((c: any, i: number) => (
        <div key={c.id || i} style={{ borderTop: '1px dashed var(--ink)', padding: '8px 0' }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}><b>@{c.author}</b> · {timeAgo(c.createdAt)} {c.aiGenerated && <span style={{ opacity: 0.6 }}>· ✦AI</span>}</div>
          <div style={{ fontSize: 14 }}>{c.body}</div>
        </div>
      ))}
    </div>
  );
}
