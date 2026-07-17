'use client';
/* Threaded comment section — an adaptation of the repo-card layout to comments.
 * Each comment is a shared CardShell whose icon is the author's avatar (their
 * "profile picture"). It supports: a ❤️ like button + count, a date/time stamp,
 * two attachment roles — 📎 Poster (blue, the author/admin post a file or link
 * everyone can open) and 📁 User (green, any signed-in viewer uploads their own
 * document; only they or an admin can remove it, not the author) — replies
 * (comment on a comment ⇒ a nested comment), and delete (author/admin). A new
 * top-level comment is just a new comment; a nested one is a reply. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';
import { CardShell, iconBtn, delIcon } from '@/components/ui/CardShell';

// Deterministic emoji+color avatar from a username (matches the tool/feed style).
const AV_EMOJI = ['🦊', '📊', '🐛', '🦉', '🤖', '⚙️', '🗣️', '🛡️', '🔧', '📈', '✏️', '☁️', '🎨', '🔐', '📝', '🌊'];
const AV_COLOR = ['#f9a03f', '#5c80bc', '#7fb069', '#e4572e', '#9b5de5', '#00b4d8', '#f15bb5', '#2d6a4f'];
function avatarFor(name: string) {
  let h = 0; for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return { emoji: AV_EMOJI[h % AV_EMOJI.length], color: AV_COLOR[(h >> 4) % AV_COLOR.length] };
}
function whenStr(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  try { return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return d.toLocaleString(); }
}
const cap15 = (s: string) => (s.length > 15 ? s.slice(0, 14) + '…' : s);

type CLink = { label: string; url: string; color?: 'green'; by?: string };
type Comment = { id: string; author: string; body: string; parentId?: string | null; links?: CLink[]; likedBy?: string[]; createdAt: string; aiGenerated?: boolean };

// Shared helper: ask for a link OR (if left blank) upload a file, returning the
// attachment {label,url}. Used by the Poster/User buttons on a comment.
async function pickAttachment(): Promise<{ label: string; url: string } | null> {
  const link = window.prompt('Paste a link to attach — or leave blank and press OK to upload a file:');
  if (link === null) return null;                 // cancelled
  const trimmed = link.trim();
  if (trimmed) {
    let url = trimmed;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) url = 'https://' + url;
    const label = (window.prompt('Label (max 15):') || 'Link').slice(0, 15);
    return { label, url };
  }
  // No link → upload a file.
  return await new Promise((resolve) => {
    const inp = document.createElement('input'); inp.type = 'file';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) { resolve(null); return; }
      if (f.size > 25_000_000) { alert('Please pick a file under 25 MB.'); resolve(null); return; }
      let url = ''; try { const up = await API.upload('/api/upload', f); if (up?.url) url = up.url; } catch { /* data URL fallback */ }
      if (!url) url = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.readAsDataURL(f); });
      resolve({ label: f.name.slice(0, 15), url });
    };
    inp.click();
  });
}

