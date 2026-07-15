'use client';
/* Repository runtime + editor.
 *
 * A repository is a NESTED tree of cards ("layers of different levels" — no
 * pages/slides). Every card can carry a title/subtitle/text, an icon image
 * (uploaded or AI-generated), a set of LINK BUTTONS, an optional per-user
 * completion toggle, and nested child cards. Cards are laid out either as
 * horizontal bars or as a grid — a repo-wide default the owner/admin can change,
 * with an optional per-card override.
 *
 * View mode is for everyone. Owner/admin get an in-place editor: add card
 * (nests inside), add section (a new layer below), delete, edit every field by
 * typing OR regenerating it with AI, add/remove links, upload/AI an icon, and an
 * AI chat that lays out the whole tree. Saving persists for everyone; the
 * completion ✓ toggles are per-user (kept in localStorage). */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';
import { RichText } from '@/components/tools/RichText';
import { ImageField } from '@/components/tools/ImageField';
import { isRenderableImage } from '@/lib/img';
import { buildRepoZip } from '@/lib/lesson-export';
import { GallerySection } from '@/components/ui/GallerySection';
import { CardShell, iconBtn, overlayIcon, delIcon } from '@/components/ui/CardShell';
import type { RepoCard, RepoLink, RepoSpec } from '@/lib/tool-schema';

// Shared runtime context threaded through the read-only card tree.
type ViewCtx = {
  slug: string; me: string; isOwner: boolean;
  done: Record<string, boolean>; toggle: (id: string) => void;
  entriesByCard: Record<string, any[]>; onAdded: () => void;
  favs: Record<string, boolean>; toggleFav: (id: string) => void;   // per-card favorites
  collapseCmd: { on: boolean; n: number };         // "collapse/expand all" broadcast (n = nonce)
  levelIndex: Record<string, number>;              // each card's 0-based position within its level (default number icon)
  assignShown: boolean;                            // when true, show the per-card assignment-status toggle button on every card (owner/admin)
  posterUpload: boolean;                           // persisted: the Moderator (📎 clip) upload feature is enabled repo-wide
  userUpload: boolean;                             // persisted: the User (📁 folder) upload feature is enabled repo-wide
  aiShown: boolean;                                // 🤖 "AI question" feature on: show the robot prompt icon; ➕ generates an answer
  // Owner/admin inline card controls on the collection cards (bare icons):
  canEdit: boolean;
  isAdmin: boolean;                                // admin can remove any User upload; the OP cannot
  preview: boolean;                                // "View as" preview — read-only, no edit persists
  imageGen: boolean;                               // "Suggest AI": show the 🖼️ per-card picture button
  applyRepo: (repo: RepoSpec) => void;             // reconcile a server-returned repo (normal-user attach)
  editField: (id: string, patch: Partial<RepoCard>) => void;        // ✎ edit title/subtitle in place
  distortTitle: (card: RepoCard) => Promise<void>;                  // 🎨 AI rewrite the title
  distortText: (card: RepoCard) => Promise<void>;                  // 🎨 AI rewrite the description
  addSubcard: (id: string) => void;                                // ⚙️ add a card inside
  addAnswerChild: (card: RepoCard) => Promise<void>;               // 🤖 add an AI-answer card inside (when AI feature on + prompt set)
  addAnswerSibling: (card: RepoCard) => Promise<void>;             // 🤖 add an AI-answer card at THIS level (⚙️ when AI feature on + prompt set)
  addSibling: (id: string) => void;                                // ➕ add a card at this level
  sortCards: (list: RepoCard[]) => RepoCard[];                     // apply the ascending/descending/random order
  moveCard: (id: string, delta: number) => void;                   // ▲ / ▼ reorder within its level
  setIcon: (id: string, patch: Partial<RepoCard>) => void;         // set/clear image & emoji icon
  numberCard: (id: string) => void;                                // 🔢 icon = this card's number
  deleteCard: (id: string) => void;                                // 🗑 delete
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}

// ---- immutable tree helpers (operate by card id) --------------------------
let _seq = 0;
const newId = () => `c${Date.now().toString(36)}${(_seq++).toString(36)}`;
const blankCard = (kind: 'card' | 'section' = 'card'): RepoCard => ({ id: newId(), kind, title: kind === 'section' ? 'New section' : 'New card', links: [], createdAt: new Date().toISOString() });

function mapTree(cards: RepoCard[], id: string, fn: (c: RepoCard) => RepoCard): RepoCard[] {
  return cards.map((c) => {
    if (c.id === id) return fn(c);
    if (c.children?.length) return { ...c, children: mapTree(c.children, id, fn) };
    return c;
  });
}
function removeFromTree(cards: RepoCard[], id: string): RepoCard[] {
  return cards.filter((c) => c.id !== id).map((c) => (c.children?.length ? { ...c, children: removeFromTree(c.children, id) } : c));
}
function addChildTo(cards: RepoCard[], parentId: string, child: RepoCard): RepoCard[] {
  return cards.map((c) => {
    if (c.id === parentId) return { ...c, children: [...(c.children || []), child] };
    if (c.children?.length) return { ...c, children: addChildTo(c.children, parentId, child) };
    return c;
  });
}
// Move a card among its siblings by `delta` (-1 up/left, +1 down/right). Finds
// whichever level the id lives on and swaps it with its neighbour there.
function moveInTree(cards: RepoCard[], id: string, delta: number): RepoCard[] {
  const idx = cards.findIndex((c) => c.id === id);
  if (idx !== -1) {
    const j = idx + delta;
    if (j < 0 || j >= cards.length) return cards;   // already at an edge
    const n = [...cards]; [n[idx], n[j]] = [n[j], n[idx]]; return n;
  }
  return cards.map((c) => (c.children?.length ? { ...c, children: moveInTree(c.children, id, delta) } : c));
}

// Insert a sibling right after the given id (same level).
function addSiblingAfter(cards: RepoCard[], id: string, sib: RepoCard): RepoCard[] {
  const out: RepoCard[] = [];
  let inserted = false;
  for (const c of cards) {
    const cc = c.children?.length ? { ...c, children: addSiblingAfter(c.children, id, sib) } : c;
    out.push(cc);
    if (c.id === id) { out.push(sib); inserted = true; }
  }
  // If it was nested (already inserted deeper) we leave as-is; if top-level match, done.
  return inserted ? out : out;
}

// Append a sibling at the END of the level the id lives on (bottom of that list),
// so new cards stack in order: Unit 1, Unit 2… / Week 1, Week 2…
function addSiblingEnd(cards: RepoCard[], id: string, sib: RepoCard): RepoCard[] {
  if (cards.some((c) => c.id === id)) return [...cards, sib];
  return cards.map((c) => (c.children?.length ? { ...c, children: addSiblingEnd(c.children, id, sib) } : c));
}

// ---- per-user completion (localStorage) -----------------------------------
function useDone(slug: string) {
  const key = 'sl_repo_done';
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { const all = JSON.parse(localStorage.getItem(key) || '{}'); setDone(all[slug] || {}); } catch { /* ignore */ }
  }, [slug]);
  const toggle = (id: string) => setDone((d) => {
    const n = { ...d }; if (n[id]) delete n[id]; else n[id] = true;
    try { const all = JSON.parse(localStorage.getItem(key) || '{}'); all[slug] = n; localStorage.setItem(key, JSON.stringify(all)); } catch { /* ignore */ }
    return n;
  });
  return { done, toggle };
}

const isImg = (v: any) => isRenderableImage(v);
// Attachment button labels are capped so a card's button row stays tidy.
const cap15 = (s: string) => (s.length > 15 ? s.slice(0, 14) + '…' : s);

// One owner/admin-cycled mode per card. 'enabled' means the field is cleared.
//   status modes (assigned…rejected): a coloured chip, card stays usable
//   disabled: greyed + unclickable for viewers (full content still shown)
//   preview:  viewers see only the name + description, greyed + unclickable
type CardMode = 'enabled' | 'assigned' | 'pending' | 'approved' | 'rejected' | 'disabled' | 'preview';
const MODE_ORDER: CardMode[] = ['enabled', 'assigned', 'pending', 'approved', 'rejected', 'disabled', 'preview'];
const STATUS_META: Record<string, { label: string; bg: string }> = {
  assigned: { label: '📋 Assigned', bg: '#5c80bc' },
  pending: { label: '⏳ Pending', bg: '#f0a202' },
  approved: { label: '✅ Approved', bg: '#1f8b4c' },
  rejected: { label: '⛔ Rejected', bg: '#c0392b' },
};
// The icon + words shown on the owner/admin cycle button for each mode.
const MODE_BTN: Record<CardMode, string> = {
  enabled: '🟢', assigned: '📋', pending: '⏳', approved: '✅', rejected: '⛔', disabled: '🚫', preview: '👓',
};
// Short label shown next to the emoji on the assignment-status button, so every
// card reads clearly (not just a bare dot) when Assignment is On.
const MODE_LABEL: Record<CardMode, string> = {
  enabled: 'Set status', assigned: 'Assigned', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', disabled: 'Disabled', preview: 'Preview',
};
const modeOf = (m?: string): CardMode => (MODE_ORDER.includes(m as CardMode) ? (m as CardMode) : 'enabled');
const nextMode = (m?: string): CardMode => MODE_ORDER[(MODE_ORDER.indexOf(modeOf(m)) + 1) % MODE_ORDER.length];

// Number → keycap emoji(s): 0 → 0️⃣, 10 → 1️⃣0️⃣ (one keycap per digit).
const toKeycaps = (n: number) => String(Math.max(0, Math.floor(n))).split('').map((d) => `${d}️⃣`).join('');

// A curated pool for the 🎲 "random emoji icon" button — expressive, on-theme.
const RANDOM_EMOJIS = ['📕', '📗', '📘', '📙', '📚', '📝', '✏️', '📌', '🔖', '🗂️', '📁', '📅', '⭐', '🌟', '✨', '🔥', '💡', '🎯', '🚀', '🎨', '🎵', '🎬', '🎓', '🧩', '🧠', '🔬', '🔭', '🧪', '🌍', '🌱', '🌳', '🍎', '☕', '🏆', '🥇', '🎉', '🎁', '💎', '🔑', '🛠️', '📊', '📈', '🗺️', '🧭', '⏰', '📷', '🎥', '💻', '📱', '🐣', '🐱', '🦊', '🐼', '🦉', '🦋', '🐢', '🍀', '🌈', '⚡', '❄️', '🔔', '🎈', '🧸', '🍕', '🍩', '🧁', '🍓', '🥑', '🌺', '🌻', '🍁'];
const randomEmoji = (exclude?: string) => {
  let e = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];
  for (let i = 0; i < 6 && e === exclude; i++) e = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];
  return e;
};
// A STABLE emoji derived from a seed (a card id) — same card always gets the same
// emoji across renders. Used for the default icon past the single-digit keycaps.
const stableEmoji = (seed: string) => {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) { x ^= seed.charCodeAt(i); x = Math.imul(x, 16777619); }
  return RANDOM_EMOJIS[(x >>> 0) % RANDOM_EMOJIS.length];
};
// The number the 🔢 button assigns a card: top-level cards are always 0; cards
// nested inside another are numbered 1,2,3… by their position among siblings.
function cardNumber(cards: RepoCard[], id: string, top = true): number | null {
  const i = cards.findIndex((c) => c.id === id);
  if (i !== -1) return top ? 0 : i + 1;
  for (const c of cards) {
    if (c.children?.length) { const r = cardNumber(c.children, id, false); if (r != null) return r; }
  }
  return null;
}

