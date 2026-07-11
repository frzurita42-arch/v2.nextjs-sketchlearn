'use client';
/* Twitter-style feed: a mixed timeline of text posts, image posts, and tool
 * publications (100 AI-seeded dummy posts + real user posts + published tools),
 * shown in random order. Every AI-generated item is clearly badged. Posts the
 * viewer has already seen come back slightly morphed on the next load (the "10%
 * nudge") — a per-post seen-count in localStorage drives that on the server. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';

const SEEN_KEY = 'sl_feed_seen';
function loadSeen(): Record<string, number> { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; } }
function saveSeen(m: Record<string, number>) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch { /* ignore */ } }

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}
function Avatar({ a }: { a: any }) {
  return <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: a?.color || '#ccc', border: '2px solid var(--ink)', fontSize: 20, flex: '0 0 auto' }}>{a?.emoji || '🙂'}</span>;
}
const AiBadge = () => <span title="AI-generated content" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: '1px 6px', borderRadius: 999, border: '1.5px solid var(--ink)', background: 'rgba(155,93,229,0.12)', whiteSpace: 'nowrap' }}>✦ AI-GENERATED</span>;

function Comments({ post }: { post: any }) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const targetType = post.kind === 'tool' ? 'tool' : 'post';
  const targetId = post.tool?.slug || post.id;

  const openToggle = async () => {
    const next = !open; setOpen(next);
    if (next && !loaded) {
      try { const r = await API.get(`/api/comments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`); setExtra(r?.comments || []); } catch { /* ignore */ }
      setLoaded(true);
    }
  };
  const add = async () => {
    const body = text.trim(); if (!body) return; setText('');
    try { const r = await API.post('/api/comments', { targetType, targetId, body }); if (r?.comment) setExtra(e => [r.comment, ...e]); } catch { /* ignore */ }
  };
  const seeded = post.comments || [];
  const total = seeded.length + extra.length;
  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn small ghost" onClick={openToggle}>💬 {open ? 'Hide' : (total ? `${total} comment${total === 1 ? '' : 's'}` : 'Comment')}</button>
      {open && (
        <div style={{ marginTop: 8, borderTop: '2px dashed var(--ink)', paddingTop: 8 }}>
          <div className="chat-input-row" style={{ marginBottom: 8 }}>
            <input type="text" value={text} placeholder="Add a comment…" onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <button className="btn small primary" onClick={add}>Post</button>
          </div>
          {[...extra, ...seeded].map((c: any, i: number) => (
            <div key={c.id || i} style={{ display: 'flex', gap: 8, margin: '6px 0', alignItems: 'flex-start' }}>
              {c.author?.avatar ? <Avatar a={c.author.avatar} /> : <Avatar a={{ emoji: '🙂', color: '#bbb' }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  <b>{c.author?.name || c.author || 'user'}</b> · {c.createdAt ? timeAgo(c.createdAt) : ''} {c.aiGenerated && <AiBadge />}
                </div>
                <div style={{ fontSize: 14 }}>{c.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post }: { post: any }) {
  const [likes, setLikes] = useState<number>(post.likeCount || 0);
  const [liked, setLiked] = useState(false);
  const like = () => { setLiked(l => { setLikes(n => n + (l ? -1 : 1)); return !l; }); };
  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 14, maxWidth: 640, marginInline: 'auto' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Avatar a={post.author?.avatar} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{post.author?.name} <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 13 }}>@{post.author?.handle}</span></div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{post.createdAt ? timeAgo(post.createdAt) : ''} ago {post.kind === 'tool' && '· published a tool 🛠️'}</div>
        </div>
        {post.aiGenerated && <AiBadge />}
      </div>

      {post.title && <h3 style={{ margin: '10px 0 4px', fontSize: 18 }}>{post.title}</h3>}
      <p style={{ margin: '8px 0', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{post.body}</p>

      {post.image && <img src={post.image} alt="" style={{ width: '100%', borderRadius: 10, border: '2px solid var(--ink)', display: 'block' }} />}

      {post.kind === 'tool' && post.tool?.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {post.tool.tags.map((t: string, i: number) => <span key={i} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, border: '1.5px solid var(--ink)', background: 'rgba(0,0,0,0.04)' }}>#{t}</span>)}
        </div>
      )}

      {post.morphed && (
        <div style={{ marginTop: 8, fontSize: 12, fontStyle: 'italic', opacity: 0.7 }}>↻ freshened variant — same idea, new angle (AI-generated)</div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
        <button className="btn small ghost" onClick={like} aria-pressed={liked}>{liked ? '❤️' : '🤍'} {likes}</button>
        <Comments post={post} />
      </div>
    </div>
  );
}

export function FeedView() {
  const app = useApp();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const seenRef = useRef<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    seenRef.current = loadSeen();
    try {
      const r = await API.post('/api/feed', { seen: seenRef.current });
      const list = r?.posts || [];
      setPosts(list);
      // Mark everything just shown as seen (+1), so the next load morphs them.
      const m = { ...seenRef.current };
      for (const p of list) m[p.id] = (m[p.id] || 0) + 1;
      saveSeen(m);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const submit = async () => {
    const body = text.trim(); if (!body) return; setText('');
    try { const r = await API.post('/api/posts', { body }); if (r?.post) setPosts(p => [{ ...r.post, author: { handle: r.post.author, name: r.post.author, avatar: { emoji: '🙂', color: '#7fb069' } }, comments: [] }, ...p]); } catch { /* ignore */ }
  };

  return (
    <>
      <h1 className="view-title">The <span className="scribble-underline">Feed</span></h1>
      <p className="view-sub">Posts and published tools from the community.{' '}
        <button className="btn small" onClick={load}>↻ Refresh feed</button></p>

      <div className="card alt" style={{ padding: '12px 14px', maxWidth: 640, margin: '0 auto 16px' }}>
        <textarea value={text} placeholder="Share something you built or learned…" onChange={e => setText(e.target.value)} style={{ width: '100%', minHeight: 60 }} />
        <div className="slide-actions" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
          <button className="btn green" onClick={submit}>Post</button>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, opacity: 0.6, margin: '0 auto 12px', maxWidth: 640 }}>
        ✦ Most posts below are AI-generated sample content to show how the feed works, and are labelled as such.
      </p>

      {loading ? <p style={{ textAlign: 'center', opacity: 0.7 }}>Loading feed…</p>
        : posts.map(p => <PostCard key={p.id + (p.morphed ? `-m${p.morphCount}` : '')} post={p} />)}
    </>
  );
}