// A composer used both for a new top-level comment and for a reply. Lets you
// type text and attach links/files (blue clip or green folder) before posting.
function Composer({ placeholder, onPost, onCancel, compact }: { placeholder: string; onPost: (body: string, links: CLink[]) => Promise<void>; onCancel?: () => void; compact?: boolean }) {
  const [text, setText] = useState('');
  const [links, setLinks] = useState<CLink[]>([]);
  const [attaching, setAttaching] = useState<false | 'blue' | 'green'>(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  // A new comment is authored by you, so its attachments are POSTER links (blue,
  // everyone can open). Type a link or upload a file before posting.
  const addLink = () => { const u = url.trim(); if (!u) return; setLinks((ls) => [...ls, { label: (label.trim() || 'Link').slice(0, 15), url: u }]); setLabel(''); setUrl(''); setAttaching(false); };
  const uploadFile = async (f: File) => {
    if (f.size > 25_000_000) { alert('Please pick a file under 25 MB.'); return; }
    setBusy(true);
    try {
      let u = ''; try { const up = await API.upload('/api/upload', f); if (up?.url) u = up.url; } catch { /* data URL fallback */ }
      if (!u) u = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.readAsDataURL(f); });
      setLinks((ls) => [...ls, { label: f.name.slice(0, 15), url: u }]);
    } catch { alert('Could not attach the file.'); }
    setBusy(false); setAttaching(false);
  };
  const submit = async () => { if (!text.trim() && !links.length) return; setBusy(true); try { await onPost(text.trim(), links); setText(''); setLinks([]); } finally { setBusy(false); } };

  return (
    <div style={{ display: 'grid', gap: 6, margin: compact ? '6px 0 0' : '0 0 12px' }}>
      <div className="chat-input-row">
        <input type="text" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        <button type="button" title="Attach a file or link" style={{ ...iconBtn, fontSize: 16 }} onClick={() => setAttaching((a) => a ? false : 'blue')}>📎</button>
        <button className="btn small primary" disabled={busy} onClick={submit}>{compact ? 'Reply' : 'Post'}</button>
        {onCancel && <button className="btn small ghost" onClick={onCancel}>Cancel</button>}
      </div>
      {attaching && (
        <div className="card" style={{ padding: '6px 8px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>📎 attach a</span>
          <input value={label} placeholder="Label (max 15)" maxLength={15} onChange={(e) => setLabel(e.target.value.slice(0, 15))} style={{ flex: '1 1 90px', fontSize: 13 }} />
          <input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }} style={{ flex: '2 1 140px', fontSize: 13 }} />
          <button className="btn small blue" onClick={addLink}>Add link</button>
          <label className="btn small ghost" style={{ cursor: 'pointer' }}>{busy ? 'Uploading…' : '📎 Upload'}<input type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.currentTarget.value = ''; }} /></label>
        </div>
      )}
      {links.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {links.map((l, i) => <span key={i} className="btn small blue" style={{ cursor: 'default' }}>🔗 {cap15(l.label)} <button onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button></span>)}
        </div>
      )}
    </div>
  );
}