// Each card's position WITHIN ITS OWN LEVEL (0-based, matching the number-box
// look the user asked for), for every level of the tree. Used as the DEFAULT
// icon so cards read 0, 1, 2 … per level without anyone pressing 🔢; a custom
// icon or an uploaded image still wins, and reordering re-numbers automatically.
function buildLevelIndex(cards: RepoCard[], out: Record<string, number> = {}): Record<string, number> {
  cards.forEach((c, i) => { out[c.id] = i; if (c.children?.length) buildLevelIndex(c.children, out); });
  return out;
}

// ---- user contributions on a "collect" card ------------------------------
// Any signed-in user can add their own entry (note + optional link + optional
// image/file) inside a collect card — e.g. upload payment proof for their month.
// Entries are stored server-side; each user sees their own, the owner sees all.
function Contribute({ card, ctx }: { card: RepoCard; ctx: ViewCtx }) {
  const mine = ctx.entriesByCard[card.id] || [];
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!note.trim() && !link.trim() && !image) return;
    setBusy(true);
    try {
      await API.post('/api/tools/entries', { slug: ctx.slug, data: { __repoCardId: card.id, note: note.trim(), link: link.trim(), image } });
      setNote(''); setLink(''); setImage(''); setOpen(false); ctx.onAdded();
    } catch (e: any) { alert(e?.message || 'Could not submit.'); }
    setBusy(false);
  };

  // Owner/admin can move a submission between the card's custom status labels.
  const statuses = card.statuses || [];
  const setStatus = async (entryId: string, status: string) => {
    try { await API.put('/api/tools/entries', { slug: ctx.slug, entryId, status }); ctx.onAdded(); }
    catch (e: any) { alert(e?.message || 'Could not update status.'); }
  };

  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed var(--ink)', paddingTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>📥 {ctx.isOwner ? 'Submissions' : 'Your submissions'}{mine.length ? ` (${mine.length})` : ''}</span>
        <button className="btn small blue" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : '＋ Add your entry'}</button>
      </div>
      {card.collectPrompt && <p style={{ fontSize: 12, opacity: 0.7, margin: '4px 0 0' }}>{card.collectPrompt}</p>}

      {open && (
        <div className="card alt" style={{ padding: '8px 10px', marginTop: 8 }}>
          <input value={note} placeholder="Note / label (e.g. March payment)" onChange={(e) => setNote(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 6 }} />
          <input value={link} placeholder="Link (optional)" onChange={(e) => setLink(e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 6 }} />
          <ImageField label="Upload proof / image (optional)" value={image} onChange={setImage} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn small green" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Submit'}</button>
            <button className="btn small ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {mine.map((e: any) => (
            <div key={e.id} className="card" style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: 11, opacity: 0.65, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>@{e.username} · {timeAgo(e.createdAt)}</span>
                {e.status && e.status !== 'active' && <span className="btn small ghost" style={{ padding: '0 6px', pointerEvents: 'none' }}>{e.status}</span>}
                {ctx.isOwner && statuses.length > 0 && (
                  <select value={statuses.includes(e.status) ? e.status : ''} onChange={(ev) => setStatus(e.id, ev.target.value)} style={{ fontSize: 11 }}>
                    <option value="">set status…</option>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              {e.data?.note && <div style={{ fontSize: 13 }}>{e.data.note}</div>}
              {isImg(e.data?.image) && <img src={e.data.image} alt="" loading="lazy" style={{ maxWidth: 180, marginTop: 4, borderRadius: 6, border: '2px solid var(--ink)' }} />}
              {e.data?.link && <div style={{ marginTop: 4 }}><a className="btn small blue" href={e.data.link} target="_blank" rel="noreferrer">🔗 Open</a></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- read-only card ------------------------------------------------------
function CardView({ card, depth, defaultDisplay, ctx }: {
  card: RepoCard; depth: number; defaultDisplay: 'bars' | 'grid'; ctx: ViewCtx;
}) {
  const { done, toggle } = ctx;
  const isSection = card.kind === 'section';
  const kids = (card.children || []).filter((k) => ctx.canEdit || !k.hidden);
  const childDisplay = card.layout || defaultDisplay;

  const body = (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {isImg(card.image) && (
          <img src={card.image} alt="" loading="lazy"
            style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ink)', flex: '0 0 auto' }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          {card.title && <div style={{ fontWeight: 700, fontSize: depth === 0 ? 17 : 15 }}>{card.title}</div>}
          {card.subtitle && <div style={{ fontSize: 13, opacity: 0.72 }}>{card.subtitle}</div>}
        </div>
        {card.completable && (
          <button className={`btn small ${done[card.id] ? 'green' : 'ghost'}`} onClick={() => toggle(card.id)}
            title={done[card.id] ? 'Completed — click to undo' : 'Mark complete'} style={{ flex: '0 0 auto' }}>
            {done[card.id] ? '✓ Done' : '○ Mark done'}
          </button>
        )}
        {/* Favorite this card (feeds the ★ / liked-by-admin / OP filters). */}
        <button onClick={() => ctx.toggleFav(card.id)} title={ctx.favs[card.id] ? 'Unfavorite' : 'Favorite'}
          style={{ flex: '0 0 auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: ctx.favs[card.id] ? '#f0a202' : 'var(--ink)', opacity: ctx.favs[card.id] ? 1 : 0.45 }}>{ctx.favs[card.id] ? '★' : '☆'}</button>
      </div>
      {card.text && <div style={{ fontSize: 14, marginTop: 6 }}><RichText text={card.text} /></div>}
      {!!card.links?.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {card.links.map((l, i) => (
            <a key={i} className={`btn small ${l.color === 'green' ? 'green' : 'blue'}`} href={l.url} target="_blank" rel="noreferrer">🔗 {cap15(l.label || 'Open')}</a>
          ))}
        </div>
      )}
      {kids.length > 0 && (
        <div style={childDisplay === 'grid'
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10, marginTop: 10 }
          : { display: 'grid', gap: 10, marginTop: 10 }}>
          {kids.map((k) => <CardView key={k.id} card={k} depth={depth + 1} defaultDisplay={childDisplay} ctx={ctx} />)}
        </div>
      )}
      {card.collect && <Contribute card={card} ctx={ctx} />}
    </>
  );

  if (isSection) {
    return (
      <section style={{ marginTop: depth === 0 ? 6 : 0 }}>
        {(card.title || card.subtitle) && (
          <div style={{ borderBottom: '2px dashed var(--ink)', paddingBottom: 4, marginBottom: 8 }}>
            {card.title && <div style={{ fontWeight: 800, fontSize: 16 }}>{card.title}</div>}
            {card.subtitle && <div style={{ fontSize: 13, opacity: 0.72 }}>{card.subtitle}</div>}
          </div>
        )}
        {card.text && <div style={{ fontSize: 14, marginBottom: 8 }}><RichText text={card.text} /></div>}
        <div style={childDisplay === 'grid'
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }
          : { display: 'grid', gap: 10 }}>
          {kids.map((k) => <CardView key={k.id} card={k} depth={depth + 1} defaultDisplay={childDisplay} ctx={ctx} />)}
        </div>
        {card.collect && <Contribute card={card} ctx={ctx} />}
      </section>
    );
  }
  return <div className="card" style={{ padding: '12px 14px' }}>{body}</div>;
}

// ---- one editable field: type it OR regenerate with AI --------------------
function EditField({ label, field, value, multiline, slug, context, onChange }: {
  label: string; field: string; value: string; multiline?: boolean; slug: string; context: string;
  onChange: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [instr, setInstr] = useState('');
  const [open, setOpen] = useState(false);
  const regen = async () => {
    setBusy(true);
    try {
      const r = await API.post('/api/tools/repo/ai', { slug, op: 'field', field, current: value, instruction: instr, context });
      if (r?.text) onChange(r.text);
      else if (r?.error) alert(r.error);
      setOpen(false); setInstr('');
    } catch { alert('Could not reach the AI. Type it instead.'); }
    setBusy(false);
  };
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>{label}</span>
        <button type="button" className="btn small ghost" title="Rewrite this with AI" onClick={() => setOpen((o) => !o)} style={{ padding: '0 6px' }}>🪄 AI</button>
        <span style={{ fontSize: 10, opacity: 0.5 }}>type it, or regenerate</span>
      </div>
      {multiline
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', minHeight: 54, fontSize: 13 }} />
        : <input value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', fontSize: 14 }} />}
      {open && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <input value={instr} placeholder="How should the AI write it? (optional)" onChange={(e) => setInstr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') regen(); }} style={{ flex: '1 1 180px', fontSize: 12 }} />
          <button type="button" className="btn small green" disabled={busy} onClick={regen}>{busy ? '…' : 'Generate'}</button>
          <button type="button" className="btn small ghost" onClick={() => { setOpen(false); setInstr(''); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ---- editable card -------------------------------------------------------
function CardEdit({ card, depth, slug, context, siblingLayout, idx, count, patch, addChild, addSection, remove, move }: {
  card: RepoCard; depth: number; slug: string; context: string;
  siblingLayout: 'bars' | 'grid'; idx: number; count: number;
  patch: (id: string, p: Partial<RepoCard>) => void;
  addChild: (id: string) => void; addSection: (id: string) => void; remove: (id: string) => void;
  move: (id: string, delta: number) => void;
}) {
  const [imgBusy, setImgBusy] = useState(false);
  const links = card.links || [];
  const setLink = (i: number, p: Partial<RepoLink>) => patch(card.id, { links: links.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const addLink = () => patch(card.id, { links: [...links, { label: '', url: '' }] });
  const rmLink = (i: number) => patch(card.id, { links: links.filter((_, j) => j !== i) });
  // Attach / replace an actual document or file for a link (blob store, data-URL
  // fallback). The label defaults to the file name.
  const uploadFile = async (i: number, file: File) => {
    if (file.size > 25_000_000) { alert('Please pick a file under 25 MB.'); return; }
    try {
      let url = '';
      try { const up = await API.upload('/api/upload', file); if (up?.url) url = up.url; } catch { /* fall back to data URL */ }
      if (!url) url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.readAsDataURL(file); });
      setLink(i, { url, label: links[i]?.label || file.name });
    } catch { alert('Could not attach the file.'); }
  };

  const aiImage = async () => {
    setImgBusy(true);
    try {
      const r = await API.post('/api/tools/repo/ai', { slug, op: 'image', instruction: card.title || card.text || 'icon', title: card.title });
      if (r?.image) patch(card.id, { image: r.image });
      else if (r?.error) alert(r.error);
    } catch { alert('Image generation failed.'); }
    setImgBusy(false);
  };

  return (
    <div className="card" style={{ padding: '10px 12px', borderStyle: card.kind === 'section' ? 'dashed' : 'solid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.55 }}>{card.kind === 'section' ? '▤ SECTION' : '▢ CARD'}{depth > 0 ? ` · L${depth + 1}` : ''}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Reorder among siblings — arrows follow the layout (bars ↑↓, grid ←→). */}
          {count > 1 && (
            <>
              <button className="btn small ghost" title="Move earlier" disabled={idx === 0} onClick={() => move(card.id, -1)}>{siblingLayout === 'grid' ? '←' : '↑'}</button>
              <button className="btn small ghost" title="Move later" disabled={idx === count - 1} onClick={() => move(card.id, 1)}>{siblingLayout === 'grid' ? '→' : '↓'}</button>
            </>
          )}
          <button className="btn small ghost" title="Delete" onClick={() => remove(card.id)}>🗑</button>
        </div>
      </div>

      <EditField label="TITLE" field="title" value={card.title || ''} slug={slug} context={context} onChange={(v) => patch(card.id, { title: v })} />
      <EditField label="SUBTITLE" field="subtitle" value={card.subtitle || ''} slug={slug} context={context} onChange={(v) => patch(card.id, { subtitle: v })} />
      <EditField label="TEXT" field="text" value={card.text || ''} multiline slug={slug} context={context} onChange={(v) => patch(card.id, { text: v })} />

      {/* Icon image: upload / URL / AI-generate */}
      <div style={{ marginBottom: 6 }}>
        <ImageField label="Icon image (optional)" value={card.image || ''} onChange={(v) => patch(card.id, { image: v })} />
        <button type="button" className="btn small ghost" disabled={imgBusy} onClick={aiImage}>{imgBusy ? 'Generating…' : '🪄 Generate icon with AI'}</button>
      </div>

      {/* Links */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3 }}>ATTACHMENTS — link or uploaded file</div>
        {links.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <input value={l.label} placeholder="Button label" onChange={(e) => setLink(i, { label: e.target.value })} style={{ flex: '1 1 100px', fontSize: 13 }} />
            <input value={l.url} placeholder="https://… or upload →" onChange={(e) => setLink(i, { url: e.target.value })} style={{ flex: '2 1 160px', fontSize: 13 }} />
            <label className="btn small ghost" style={{ cursor: 'pointer' }} title="Attach / replace a document or file">📎
              <input type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(i, f); e.currentTarget.value = ''; }} />
            </label>
            <button className="btn small ghost" onClick={() => rmLink(i)}>✕</button>
          </div>
        ))}
        <button className="btn small ghost" onClick={addLink}>＋ Add attachment</button>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={!!card.completable} onChange={(e) => patch(card.id, { completable: e.target.checked })} />
          Completion toggle
        </label>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center' }} title="Let any user add their own entry inside this card (e.g. upload payment proof)">
          <input type="checkbox" checked={!!card.collect} onChange={(e) => patch(card.id, { collect: e.target.checked })} />
          User uploads / entries
        </label>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          Children as
          <select value={card.layout || 'inherit'} onChange={(e) => patch(card.id, { layout: e.target.value === 'inherit' ? undefined : (e.target.value as any) })}>
            <option value="inherit">inherit</option><option value="bars">bars</option><option value="grid">grid</option>
          </select>
        </label>
      </div>
      {card.collect && (
        <div style={{ marginTop: 6 }}>
          <input value={card.collectPrompt || ''} placeholder="Instruction for users (e.g. Upload your payment proof for this month)"
            onChange={(e) => patch(card.id, { collectPrompt: e.target.value })} style={{ width: '100%', fontSize: 13, marginBottom: 6 }} />
          <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 13, marginBottom: 4 }} title="Let you (owner/admin) move each submission between statuses, e.g. pending → paid">
            <input type="checkbox" checked={!!card.statuses?.length}
              onChange={(e) => patch(card.id, { statuses: e.target.checked ? (card.statuses?.length ? card.statuses : ['pending', 'done']) : undefined })} />
            Allow status changes (pending → paid / graded …)
          </label>
          {!!card.statuses?.length && (
            <input value={(card.statuses || []).join(', ')} placeholder="Status labels, comma-separated (e.g. pending, paid, late)"
              onChange={(e) => patch(card.id, { statuses: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} style={{ width: '100%', fontSize: 13 }} />
          )}
        </div>
      )}

      {/* Nested children (recursive edit) */}
      {!!card.children?.length && (
        <div style={{ display: 'grid', gap: 8, marginTop: 8, marginLeft: 10, borderLeft: '2px dotted var(--ink)', paddingLeft: 8 }}>
          {card.children.map((k, ci) => (
            <CardEdit key={k.id} card={k} depth={depth + 1} slug={slug} context={context}
              siblingLayout={card.layout || siblingLayout} idx={ci} count={card.children!.length}
              patch={patch} addChild={addChild} addSection={addSection} remove={remove} move={move} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn small blue" onClick={() => addChild(card.id)}>＋ Add card (inside)</button>
        <button className="btn small ghost" onClick={() => addSection(card.id)}>＋ Add section (below)</button>
      </div>
    </div>
  );
}

// A collection card rendered through the SAME shared CardShell used by the home
// gallery — adapted to a repo card: title, description, cover image, a favorite
// ★, and the attachments as footer buttons. Owner/admin edit IN PLACE: a ✎ pencil
// sits next to the title (with 🎨 to AI-rewrite it) and another ✎ next to the
// subtitle, so you edit the thing you click. Card-level actions stay small and
// bare: ⚙️ add a sibling, ➕ add a card inside, 🗑 delete. In rows view all nested
// cards are shown; in grid view a card is shown alone (click it to flip to rows).
function RepoCollectionCard({ card, view, ctx, switchToRows, nested }: { card: RepoCard; view: 'grid' | 'row'; ctx: ViewCtx; switchToRows?: () => void; nested?: boolean }) {
  // Hidden children vanish for normal viewers; owner/admin still see them greyed.
  const kids = (card.children || []).filter((k) => ctx.canEdit || !k.hidden);
  const links = card.links || [];
  const dimmed = !!card.hidden && ctx.canEdit;   // owner/admin preview of a hidden card
  // The owner/admin-cycled card mode. Disabled/Preview grey the card and block
  // interaction for normal viewers; Preview additionally hides everything but the
  // name + description. Owner/admin always see and use the whole card.
  const mode = modeOf(card.mode);
  const isStatus = mode === 'assigned' || mode === 'pending' || mode === 'approved' || mode === 'rejected';
  const blocked = (mode === 'disabled' || mode === 'preview') && !ctx.canEdit;
  const previewBlocked = mode === 'preview' && !ctx.canEdit;
  // Icon precedence: a custom icon the user set wins; otherwise an uploaded card
  // image shows; otherwise the DEFAULT is the card's number within its level
  // (0…9 as a single keycap). Past the 9th (index ≥ 10) a two-digit keycap looks
  // cramped in the box, so we show ONE stable random emoji instead.
  const levelIdx = ctx.levelIndex[card.id] ?? 0;
  const defaultIcon = levelIdx < 10 ? toKeycaps(levelIdx) : stableEmoji(card.id);
  const iconNode = card.icon
    ? <span aria-hidden>{card.icon}</span>
    : (isImg(card.image) ? undefined : <span aria-hidden>{defaultIcon}</span>);
  const isFav = !!ctx.favs[card.id];
  const [collapsed, setCollapsed] = useState(false);   // hide this card's nested cards
  // Follow the repo-wide "collapse / expand all" broadcast (fires only when the
  // nonce changes, so a user's own per-card toggle afterwards is preserved).
  useEffect(() => { setCollapsed(ctx.collapseCmd.on); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ctx.collapseCmd.n]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSub, setEditingSub] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title || '');
  const [subDraft, setSubDraft] = useState(card.text || '');
  const [distorting, setDistorting] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachColor, setAttachColor] = useState<'blue' | 'green'>('blue');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [attachBusy, setAttachBusy] = useState(false); // 📎 file upload in progress
  const [genBusy, setGenBusy] = useState(false);       // 🖼️ AI product-image generation
  const [showImg, setShowImg] = useState(false);       // 🖼️ image popup open
  const [copied, setCopied] = useState(false);         // 📋 copy title+description feedback
  const [aiOpen, setAiOpen] = useState(false);         // 🤖 AI-question prompt editor open
  const [aiDraft, setAiDraft] = useState('');          // 🤖 prompt draft
  const [aiBusy, setAiBusy] = useState(false);         // 🤖 generating an answer child
  const editing = editingTitle || editingSub;

  // Copy this card's title + description to the clipboard (everyone can use it).
  const copyCard = async () => {
    const text = `${card.title || 'Untitled'}${card.text ? `\n${card.text}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  };

  // PREVIEW mode for a normal viewer: only the name + description, greyed and
  // fully unclickable — nothing else (no image, attachments, actions or nesting).
  if (previewBlocked) {
    return (
      <div style={{ opacity: 0.5, pointerEvents: 'none' }}>
        <CardShell view={view} title={card.title || 'Untitled'} subtitle={card.text || ''} />
      </div>
    );
  }

  // ---- attachments: two roles. POSTER (blue) — the owner/admin posts a file or
  // link everyone can open/download. USER (green) — any signed-in viewer uploads
  // their own; only they (or an admin) can remove it (the OP cannot). All changes
  // go through the guarded /api/tools/repo/attach endpoint, which stamps `by` and
  // enforces the permissions.
  // The single link each role's widget manages: the poster (blue) link, and MY
  // own user (green) link. The widget turns INTO this link once submitted.
  const posterLinkIdx = (() => { for (let i = links.length - 1; i >= 0; i--) if (links[i].color !== 'green') return i; return -1; })();
  const myUserLinkIdx = links.findIndex((l) => l.color === 'green' && l.by === ctx.me);
  // Who may EDIT each slot (open the editor to add / replace / delete):
  //  • 📎 clip = the Moderator's shared link — owner/admin only. They may add when
  //    the repo-wide feature is on, and may always manage one that already exists.
  //  • 📁 folder = a user's OWN link — any signed-in person. They may add when the
  //    feature is on, and may always manage their own existing one.
  // A per-card override (posterOff / userOff) can turn a slot off for one card.
  const canPoster = ctx.canEdit && !card.posterOff && (ctx.posterUpload || posterLinkIdx >= 0);
  const canUser = !!ctx.me && !card.userOff && (ctx.userUpload || myUserLinkIdx >= 0);
  const attachServer = async (payload: any) => {
    // NOTE: uploads are a real user action (turning in a document), so they work
    // even while an admin is previewing as a User/Moderator — that's how you test
    // the submission flow. Only moderator edits (status cycle, card content) are
    // held read-only in preview, via saveCards.
    try { const r = await API.post('/api/tools/repo/attach', { slug: ctx.slug, cardId: card.id, ...payload }); if (r?.repo) ctx.applyRepo(r.repo); else if (r?.error) alert(r.error); } catch { alert('Could not update the attachment.'); }
  };
  const removeLinkAt = (index: number) => attachServer({ action: 'remove', index });
  // The slot the inline editor is currently managing (blue = the Moderator link,
  // green = MY own upload).
  const slotIdx = () => (attachColor === 'green' ? myUserLinkIdx : posterLinkIdx);
  // Save a link/file into the current slot: if it already holds one, REPLACE it
  // (remove the old, add the new) so a slot only ever carries a single attachment.
  const commitLink = async (label: string, url: string) => {
    const idx = slotIdx();
    if (idx >= 0) await attachServer({ action: 'remove', index: idx });
    await attachServer({ action: 'add', color: attachColor, link: { label: label.slice(0, 15) || 'Link', url } });
  };
  // Open the inline editor for a role — pre-filled with the existing values when
  // editing. Clicking the same role's icon again closes it.
  const openAttach = (color: 'blue' | 'green', existingIdx: number) => {
    if (attaching && attachColor === color) { setAttaching(false); return; }
    setAttachColor(color);
    if (existingIdx >= 0) { setLinkLabel(links[existingIdx].label || ''); setLinkUrl(links[existingIdx].url || ''); }
    else { setLinkLabel(''); setLinkUrl(''); }
    setAttaching(true);
  };
  // 📎 clip = the Moderator slot. A moderator opens the editor (add / replace /
  // delete). A viewer with a posted attachment opens it directly.
  const clipAction = () => {
    if (canPoster) openAttach('blue', posterLinkIdx);
    else if (posterLinkIdx >= 0) openInNewTab(links[posterLinkIdx].url);
  };
  // 📁 folder = the current user's own upload. The uploader opens the editor
  // (add / replace / delete); anyone else with the link opens it directly.
  const folderAction = () => {
    if (canUser) openAttach('green', myUserLinkIdx);
    else if (myUserLinkIdx >= 0) openInNewTab(links[myUserLinkIdx].url);
  };
  // 🗑 delete the attachment in the currently-open slot (from inside the editor).
  const deleteSlot = async () => { const idx = slotIdx(); if (idx >= 0) await attachServer({ action: 'remove', index: idx }); setLinkLabel(''); setLinkUrl(''); setAttaching(false); };
  const addLink = () => {
    let url = linkUrl.trim(); if (!url) return;
    // A bare domain like "example.com" is dropped by the server sanitizer (which
    // keeps only http(s):// or /… URLs), which made the button vanish a second
    // after it appeared. Give it a scheme so it sticks.
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) url = 'https://' + url;
    commitLink(linkLabel.trim(), url);
    setLinkLabel(''); setLinkUrl(''); setAttaching(false);
  };
  // 📎 attach a real file: upload to blob storage (falls back to a data: URL),
  // then save it into the slot just like a link.
  const attachUpload = async (f: File) => {
    if (f.size > 25_000_000) { alert('Please pick a file under 25 MB.'); return; }
    setAttachBusy(true);
    try {
      let url = '';
      try { const up = await API.upload('/api/upload', f); if (up?.url) url = up.url; } catch { /* data-URL fallback */ }
      if (!url) url = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.readAsDataURL(f); });
      await commitLink(f.name, url);
      setLinkLabel(''); setLinkUrl(''); setAttaching(false);
    } catch { alert('Could not attach the file.'); }
    setAttachBusy(false);
  };

  // ---- picture controls (same feature as the tool gallery): AI-generate,
  // custom prompt / distort with a palette, or upload — right in the card's image.
  const genImage = async (instruction?: string) => {
    setImgBusy(true);
    try {
      const r = await API.post('/api/tools/repo/ai', { slug: ctx.slug, op: 'image', instruction: instruction || card.title || card.text || 'icon', title: card.title });
      if (r?.image) ctx.setIcon(card.id, { image: r.image, icon: undefined });
      else if (r?.error) alert(r.error);
    } catch { alert('Image generation failed.'); }
    setImgBusy(false);
  };
  const customImage = () => { const p = window.prompt('Describe the picture to generate:'); if (p && p.trim()) genImage(p.trim()); };

  // ---- 🖼️ "Suggest AI" product picture (separate from the card ICON above).
  // Owner/admin generate a picture of the item; it is SAVED on the card so every
  // future viewer sees it, until 💦 clears it. Normal viewers can only VIEW an
  // already-generated picture — they cannot request one.
  const hasGen = isImg(card.genImage);
  // Generate (or regenerate) the AI "Suggest AI" picture (genImage) for this card.
  const genFramePicture = async () => {
    if (!ctx.canEdit) return;                             // only owner/admin generate
    setGenBusy(true);
    try {
      const prompt = `${card.title || 'item'}${card.text ? ' — ' + card.text : ''}`.slice(0, 400);
      const r = await API.post('/api/tools/repo/ai', { slug: ctx.slug, op: 'image', instruction: prompt, title: card.title });
      if (r?.image) { ctx.editField(card.id, { genImage: r.image }); setShowImg(true); }
      else if (r?.error) alert(r.error);
    } catch { alert('Could not generate a picture.'); }
    setGenBusy(false);
  };
  // Click the 🖼️ button: if a picture exists, open the popup (view it, and — for
  // owner/admin — Regenerate or Delete it there). If none exists, generate one.
  const frameClick = () => { if (hasGen) { setShowImg(true); return; } genFramePicture(); };
  const deleteImage = () => { if (ctx.canEdit) { ctx.editField(card.id, { genImage: undefined }); setShowImg(false); } };
  const regenImage = async () => { setShowImg(false); await genFramePicture(); };
  const uploadImage = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 25_000_000) { alert('Please pick a file under 25 MB.'); return; }
      setImgBusy(true);
      try {
        let url = '';
        try { const up = await API.upload('/api/upload', f); if (up?.url) url = up.url; } catch { /* data-URL fallback */ }
        if (!url) url = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.readAsDataURL(f); });
        ctx.setIcon(card.id, { image: url, icon: undefined });
      } catch { alert('Could not upload the picture.'); }
      setImgBusy(false);
    };
    inp.click();
  };
  const eat = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  // Floated over an existing image (overlay) and inside the empty image box
  // (placeholder). CardShell only draws these in GRID view, which is what we want.
  const imgOverlay = ctx.canEdit ? (
    <span style={{ position: 'absolute', top: 6, right: 8, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button title="Custom picture — describe what to show" style={overlayIcon} disabled={imgBusy} onClick={eat(customImage)}>✎</button>
      <button title="Generate / distort the picture with AI" style={overlayIcon} disabled={imgBusy} onClick={eat(() => genImage())}>{imgBusy ? '…' : '🎨'}</button>
      <button title="Upload a picture" style={overlayIcon} disabled={imgBusy} onClick={eat(uploadImage)}>📎</button>
    </span>
  ) : undefined;
  const imgPlaceholder = ctx.canEdit ? (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      <button className="btn small ghost" disabled={imgBusy} onClick={eat(() => genImage())}>{imgBusy ? 'Generating…' : '🎨 Generate'}</button>
      <button className="btn small ghost" disabled={imgBusy} onClick={eat(customImage)}>✎ Custom</button>
      <button className="btn small ghost" disabled={imgBusy} onClick={eat(uploadImage)}>📎 Upload</button>
    </span>
  ) : undefined;
  // Open a URL in a real foreground new tab. Passing a features string (e.g.
  // 'noopener') makes browsers open a background POPUP window instead — the cause
  // of "a window appears but you stay on the page" — so pass NO features and null
  // the opener for the same security.
  const openInNewTab = (url: string) => { try { const w = window.open(url, '_blank'); if (w) { try { w.opener = null; } catch { /* ignore */ } try { w.focus(); } catch { /* ignore */ } } } catch { /* ignore */ } };
  const openLink = links[0]?.url ? () => openInNewTab(links[0].url) : undefined;
  // In GRID view a card shows only itself; clicking a card that has nested cards
  // flips the whole section to the horizontal (rows) view so the tree is visible.
  // Elsewhere a click opens the card's first attachment.
  const open = editing ? undefined
    : (view === 'grid' && kids.length && switchToRows) ? switchToRows
    : openLink;

  const openTitle = () => { setTitleDraft(card.title || ''); setEditingSub(false); setEditingTitle(true); };
  const openSub = () => { setSubDraft(card.text || ''); setEditingTitle(false); setEditingSub(true); };
  const saveTitle = () => { ctx.editField(card.id, { title: titleDraft.trim() || 'Untitled' }); setEditingTitle(false); };
  const saveSub = () => { ctx.editField(card.id, { text: subDraft.trim() }); setEditingSub(false); };
  const distort = async () => { setDistorting(true); try { await ctx.distortTitle(card); } finally { setDistorting(false); } };
  const distortSub = async () => { setDistorting(true); try { await ctx.distortText(card); } finally { setDistorting(false); } };
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const editorRow = { display: 'inline-flex', gap: 6, marginLeft: 8, verticalAlign: 'middle', alignItems: 'center' } as const;

  // Pencil (+ palette) rendered RIGHT NEXT TO the title; when editing, the input
  // takes its place inline.
  const afterTitle = ctx.canEdit ? (editingTitle ? (
    <span style={editorRow} onClick={stop}>
      <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
        style={{ fontSize: 14, minWidth: 120 }} onClick={stop} />
      <button className="btn small green" onClick={saveTitle}>Save</button>
      <button className="btn small ghost" onClick={() => setEditingTitle(false)}>✕</button>
    </span>
  ) : (
    <span style={{ display: 'inline-flex', gap: 8, marginLeft: 8, verticalAlign: 'middle' }}>
      <button type="button" title="Edit title" style={iconBtn} onClick={openTitle}>✎</button>
      <button type="button" title="Rewrite the title with AI" disabled={distorting} style={{ ...iconBtn, opacity: distorting ? 0.4 : 1 }} onClick={distort}>🎨</button>
      {/* 🔢 number this card — sets its icon to a number emoji (top card = 0️⃣). */}
      <button type="button" title="Number this card (icon)" style={iconBtn} onClick={() => ctx.numberCard(card.id)}>🔢</button>
      {/* 🎲 random emoji icon — a fresh suggestion every click. */}
      <button type="button" title="Random emoji icon — click for a new one" style={iconBtn} onClick={() => ctx.setIcon(card.id, { icon: randomEmoji(card.icon), image: undefined })}>🎲</button>
      {/* 📎 upload an icon image — nested cards only (the first card uses grid view). */}
      {nested && <button type="button" title="Upload an icon image" disabled={imgBusy} style={{ ...iconBtn, opacity: imgBusy ? 0.4 : 1 }} onClick={uploadImage}>📎</button>}
    </span>
  )) : null;

  // Pencil (+ palette) next to the DESCRIPTION (the card's subtitle text). The
  // 🎨 AI-rewords it the same meaning, said differently; typed edits cap at 300.
  const afterSubtitle = ctx.canEdit ? (editingSub ? (
    <span style={editorRow} onClick={stop}>
      <input autoFocus value={subDraft} placeholder="Description" maxLength={300} onChange={(e) => setSubDraft(e.target.value.slice(0, 300))}
        onKeyDown={(e) => { if (e.key === 'Enter') saveSub(); if (e.key === 'Escape') setEditingSub(false); }}
        style={{ fontSize: 13, minWidth: 120 }} onClick={stop} />
      <button className="btn small green" onClick={saveSub}>Save</button>
      <button className="btn small ghost" onClick={() => setEditingSub(false)}>✕</button>
    </span>
  ) : (
    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 6, verticalAlign: 'middle' }}>
      <button type="button" title="Edit description" style={iconBtn} onClick={openSub}>✎</button>
      <button type="button" title="Rewrite the description with AI" disabled={distorting} style={{ ...iconBtn, opacity: distorting ? 0.4 : 1 }} onClick={distortSub}>🎨</button>
    </span>
  )) : null;

  // The Moderator link (blue) and the current user's OWN upload (green) are now
  // reached through the 📎 / 📁 icons themselves (which carry a green underline
  // when set), so they no longer render as separate buttons. Only OTHER users'
  // uploads still show here — so everyone can open them and an admin can remove
  // one (the ✕).
  const otherGreenLinks = links.map((l, i) => ({ l, i })).filter(({ l }) => l.color === 'green' && l.by !== ctx.me);
  const canRemoveLink = (l: RepoLink) => l.color === 'green' && l.by !== ctx.me && ctx.isAdmin;
  const linkBtn = ({ l, i }: { l: RepoLink; i: number }) => (
    <span key={l.url + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <a className={`btn small ${l.color === 'green' ? 'green' : 'blue'}`} href={l.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }}
        title={`${l.color === 'green' ? 'User' : 'Moderator'}${l.by ? `: ${l.by}` : ''}${l.label ? ` — ${l.label}` : ''}`}>🔗 {l.color === 'green' ? 'User' : 'Moderator'}</a>
      {canRemoveLink(l) && <button type="button" title="Remove this user's upload (admin)" onClick={eat(() => removeLinkAt(i))}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, opacity: 0.6 }}>✕</button>}
    </span>
  );
  const linkColumn = otherGreenLinks.length > 0 ? (
    <div style={{ display: 'grid', gap: 4, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{otherGreenLinks.map(linkBtn)}</div>
    </div>
  ) : null;

  // Status chip — a read-only badge everyone sees when the card is in one of the
  // four workflow statuses. Owner/admin change it with the mode cycle button.
  const stMeta = isStatus ? STATUS_META[mode] : null;
  const statusChip = stMeta ? (
    <span style={{ borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, lineHeight: 1.4, color: '#fff', background: stMeta.bg, flex: '0 0 auto' }}>{stMeta.label}</span>
  ) : null;
  // Owner/admin cycle button: Enabled → Assigned → Pending → Approved → Rejected
  // → Disabled → Preview. Setting it back to Enabled clears the field.
  const cycleMode = () => { const nm = nextMode(card.mode); ctx.editField(card.id, { mode: nm === 'enabled' ? undefined : nm }); };
  // The assignment-status CYCLE button — a clearly LABELLED button (emoji + word).
  const assignBtn = (
    <button type="button" title={`Assignment status: ${mode} — click to cycle (Set status → Assigned → Pending → Approved → Rejected → Disabled → Preview)`}
      onClick={cycleMode} className={`btn small ${isStatus ? 'blue' : 'ghost'}`} style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>{MODE_BTN[mode]} {MODE_LABEL[mode]}</button>
  );
  // What the card shows for assignment:
  //  • Feature ON (owner/admin): the cycling button on EVERY card (incl. Set status).
  //  • Feature OFF, or a normal viewer: a READ-ONLY status chip — but ONLY on cards
  //    that carry a real workflow status. A 'Set status' (enabled) card shows nothing
  //    when the feature is off, so cards left un-assigned simply drop off.
  // Show the cycle button whenever you can edit (your own view OR the Moderators
  // preview) so the control is always visible. Actual writes are what preview
  // blocks (saveCards no-ops), so clicking it in a preview role changes nothing.
  const showCycle = ctx.canEdit && ctx.assignShown;
  const assignControl = showCycle ? assignBtn : (isStatus ? statusChip : null);

  // The control icons laid out in a tidy 3-per-row grid.
  const favBtn = (
    <button onClick={() => ctx.toggleFav(card.id)} title={isFav ? 'Unfavorite' : 'Favorite'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1, color: isFav ? '#f0a202' : 'var(--ink)', opacity: isFav ? 1 : 0.5 }}>{isFav ? '★' : '☆'}</button>
  );
  // 📋 copy the card's title + description — available to every viewer.
  const copyBtn = (
    <button type="button" onClick={eat(copyCard)} title={copied ? 'Copied!' : 'Copy title & description'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15, lineHeight: 1, opacity: copied ? 1 : 0.7 }}>{copied ? '✅' : '📋'}</button>
  );
  // ACTIVE controls — the ones that only appear when the owner/admin flips a
  // repo-wide toggle on (Assignment / Moderator upload / User upload). These are
  // the "live" emojis. A vertical line separates them from the permanent set.
  const activeControls: React.ReactNode[] = [];
  if (assignControl) activeControls.push(<span key="assign">{assignControl}</span>);
  // 📎 Moderator · 📁 User. The icon IS the whole control. For someone who may
  // EDIT the slot it's a button that opens the inline editor; for a viewer who can
  // only open/download the attachment it's a real <a> download link (a plain
  // window.open is blocked by browsers for uploaded data: files — the cause of
  // "I can't download the attachment in user view"). A green underline marks the
  // icon whenever its slot holds an attachment.
  const attachIcon = (has: boolean) => ({ ...iconBtn, borderBottom: `3px solid ${has ? '#2e9e57' : 'transparent'}`, borderRadius: 3, paddingBottom: 1, textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center' });
  const dlAnchor = (key: string, url: string, label: string, title: string) => (
    <a key={key} href={url} target="_blank" rel="noopener noreferrer" download title={title} onClick={stop} style={attachIcon(true)}>{label}</a>
  );
  const showClip = canPoster || (posterLinkIdx >= 0 && !card.posterOff);
  const showFolder = canUser || myUserLinkIdx >= 0;
  // Clip: a moderator (canPoster) edits the link; everyone else opens it.
  if (showClip) {
    if (canPoster) activeControls.push(<button key="clip" type="button" title={posterLinkIdx >= 0 ? 'Edit or delete the Moderator link' : 'Add a Moderator link'} style={attachIcon(posterLinkIdx >= 0)} onClick={eat(clipAction)}>📎</button>);
    else if (posterLinkIdx >= 0) activeControls.push(dlAnchor('clip', links[posterLinkIdx].url, '📎', 'Open the Moderator link'));
  }
  // Folder: the owner of the link (canUser) edits their own; anyone else opens it.
  if (showFolder) {
    if (canUser) activeControls.push(<button key="folder" type="button" title={myUserLinkIdx >= 0 ? 'Edit or delete your link' : 'Add your own link'} style={attachIcon(myUserLinkIdx >= 0)} onClick={eat(folderAction)}>📁</button>);
    else if (myUserLinkIdx >= 0) activeControls.push(dlAnchor('folder', links[myUserLinkIdx].url, '📁', 'Open the link'));
  }
  // 🤖 AI question — owner/admin only, when the repo-wide AI feature is on. Click
  // to write/edit the prompt that guides the answer generated by ➕ (add inside).
  // Green underline when this card already has a saved prompt.
  const saveAi = () => { ctx.editField(card.id, { aiPrompt: aiDraft.trim() || undefined }); setAiOpen(false); };
  const clearAi = () => { ctx.editField(card.id, { aiPrompt: undefined }); setAiDraft(''); setAiOpen(false); };
  if (ctx.canEdit && ctx.aiShown) activeControls.push(<button key="robot" type="button" title={card.aiPrompt ? 'Edit the AI question for this card' : 'Add an AI question for this card (guides the answer when you ➕ add a card inside)'} style={attachIcon(!!card.aiPrompt)} onClick={eat(() => { setAiDraft(card.aiPrompt || ''); setAiOpen((o) => !o); })}>🤖</button>);

  // 🖼️ card picture — lives in the ACTIVE group (beside the clip/folder), shown to
  // a moderator when the repo-wide "Card picture" toggle is on (to generate) and to
  // ANYONE once a picture exists (to view). A green underline marks that a picture
  // is saved. Clicking opens the popup (view; regenerate/delete for owner/admin).
  const showFrame = (ctx.canEdit && ctx.imageGen) || hasGen;
  if (showFrame) activeControls.push(
    <button key="img" type="button" onClick={eat(frameClick)} disabled={genBusy}
      title={hasGen ? (ctx.canEdit ? 'View the picture — regenerate or delete it' : 'View the picture') : (ctx.canEdit ? 'Generate an AI picture of this item (saved for everyone)' : 'No picture yet')}
      style={attachIcon(hasGen)}>{genBusy ? '⏳' : '🖼️'}</button>
  );

  // PERMANENT controls — always available (per role). These never move.
  // ⚙️ add a card at THIS level · ➕ add a card inside. When the AI feature is on
  // AND this card has a saved 🤖 prompt, each instead GENERATES an answer card
  // (same level / inside) from the card + page + prompt + attachments; otherwise
  // it adds a blank card (the normal behaviour).
  const aiGen = ctx.aiShown && !!card.aiPrompt;
  const genChild = async () => { setAiBusy(true); try { await ctx.addAnswerChild(card); } finally { setAiBusy(false); } };
  const genSibling = async () => { setAiBusy(true); try { await ctx.addAnswerSibling(card); } finally { setAiBusy(false); } };
  const permanentControls: React.ReactNode[] = [favBtn, copyBtn];
  if (ctx.canEdit) permanentControls.push(
    <button key="sib" type="button" disabled={aiBusy} title={aiGen ? 'Generate an AI answer card at this level (from this card, the page, your 🤖 prompt and attachments)' : 'Add a card at this level'} style={{ ...iconBtn, opacity: aiBusy ? 0.4 : 1 }} onClick={() => (aiGen ? genSibling() : ctx.addSibling(card.id))}>{aiBusy ? '⏳' : (aiGen ? '🤖⚙️' : '⚙️')}</button>,
    <button key="child" type="button" disabled={aiBusy} title={aiGen ? 'Generate an AI answer card inside (from this card, the page, your 🤖 prompt and attachments)' : 'Add a card inside'} style={{ ...iconBtn, opacity: aiBusy ? 0.4 : 1 }} onClick={() => (aiGen ? genChild() : ctx.addSubcard(card.id))}>{aiBusy ? '⏳' : (aiGen ? '🤖➕' : '➕')}</button>,
    <button key="hide" type="button" title={card.hidden ? 'Hidden from viewers — click to show' : 'Hide from normal viewers'} style={{ ...iconBtn, opacity: card.hidden ? 0.5 : 1 }} onClick={() => ctx.editField(card.id, { hidden: !card.hidden })}>👁︎</button>,
    <button key="del" type="button" title="Delete this card" style={delIcon} onClick={() => ctx.deleteCard(card.id)}>🗑</button>,
  );

  // The control cluster: [ active emojis | permanent emojis ], with a vertical
  // divider ALWAYS between the two groups (even when no active controls are on).
  const vDivider = <span key="vdiv" style={{ alignSelf: 'stretch', borderLeft: '2px solid var(--ink)', opacity: 0.28, margin: '0 4px', minHeight: 18 }} />;
  const iconGrid = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center', flex: '0 0 auto' }}>
      {activeControls}
      {vDivider}
      {permanentControls}
    </div>
  );
  // ▲ / ▼ reorder this card within its own level (swap with the sibling above /
  // below). Owner/admin only. A vertical pair, sitting to the side of the card.
  const moveBtns = ctx.canEdit ? (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, flex: '0 0 auto', lineHeight: 1 }} onClick={stop}>
      <button type="button" title="Move this card up (within its level)" style={{ ...iconBtn, fontSize: 12, padding: 0 }} onClick={() => ctx.moveCard(card.id, -1)}>▲</button>
      <button type="button" title="Move this card down (within its level)" style={{ ...iconBtn, fontSize: 12, padding: 0 }} onClick={() => ctx.moveCard(card.id, 1)}>▼</button>
    </span>
  ) : null;
  // Collapse toggle — hides this card's nested cards (the card itself stays). Only
  // meaningful in rows view where the tree is drawn; available to every viewer.
  const collapseBtn = (view === 'row' && kids.length > 0) ? (
    <button type="button" onClick={() => setCollapsed((c) => !c)}
      title={collapsed ? `Expand ${kids.length} card${kids.length === 1 ? '' : 's'} inside` : 'Collapse the cards inside'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, opacity: 0.75, flex: '0 0 auto' }}>{collapsed ? '▸' : '▾'}</button>
  ) : null;
  const actions = (
    <>
      {moveBtns}
      {linkColumn}
      {/* Assignment control/chip lives in the icon cluster (activeControls). */}
      {card.completable && <button className={`btn small ${ctx.done[card.id] ? 'green' : 'ghost'}`} onClick={() => ctx.toggle(card.id)}>{ctx.done[card.id] ? '✓ Done' : '○ Mark done'}</button>}
      {iconGrid}
    </>
  );
  const del = undefined;   // delete lives inside the icon grid now

  // GRID view is a browse/display view: uniform fixed-height tiles showing only
  // name + description; the control cluster + inline edit icons are hidden (they
  // all live in ROW view, opened by a click). ROW view keeps everything.
  const isGrid = view === 'grid';
  const shell = (
    <CardShell view={view}
      gridHeight={isGrid ? 340 : undefined}
      rowTextLines={2}
      title={editingTitle ? '' : (card.title || 'Untitled')}
      subtitle={editingSub ? ' ' : (card.text || '')}
      thumbnail={isImg(card.image) ? card.image : null}
      badge={dimmed ? '🙈 hidden' : (ctx.canEdit && mode === 'disabled' ? '🚫 disabled' : ctx.canEdit && mode === 'preview' ? '👓 preview' : (view === 'grid' && kids.length ? `📂 ${kids.length} inside` : undefined))}
      onOpen={open}
      leading={isGrid ? undefined : collapseBtn}
      iconNode={iconNode}
      meta={card.createdAt ? <span style={{ fontSize: 10.5, opacity: 0.55 }}>🕒 {new Date(card.createdAt).toLocaleString()}</span> : undefined}
      overlay={isGrid ? undefined : imgOverlay} placeholder={isGrid ? undefined : imgPlaceholder}
      afterTitle={isGrid ? undefined : afterTitle} afterSubtitle={isGrid ? undefined : afterSubtitle}
      actions={isGrid ? (assignControl ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{assignControl}</span> : null) : actions} del={isGrid ? undefined : del} />
  );

  // The clip/folder inline editor — opened straight from the 📎 / 📁 icon. Type a
  // link (label + URL) or attach a file; either REPLACES what the slot holds. When
  // the slot already has an attachment the editor is pre-filled and shows Delete.
  // ONE consistent editor whether you're adding or already have something saved:
  // paste a link OR attach a document, then Submit. 🔗 Link opens what's saved and
  // 🗑 Delete removes it (both disabled until a slot actually holds an attachment,
  // so the form looks identical the first time and every time after).
  const hasSlot = attaching && slotIdx() >= 0;
  const curSlotUrl = hasSlot ? links[slotIdx()].url : '';
  const attachForm = attaching ? (
    <div className="card alt" style={{ padding: '8px 10px', marginTop: 6, display: 'grid', gap: 6 }} onClick={stop}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>{attachColor === 'green' ? '📁 User — your own link or document (only you or an admin can remove it)' : '📎 Moderator — a link or document everyone can open'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={linkUrl} placeholder="Paste a link (https://…)" onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }} style={{ flex: '3 1 220px', fontSize: 13 }} />
        <label className="btn small ghost" style={{ cursor: 'pointer' }} title="Attach a document or file from your device">
          {attachBusy ? 'Uploading…' : '📎 Attach a document'}
          <input type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) attachUpload(f); e.currentTarget.value = ''; }} />
        </label>
        <button className={`btn small ${attachColor}`} disabled={!linkUrl.trim()} onClick={addLink}>{hasSlot ? '✓ Replace' : '✓ Submit'}</button>
        {/* 🔗 Link — a REAL anchor (not window.open, which browsers block for
            uploaded data: files) so it reliably opens/downloads what's saved. */}
        {hasSlot
          ? <a className="btn small blue" href={curSlotUrl} target="_blank" rel="noopener noreferrer" download title="Open the saved link / document in a new tab" onClick={stop} style={{ textDecoration: 'none' }}>🔗 Link</a>
          : <button className="btn small blue" disabled title="Save a link or document first">🔗 Link</button>}
        <button className="btn small ghost" disabled={!hasSlot} onClick={eat(deleteSlot)} title="Delete the saved attachment">🗑 Delete</button>
        <button className="btn small ghost" onClick={() => setAttaching(false)}>✕</button>
      </div>
    </div>
  ) : null;

  // 🤖 AI-question editor — set the prompt that guides the answer generated when
  // you ➕ add a card inside this card.
  const aiForm = aiOpen ? (
    <div className="card alt" style={{ padding: '8px 10px', marginTop: 6, display: 'grid', gap: 6 }} onClick={stop}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>🤖 AI question — when this is set, ➕ (add card inside) generates an answer from this card, the page, this prompt and any attachment</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={aiDraft} placeholder="e.g. Summarise the key idea and give one worked example" maxLength={2000} onChange={(e) => setAiDraft(e.target.value.slice(0, 2000))} onKeyDown={(e) => { if (e.key === 'Enter') saveAi(); }} style={{ flex: '3 1 240px', fontSize: 13 }} />
        <button className="btn small blue" disabled={!aiDraft.trim()} onClick={saveAi}>✓ Save</button>
        {card.aiPrompt && <button className="btn small ghost" onClick={clearAi} title="Remove the AI question">🗑 Clear</button>}
        <button className="btn small ghost" onClick={() => setAiOpen(false)}>✕</button>
      </div>
    </div>
  ) : null;

  // 🖼️ picture popup (lightbox) — shown when the frame button is clicked.
  const imgPopup = (showImg && hasGen) ? (
    <div onClick={() => setShowImg(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg, #fff)', borderRadius: 12, padding: 12, maxWidth: 'min(92vw, 620px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>🖼️ {card.title || 'Picture'}</strong>
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {/* Owner/admin manage the picture from here — regenerate a fresh one or
                delete it (this replaces the old 💦 splash delete icon). */}
            {ctx.canEdit && <button className="btn small blue" disabled={genBusy} onClick={regenImage}>{genBusy ? '⏳ …' : '🔄 Regenerate'}</button>}
            {ctx.canEdit && <button className="btn small ghost" disabled={genBusy} onClick={deleteImage}>🗑 Delete</button>}
            <button className="btn small ghost" onClick={() => setShowImg(false)}>✕ Close</button>
          </span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.genImage} alt={card.title || 'Generated picture'} style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 8 }} />
      </div>
    </div>
  ) : null;

  // A disabled card is greyed + unclickable for viewers; a hidden card (owner/
  // admin preview) is just greyed.
  const body = <div style={blocked ? { opacity: 0.5, pointerEvents: 'none' as const } : (dimmed ? { opacity: 0.5 } : undefined)}>{shell}{attachForm}{aiForm}{imgPopup}</div>;

  // GRID view: a card is shown ALONE — no nested cards beneath it (clicking a
  // card with children flips to the rows view to reveal the tree). ROWS view
  // draws ALL nested cards, always.
  if (view === 'grid' || !kids.length) return <div>{body}</div>;
  return (
    <div>
      {body}
      {!collapsed && (
        <div style={{ marginLeft: 14, marginTop: 8, borderLeft: '3px solid var(--accent, #5c80bc)', paddingLeft: 10, display: 'grid', gap: 8 }}>
          {ctx.sortCards(kids).map((k) => <RepoCollectionCard key={k.id} card={k} view="row" ctx={ctx} nested />)}
        </div>
      )}
    </div>
  );
}