function CommentCard({ c, kids, me, isAdmin, onReply, onLike, onPoster, onUser, onRemoveLink, onDelete }: {
  c: Comment; kids: (parent: string) => Comment[]; me: string; isAdmin: boolean;
  onReply: (parentId: string, body: string, links: CLink[]) => Promise<void>;
  onLike: (id: string) => void; onPoster: (id: string) => void; onUser: (id: string) => void;
  onRemoveLink: (id: string, index: number) => void; onDelete: (id: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showPoster, setShowPoster] = useState(false);   // 📎 icon revealed the Poster button
  const [showUser, setShowUser] = useState(false);       // 📁 icon revealed the User button
  const av = avatarFor(c.author);
  const links = c.links || [];
  const likedBy = c.likedBy || [];
  const liked = likedBy.includes(me);
  const mine = c.author === me || isAdmin;       // author/admin = Poster; can delete the comment
  const canPoster = mine;                          // author/admin post & manage blue links
  const canUser = !!me;                            // any signed-in viewer uploads a green link
  const replies = kids(c.id);
  // A viewer's own green upload / the last poster (blue) link — for the toggle.
  const myUserLinkIdx = links.findIndex((l) => l.color === 'green' && l.by === me);
  const lastPosterIdx = (() => { for (let i = links.length - 1; i >= 0; i--) if (links[i].color !== 'green') return i; return -1; })();
  const canRemoveLink = (l: CLink) => l.color === 'green' ? (l.by === me || isAdmin) : mine;

  const iconNode = <span aria-hidden style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: av.color, color: '#fff', fontSize: 22 }}>{av.emoji}</span>;
  const meta = <span style={{ fontSize: 11, opacity: 0.6 }}>{whenStr(c.createdAt)}{c.aiGenerated ? ' · ✦AI' : ''}</span>;
  const actions = (
    <>
      {links.map((l, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <a className={`btn small ${l.color === 'green' ? 'green' : 'blue'}`} href={l.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}
            title={l.by ? `${l.color === 'green' ? 'User' : 'Poster'}: ${l.by}` : undefined}>🔗 {cap15(l.label || 'Open')}</a>
          {canRemoveLink(l) && <button onClick={() => onRemoveLink(c.id, i)} title="Remove this attachment" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, opacity: 0.6 }}>✕</button>}
        </span>
      ))}
      <button onClick={() => onLike(c.id)} title={liked ? 'Unlike' : 'Like'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, opacity: liked ? 1 : 0.7 }}>{liked ? '❤️' : '🤍'} {likedBy.length || ''}</button>
      <button onClick={() => setReplying((r) => !r)} title="Reply (a nested comment)" style={{ ...iconBtn, fontSize: 14 }}>💬</button>
      {replies.length > 0 && <button onClick={() => setCollapsed((x) => !x)} title={collapsed ? `Show ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}` : 'Collapse replies'} style={{ ...iconBtn, fontSize: 13, opacity: 0.75 }}>{collapsed ? '▸' : '▾'}</button>}
      {/* 📎 / 📁 are just icons; clicking one reveals its "Poster" / "User" button. */}
      {canPoster && <button onClick={() => setShowPoster((v) => !v)} title={showPoster ? 'Hide the Poster button' : 'Poster attachment'} style={{ ...iconBtn, fontSize: 14, opacity: showPoster ? 1 : 0.85 }}>📎</button>}
      {canUser && <button onClick={() => setShowUser((v) => !v)} title={showUser ? 'Hide the User button' : 'User attachment'} style={{ ...iconBtn, fontSize: 14, opacity: showUser ? 1 : 0.85 }}>📁</button>}
      {canPoster && showPoster && <button onClick={() => { if (lastPosterIdx >= 0) onRemoveLink(c.id, lastPosterIdx); else onPoster(c.id); }} title={lastPosterIdx >= 0 ? 'Remove the posted file/link' : 'Post a file or link — everyone can open it'} className="btn small ghost">{lastPosterIdx >= 0 ? '✕ Poster' : 'Poster'}</button>}
      {canUser && showUser && <button onClick={() => { if (myUserLinkIdx >= 0) onRemoveLink(c.id, myUserLinkIdx); else onUser(c.id); }} title={myUserLinkIdx >= 0 ? 'Remove your upload (then upload a new one)' : 'Upload your own document'} className="btn small ghost">{myUserLinkIdx >= 0 ? '✕ User' : 'User'}</button>}
    </>
  );
  const del = mine ? <button title="Delete comment" style={delIcon} onClick={() => onDelete(c.id)}>🗑</button> : undefined;

  return (
    <div style={{ marginTop: 8 }}>
      <CardShell view="row" title={`@${c.author}`} subtitle={c.body || ' '} iconNode={iconNode} meta={meta} actions={actions} del={del} />
      {replying && <div style={{ marginLeft: 20 }}><Composer compact placeholder={`Reply to @${c.author}…`} onCancel={() => setReplying(false)} onPost={async (body, ls) => { await onReply(c.id, body, ls); setReplying(false); }} /></div>}
      {replies.length > 0 && !collapsed && (
        <div style={{ marginLeft: 20, marginTop: 6, borderLeft: '3px solid var(--accent, #5c80bc)', paddingLeft: 10, display: 'grid', gap: 2 }}>
          {replies.map((r) => <CommentCard key={r.id} c={r} kids={kids} me={me} isAdmin={isAdmin} onReply={onReply} onLike={onLike} onPoster={onPoster} onUser={onUser} onRemoveLink={onRemoveLink} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

export function CommentSection({ targetType, targetId }: { targetType: 'tool' | 'post'; targetId: string }) {
  const app = useApp();
  const me = app.user?.username || '';
  const isAdmin = app.user?.role === 'admin';
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'popular'>('recent');
  // Reveal top-level comments 6 at a time — the same "Read more ↓ / Read less ↑"
  // pattern as the repo cards: start at 6, Read more shows the next 6, Read less
  // folds 6 back up and stops at the first 6.
  const READ_STEP = 6;
  const [shown, setShown] = useState(READ_STEP);

  const load = () => API.get(`/api/comments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`)
    .then((r: any) => { setComments(Array.isArray(r?.comments) ? r.comments : []); setLoaded(true); })
    .catch(() => setLoaded(true));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetType, targetId]);

  const post = async (body: string, parentId: string | null, links: CLink[]) => {
    try { const r = await API.post('/api/comments', { targetType, targetId, body, parentId, links }); if (r?.comment) load(); else if (r?.error) alert(r.error); } catch { alert('Could not post the comment.'); }
  };
  const like = async (id: string) => { try { await API.put('/api/comments', { id, action: 'like' }); load(); } catch { /* ignore */ } };
  // Poster (blue) = author/admin post a file/link everyone can open. User (green)
  // = any signed-in viewer uploads their own; the server stamps `by`.
  const addAttachment = async (id: string, color: 'blue' | 'green') => {
    const picked = await pickAttachment(); if (!picked) return;
    try { await API.put('/api/comments', { id, action: 'addLink', color, link: picked }); load(); }
    catch { alert('Could not attach.'); }
  };
  const poster = (id: string) => addAttachment(id, 'blue');
  const userUpload = (id: string) => addAttachment(id, 'green');
  const removeLink = async (id: string, index: number) => { try { const r = await API.put('/api/comments', { id, action: 'removeLink', index }); if (r?.error) alert(r.error); load(); } catch { /* ignore */ } };
  const remove = async (id: string) => { if (!confirm('Delete this comment and its replies?')) return; try { await API.call('DELETE', '/api/comments', { id }); load(); } catch { alert('Could not delete.'); } };

  // Thread the flat list: group by parentId; roots keep only top-level comments
  // (or ones whose parent is missing), filtered + sorted.
  const idSet = useMemo(() => new Set(comments.map((c) => c.id)), [comments]);
  const kids = (parent: string) => comments.filter((c) => c.parentId === parent).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const roots = useMemo(() => comments
    .filter((c) => !c.parentId || !idSet.has(c.parentId))
    .filter((c) => { if (!q.trim()) return true; const s = q.trim().toLowerCase(); return String(c.body || '').toLowerCase().includes(s) || String(c.author || '').toLowerCase().includes(s); })
    .sort((a, b) => sort === 'popular' ? (b.likedBy?.length || 0) - (a.likedBy?.length || 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [comments, idSet, q, sort]);

  // Show the TOP-LEVEL comments up to `shown` (replies stay nested under their
  // parent). Reset the reveal when the filter/sort/thread changes so you start at
  // the first 6 again.
  useEffect(() => { setShown(READ_STEP); }, [q, sort, targetId]);
  const shownRoots = roots.slice(0, shown);
  const remaining = Math.max(0, roots.length - shown);
  const canLess = shown > READ_STEP;
  const readMore = roots.length > READ_STEP ? (() => {
    const link = { background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 15, color: 'var(--ink)', textUnderlineOffset: 3, padding: 0 } as const;
    return (
      <div style={{ display: 'flex', gap: 22, justifyContent: 'center', marginTop: 12 }}>
        <button disabled={remaining === 0} onClick={() => setShown((n) => n + READ_STEP)}
          title={remaining === 0 ? 'All comments are shown' : `Show the next ${Math.min(READ_STEP, remaining)} comments (${shown} of ${roots.length} shown)`}
          style={{ ...link, cursor: remaining === 0 ? 'default' : 'pointer', opacity: remaining === 0 ? 0.35 : 0.75, textDecoration: remaining === 0 ? 'none' : 'underline' }}>Read more ↓</button>
        <button disabled={!canLess} onClick={() => setShown((n) => Math.max(READ_STEP, n - READ_STEP))}
          title={canLess ? `Fold the last ${READ_STEP} comments back up` : `The first ${READ_STEP} comments always stay shown`}
          style={{ ...link, cursor: canLess ? 'pointer' : 'default', opacity: canLess ? 0.75 : 0.35, textDecoration: canLess ? 'underline' : 'none' }}>Read less ↑</button>
      </div>
    );
  })() : null;

  return (
    <div className="card alt" style={{ padding: '14px 16px', marginTop: 16, maxWidth: 680, marginInline: 'auto' }}>
      <h4 style={{ margin: '0 0 8px' }}>💬 Comments{loaded ? ` (${comments.length})` : ''}</h4>
      <Composer placeholder="Add a comment…" onPost={(body, links) => post(body, null, links)} />

      {comments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          {([['recent', 'Recent'], ['popular', 'Popular']] as const).map(([k, lbl]) => (
            <button key={k} className={`btn small ${sort === k ? 'blue' : 'ghost'}`} onClick={() => setSort(k)}>{lbl}</button>
          ))}
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 search comments" style={{ fontSize: 12, flex: '1 1 140px', padding: '4px 7px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
        </div>
      )}

      {comments.length === 0 && loaded && <p style={{ opacity: 0.6, fontSize: 13, margin: 0 }}>No comments yet — be the first.</p>}
      {comments.length > 0 && roots.length === 0 && <p style={{ opacity: 0.6, fontSize: 13, margin: 0 }}>No comments match your search.</p>}
      {shownRoots.map((c) => (
        <CommentCard key={c.id} c={c} kids={kids} me={me} isAdmin={isAdmin}
          onReply={(parentId, body, links) => post(body, parentId, links)}
          onLike={like} onPoster={poster} onUser={userUpload} onRemoveLink={removeLink} onDelete={remove} />
      ))}
      {readMore}
    </div>
  );
}