export function RepoView({ def, slug, canEdit, owner }: { def: any; slug: string; canEdit: boolean; owner?: string }) {
  const repo: RepoSpec = def?.repo || { cards: [] };
  const [cards, setCards] = useState<RepoCard[]>(() => repo.cards || []);
  // Top-level arrangement. There is no display control in the edit bar on purpose:
  // each card carries its own "Children as" layout (bars/grid) that cascades to
  // everything inside it, and the repo-wide default lives on the page's Settings.
  const display: 'bars' | 'grid' = repo.display === 'grid' ? 'grid' : 'bars';
  // Studio "collections" show a gallery-style filter toolbar over vertical cards.
  const isCollection = (def?.tags || []).includes('collection');
  // "Suggest AI": the per-card 🖼️ picture button. Owner/admin toggle it here (the
  // repo's ⚙️ settings strip); persisted on the repo without touching the cards.
  const [imageGen, setImageGen] = useState(!!repo.imageGen);
  // "Collapse / expand all" — a broadcast every card follows. `on` is the target
  // state, `n` a nonce so re-clicking the same state still refires.
  const [collapseCmd, setCollapseCmd] = useState<{ on: boolean; n: number }>({ on: false, n: 0 });
  const collapseAll = (on: boolean) => setCollapseCmd((c) => ({ on, n: c.n + 1 }));
  // "Assignment" — a PERSISTED repo-wide toggle (owner/admin). On: the status
  // cycle button shows on every card. Off: cards keep any status already set (shown
  // as a read-only badge to everyone), and un-assigned cards drop the control.
  const [assignShown, setAssignShown] = useState(!!repo.assignShow);
  // PERSISTED repo-wide switches for the Moderator (📎 clip) and User (📁 folder)
  // attach features. When ON, every card offers that upload; when OFF, the icon is
  // hidden EXCEPT on cards that already hold an attachment (which stay viewable /
  // manageable). Stored on the repo as clipForAll / folderForAll.
  const [posterUpload, setPosterUpload] = useState(!!repo.clipForAll);
  const [userUpload, setUserUpload] = useState(!!repo.folderForAll);
  // "AI question" — a repo-wide toggle (owner/admin). On: every card gets a 🤖
  // prompt icon, and adding a card inside (➕) generates an AI answer from the
  // card + page + prompt + attachments. Off: ➕ makes a blank card as before.
  const [aiShown, setAiShown] = useState(false);
  // Card ordering — a display toggle everyone can cycle: manual (as arranged) →
  // ↑ ascending (oldest first) → ↓ descending (newest first) → 🔀 random. The
  // nonce reshuffles "random" each time you land on it.
  const [sortMode, setSortMode] = useState<'manual' | 'asc' | 'desc' | 'random'>('manual');
  const [sortNonce, setSortNonce] = useState(0);
  const cycleSort = () => { setSortMode((m) => (m === 'manual' ? 'asc' : m === 'asc' ? 'desc' : m === 'desc' ? 'random' : 'manual')); setSortNonce((n) => n + 1); };
  const sortCards = useMemo(() => (list: RepoCard[]): RepoCard[] => {
    if (sortMode === 'manual' || list.length < 2) return list;
    const arr = [...list];
    if (sortMode === 'random') {
      const h = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
      return arr.map((c) => ({ c, k: h(c.id + ':' + sortNonce) })).sort((a, b) => a.k - b.k).map((x) => x.c);
    }
    const key = (c: RepoCard) => (c.createdAt ? Date.parse(c.createdAt) || 0 : 0);
    return arr.sort((a, b) => (sortMode === 'asc' ? key(a) - key(b) : key(b) - key(a)));
  }, [sortMode, sortNonce]);
  const SORT_LABEL: Record<typeof sortMode, string> = { manual: '↕ Order: Manual', asc: '↑ Order: Oldest', desc: '↓ Order: Newest', random: '🔀 Order: Random' };
  // Default per-level numbering (recomputed whenever the card tree changes).
  const levelIndex = useMemo(() => buildLevelIndex(cards), [cards]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [aiInstr, setAiInstr] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const dirty = useRef(false);
  const { done, toggle } = useDone(slug);
  const context = useMemo(() => `${def?.title || ''} — ${def?.description || ''}`.slice(0, 400), [def]);

  // User contributions (collect cards): load entries and group them by card id.
  const app = useApp();
  // Honour the admin "View as" preview: identity + admin/owner powers reflect the
  // selected role (canEdit is already passed preview-aware from ToolRunnerView).
  const perms = app.eff(owner);
  const me = perms.username;
  const isAdmin = perms.isAdmin;
  const isOwner = canEdit;
  // "View as" preview (admins looking as a User/Moderator): a look-but-don't-touch
  // mode. No edit should persist, or testing "how it looks" silently mutates real
  // data (e.g. cycling a card's status while previewing).
  const preview = !!perms.preview;
  const [entries, setEntries] = useState<any[]>([]);
  const loadEntries = () => {
    API.get(`/api/tools/entries?slug=${encodeURIComponent(slug)}`).then((r: any) => setEntries(Array.isArray(r?.entries) ? r.entries : [])).catch(() => { /* ignore */ });
  };
  useEffect(() => { loadEntries(); /* eslint-disable-next-line */ }, [slug]);
  const entriesByCard = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of entries) { const cid = e?.data?.__repoCardId; if (cid) (map[cid] ||= []).push(e); }
    return map;
  }, [entries]);

  // Per-card favorites, stored as lightweight entries ({ __fav: cardId }). This
  // gives the gallery-style ★ My favorites / 🛡️ Liked by admin / 💛 OP favorited
  // filters real data for repo cards, keyed by who favorited each card.
  const favEntries = useMemo(() => entries.filter((e: any) => e?.data?.__fav), [entries]);
  const myFavs = useMemo(() => { const o: Record<string, boolean> = {}; for (const e of favEntries) if (e.username === me) o[e.data.__fav] = true; return o; }, [favEntries, me]);
  const adminFavSet = useMemo(() => new Set(favEntries.filter((e: any) => e.byAdmin).map((e: any) => e.data.__fav)), [favEntries]);
  const ownerFavSet = useMemo(() => new Set(favEntries.filter((e: any) => owner && e.username === owner).map((e: any) => e.data.__fav)), [favEntries, owner]);
  const myFavEntryId = useMemo(() => { const m: Record<string, string> = {}; for (const e of favEntries) if (e.username === me) m[e.data.__fav] = e.id; return m; }, [favEntries, me]);
  const toggleFav = async (cardId: string) => {
    try {
      if (myFavs[cardId] && myFavEntryId[cardId]) await API.call('DELETE', '/api/tools/entries', { slug, entryId: myFavEntryId[cardId] });
      else await API.post('/api/tools/entries', { slug, data: { __fav: cardId } });
      loadEntries();
    } catch { /* ignore */ }
  };

  // Persist a new card tree (used by the inline card icons in collection view).
  // Optimistically updates, then reconciles with the sanitized server copy.
  const saveCards = async (next: RepoCard[]) => {
    if (preview) return;   // "View as" preview never writes real data
    setCards(next);
    try {
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display, displayLocked: repo.displayLocked, offlineExport: repo.offlineExport, imageGen, clipForAll: posterUpload, folderForAll: userUpload, assignShow: assignShown, cards: next } });
      if (r?.repo) { setCards(r.repo.cards || next); if (def) def.repo = r.repo; }
    } catch { /* keep the optimistic copy */ }
  };
  // A returned repo (from the normal-user attach endpoint) reconciled into state.
  const applyRepo = (nextRepo: RepoSpec) => { if (!nextRepo) return; setCards(nextRepo.cards || []); if (def) def.repo = nextRepo; };
  const editField = (id: string, p: Partial<RepoCard>) => saveCards(mapTree(cards, id, (c) => ({ ...c, ...p })));
  // The gear adds a nested card seeded with a generic title AND subtitle, so its
  // ✎ pencils have something to edit right away.
  const addSubcard = (id: string) => saveCards(addChildTo(cards, id, { ...blankCard('card'), text: 'New subtitle' }));
  // 🤖 Add an AI-answer card inside `card`. Sends the card's own title/description,
  // the wider repository (other cards), the saved prompt, and any attached
  // link/document to the AI, then inserts the returned title+text as a child.
  const flattenTitles = (cs: RepoCard[], depth = 0): string[] => cs.flatMap((c) => [`${'  '.repeat(depth)}• ${c.title || 'Untitled'}${c.text ? ` — ${String(c.text).slice(0, 120)}` : ''}`, ...(c.children ? flattenTitles(c.children, depth + 1) : [])]);
  // Ask the AI for an answer card built from `card` + the whole page + the card's
  // prompt + any attached document. Returns a ready-to-insert new card (or null).
  const generateAnswerCard = async (card: RepoCard): Promise<RepoCard | null> => {
    const repoContext = flattenTitles(cards).join('\n').slice(0, 3500);
    const allLinks = card.links || [];
    const refLinks = allLinks.filter((l) => !/^data:/i.test(l.url || '')).map((l) => ({ label: l.label, url: l.url }));
    const docLink = allLinks.find((l) => /^data:(application\/pdf|text\/|application\/(msword|vnd\.openxmlformats|vnd\.ms))/i.test(l.url || ''));
    const r = await API.post('/api/tools/repo/ai', { slug, op: 'answer', cardTitle: card.title || '', cardText: card.text || '', prompt: card.aiPrompt || '', repoTitle: def?.title || '', repoContext, links: refLinks, docDataUrl: docLink?.url || '' });
    if (r?.text) return { ...blankCard('card'), title: String(r.title || 'Answer').slice(0, 120), text: String(r.text).slice(0, 2000) };
    if (r?.error) alert(r.error);
    return null;
  };
  // 🤖 Add an AI-answer card INSIDE `card` (the ➕ button when the AI feature is on).
  const addAnswerChild = async (card: RepoCard) => {
    try { const nc = await generateAnswerCard(card); if (nc) await saveCards(addChildTo(cards, card.id, nc)); }
    catch { alert('Could not generate an answer.'); }
  };
  // 🤖 Add an AI-answer card at the SAME LEVEL as `card` (the ⚙️ button when the AI
  // feature is on) — same context, inserted as a sibling.
  const addAnswerSibling = async (card: RepoCard) => {
    try { const nc = await generateAnswerCard(card); if (nc) await saveCards(addSiblingEnd(cards, card.id, nc)); }
    catch { alert('Could not generate an answer.'); }
  };
  // ⚙️ add a sibling card at the SAME level, appended to the BOTTOM of that level
  // (a new top-level card from a top card, a new nested sibling from a nested one).
  const addSibling = (id: string) => saveCards(addSiblingEnd(cards, id, { ...blankCard('card'), text: 'New subtitle' }));
  // ▲ / ▼ reorder a card among its siblings (delta -1 = up, +1 = down).
  const moveCard = (id: string, delta: number) => saveCards(moveInTree(cards, id, delta));
  // The 📁 file icon adds a nested card meant for a file or link: generic title +
  // description, ready for the 📎 clip.
  // Set/replace the card icon: an uploaded/AI image OR a number emoji (mutually
  // exclusive — the 🔢 button clears the image, an upload clears the emoji).
  const setIcon = (id: string, patch: Partial<RepoCard>) => saveCards(mapTree(cards, id, (c) => ({ ...c, ...patch })));
  const numberCard = (id: string) => { const n = cardNumber(cards, id); if (n == null) return; setIcon(id, { icon: toKeycaps(n), image: undefined }); };
  // Add a brand-new TOP-LEVEL card straight from the collection page (owner/admin).
  const addTopCardSaved = () => saveCards([...cards, { ...blankCard('card'), text: 'New subtitle' }]);
  const deleteCard = (id: string) => { if (!confirm('Delete this card and everything inside it?')) return; saveCards(removeFromTree(cards, id)); };
  const distortTitle = async (card: RepoCard) => {
    try {
      const r = await API.post('/api/tools/repo/ai', { slug, op: 'field', field: 'title', current: card.title || '', instruction: '', context });
      if (r?.text) await saveCards(mapTree(cards, card.id, (c) => ({ ...c, title: r.text })));
      else if (r?.error) alert(r.error);
    } catch { alert('Could not reach the AI.'); }
  };
  // AI-reword (or generate) the description — same wording, said differently.
  // Capped to 300 chars to match the typed limit.
  const distortText = async (card: RepoCard) => {
    try {
      const r = await API.post('/api/tools/repo/ai', { slug, op: 'field', field: 'text', current: card.text || '', instruction: 'Keep it under 300 characters.', context });
      if (r?.text) await saveCards(mapTree(cards, card.id, (c) => ({ ...c, text: String(r.text).slice(0, 300) })));
      else if (r?.error) alert(r.error);
    } catch { alert('Could not reach the AI.'); }
  };

  const ctx: ViewCtx = { slug, me, isOwner, done, toggle, entriesByCard, onAdded: loadEntries, favs: myFavs, toggleFav, collapseCmd, levelIndex, assignShown, posterUpload, userUpload, aiShown, canEdit, isAdmin, preview, imageGen, applyRepo, editField, distortTitle, distortText, addSubcard, addAnswerChild, addAnswerSibling, addSibling, sortCards, moveCard, setIcon, numberCard, deleteCard };

  // Persist the "Suggest AI" toggle (imageGen) without touching cards.
  const saveImageGen = async (next: boolean) => {
    setImageGen(next);
    try {
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display, displayLocked: repo.displayLocked, offlineExport: repo.offlineExport, imageGen: next, clipForAll: posterUpload, folderForAll: userUpload, assignShow: assignShown, cards } });
      if (r?.repo && def) def.repo = r.repo;
    } catch { /* keep the optimistic toggle */ }
  };
  // Persist the Moderator (📎 clip) / User (📁 folder) upload switches.
  const saveUploads = async (poster: boolean, user: boolean) => {
    setPosterUpload(poster); setUserUpload(user);
    try {
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display, displayLocked: repo.displayLocked, offlineExport: repo.offlineExport, imageGen, clipForAll: poster, folderForAll: user, assignShow: assignShown, cards } });
      if (r?.repo && def) def.repo = r.repo;
    } catch { /* keep the optimistic toggle */ }
  };
  // Persist the 🏷️ Assignment feature switch.
  const saveAssign = async (next: boolean) => {
    setAssignShown(next);
    try {
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display, displayLocked: repo.displayLocked, offlineExport: repo.offlineExport, imageGen, clipForAll: posterUpload, folderForAll: userUpload, assignShow: next, cards } });
      if (r?.repo && def) def.repo = r.repo;
    } catch { /* keep the optimistic toggle */ }
  };

  // Display lock: the owner/admin can lock the grid/rows view for a collection so
  // everyone sees the same layout. Persisted on the repo (display + displayLocked).
  const saveDisplayLock = async (lockedNext: boolean, viewSel: 'grid' | 'row') => {
    const nextDisplay: 'bars' | 'grid' = viewSel === 'grid' ? 'grid' : 'bars';
    try {
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display: nextDisplay, displayLocked: lockedNext, offlineExport: repo.offlineExport, imageGen, clipForAll: posterUpload, folderForAll: userUpload, assignShow: assignShown, cards } });
      if (r?.repo && def) def.repo = r.repo;
    } catch { /* ignore */ }
  };

  // Offline export (owner/admin can toggle it off in Settings).
  const offlineOn = repo.offlineExport !== false;
  const [zipBusy, setZipBusy] = useState(false);
  const downloadZip = async () => {
    setZipBusy(true);
    try {
      const blob = await buildRepoZip({ title: def?.title || 'Repository', subtitle: def?.description || '', cards, display });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${slug || 'repository'}-offline.zip`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) { alert(e?.message || 'Could not build the offline copy.'); }
    setZipBusy(false);
  };

  const patch = (id: string, p: Partial<RepoCard>) => { dirty.current = true; setCards((cs) => mapTree(cs, id, (c) => ({ ...c, ...p }))); };
  const addChild = (id: string) => { dirty.current = true; setCards((cs) => addChildTo(cs, id, blankCard('card'))); };
  const addSection = (id: string) => { dirty.current = true; setCards((cs) => addSiblingAfter(cs, id, blankCard('section'))); };
  const remove = (id: string) => { if (!confirm('Delete this card and everything inside it?')) return; dirty.current = true; setCards((cs) => removeFromTree(cs, id)); };
  const move = (id: string, delta: number) => { dirty.current = true; setCards((cs) => moveInTree(cs, id, delta)); };
  const addTop = (kind: 'card' | 'section') => { dirty.current = true; setCards((cs) => [...cs, blankCard(kind)]); };

  const save = async () => {
    setSaving(true); setSaved('');
    try {
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display, displayLocked: repo.displayLocked, offlineExport: repo.offlineExport, imageGen, cards } });
      if (r?.repo) { setCards(r.repo.cards || []); dirty.current = false; setSaved('Saved ✓'); if (def) def.repo = r.repo; }
      else setSaved(r?.error || 'Could not save.');
    } catch (e: any) { setSaved(e?.message || 'Could not save.'); }
    setSaving(false);
    setEditing(false);
  };

  const aiLayout = async () => {
    setAiBusy(true);
    try {
      const r = await API.post('/api/tools/repo/ai', { slug, op: 'layout', instruction: aiInstr, cards, layout: repo.layout || 'course' });
      if (Array.isArray(r?.cards)) { dirty.current = true; setCards(r.cards); setAiInstr(''); }
      else if (r?.error) alert(r.error);
    } catch { alert('Could not update the layout.'); }
    setAiBusy(false);
  };

  return (
    <div>

      {/* Body */}
      {editing ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {cards.map((c, ci) => (
            <CardEdit key={c.id} card={c} depth={0} slug={slug} context={context}
              siblingLayout={display} idx={ci} count={cards.length}
              patch={patch} addChild={addChild} addSection={addSection} remove={remove} move={move} />
          ))}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 4 }}>
            <button className="btn blue" onClick={() => addTop('card')}>＋ Add card</button>
            <button className="btn ghost" onClick={() => addTop('section')}>＋ Add section</button>
          </div>
        </div>
      ) : cards.length === 0 ? (
        <div className="card alt" style={{ padding: '16px' }}>
          <p style={{ margin: 0 }}>This repository is empty.{canEdit ? ' Tap ✎ Edit to add your first card.' : ''}</p>
        </div>
      ) : isCollection ? (
       <>
        {/* A collection: the shared titled + banner'd + filterable gallery block. */}
        <GallerySection
          titleKey="collectionShelfTitle" titleFallback="🗂️ Cards"
          bannerKey="collectionBanner" bannerDefault="🗂️ Your saved cards — search by name, favorite them (★ / liked by admin / Moderators), switch grid ▦ or rows ☰ (the owner can 🔒 lock the layout), and page through. Tap a card to open its attachment."
          items={sortCards(cards.filter((c) => canEdit || !c.hidden))}
          id={(c: RepoCard) => c.id}
          searchText={(c: RepoCard) => `${c.title || ''} ${c.subtitle || ''} ${c.text || ''}`}
          defaultView={display === 'grid' ? 'grid' : 'row'}
          viewLocked={!!repo.displayLocked}
          canLockView={canEdit}
          onViewLockChange={saveDisplayLock}
          showRefresh={false}
          showCollapse
          storageKey={`sl_repo_view_${slug}`}
          gridMinPx={260}
          perPage={8}
          maxWidth={900}
          searchPlaceholder="🔍 search cards"
          belowToolbar={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {cards.some((c) => (c.children || []).length > 0) && (
                <button className="btn small ghost" title={collapseCmd.on ? 'Expand every card to show its nested cards' : 'Collapse every card — show only the top-level cards'}
                  onClick={() => collapseAll(!collapseCmd.on)}>{collapseCmd.on ? '⊕ Expand all' : '⊖ Collapse all'}</button>
              )}
              {canEdit && (
                <button className={`btn small ${assignShown ? 'blue' : 'ghost'}`}
                  title={assignShown ? 'Turn off the status cycle button. Cards that already have a status keep showing it (read-only); un-assigned cards drop the control.' : 'Show the status cycle button on every card so you can set each card’s status'}
                  onClick={() => saveAssign(!assignShown)}>🏷️ Assignment: {assignShown ? 'On' : 'Off'}</button>
              )}
              {canEdit && (
                <button className={`btn small ${posterUpload ? 'blue' : 'ghost'}`}
                  title="Enable the Moderator 📎 link on every card. When off, the clip only stays on cards that already have a link (viewers can still open those)."
                  onClick={() => saveUploads(!posterUpload, userUpload)}>📎 Moderator upload: {posterUpload ? 'On' : 'Off'}</button>
              )}
              {canEdit && (
                <button className={`btn small ${userUpload ? 'blue' : 'ghost'}`}
                  title="Let users add their own 📁 link on every card. When off, the folder only stays on cards where a user already has one (they can still open/manage theirs)."
                  onClick={() => saveUploads(posterUpload, !userUpload)}>📁 User upload: {userUpload ? 'On' : 'Off'}</button>
              )}
              {canEdit && (
                <button className={`btn small ${aiShown ? 'blue' : 'ghost'}`}
                  title={aiShown ? 'Turn off the AI question feature' : 'Turn on the AI question feature — each card gets a 🤖 prompt, and adding a card inside (➕) generates an AI answer from the card, page, prompt and attachments'}
                  onClick={() => setAiShown((v) => !v)}>🤖 AI question: {aiShown ? 'On' : 'Off'}</button>
              )}
              {canEdit && (
                <button className={`btn small ${imageGen ? 'blue' : 'ghost'}`}
                  title={imageGen ? 'Turn off card pictures' : 'Turn on card pictures — each card gets a 🖼️ button (beside the clip/folder) to generate an AI picture of the item; a saved picture stays viewable to everyone even after you turn this off'}
                  onClick={() => saveImageGen(!imageGen)}>🖼️ Card picture: {imageGen ? 'On' : 'Off'}</button>
              )}
              {/* Sort order — available to everyone (a personal display preference):
                  cycles Manual → Oldest → Newest → Random. */}
              <button className={`btn small ${sortMode === 'manual' ? 'ghost' : 'blue'}`}
                title="Sort the cards — click to cycle: Manual (as arranged) → ↑ Oldest first → ↓ Newest first → 🔀 Random"
                onClick={cycleSort}>{SORT_LABEL[sortMode]}</button>
              {canEdit && <button className="btn small green" title="Add a new top-level card" onClick={addTopCardSaved}>＋ New card</button>}
            </div>
          }
          favs={myFavs}
          likedByAdmin={(c: RepoCard) => adminFavSet.has(c.id)}
          likedByOwner={(c: RepoCard) => ownerFavSet.has(c.id)}
          renderGrid={(c: RepoCard, v?: { setView: (m: 'grid' | 'row') => void }) => <RepoCollectionCard card={c} view="grid" ctx={ctx} switchToRows={() => v?.setView('row')} />}
          renderRow={(c: RepoCard) => <RepoCollectionCard card={c} view="row" ctx={ctx} />}
          emptyAll="This collection is empty."
          emptyFiltered="No cards match your search."
        />
       </>
      ) : (
        <div style={display === 'grid'
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }
          : { display: 'grid', gap: 12 }}>
          {cards.filter((c) => canEdit || !c.hidden).map((c) => <CardView key={c.id} card={c} depth={0} defaultDisplay={display} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}
