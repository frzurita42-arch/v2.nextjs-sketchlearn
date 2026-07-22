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
import { appState, TONES } from '@/lib/app-state';
import { buildStudyToolDefinition, SLIDE_ACTIVITIES, STUDY_LEVELS, STUDY_LENGTHS } from '@/lib/slide-activities';
import { useApp } from '@/components/AppContext';
import { RichText } from '@/components/tools/RichText';
import { ImageField } from '@/components/tools/ImageField';
import { isRenderableImage } from '@/lib/img';
import { buildRepoZip } from '@/lib/lesson-export';
import { Collection } from '@/components/ui/Collection';
import { cardImageProps } from '@/lib/card-size';
import { OutlineBox } from '@/components/ui/OutlineBox';
import { CardShell, iconBtn, overlayIcon } from '@/components/ui/CardShell';
import { StepWizard, type WizardStep } from '@/components/ui/StepWizard';
import { SetupWizardCard } from '@/components/ui/SetupWizardCard';
import { WizardGridTemplate } from '@/components/ui/WizardGridTemplate';
import { PromptInspector } from '@/components/ui/PromptInspector';
import { FIELD_CONTROL_STYLE } from '@/components/tools/ToolFields';
import { PagedTable, type Cell } from '@/components/ui/PagedTable';
import { repoRef } from '@/lib/repo-ref';
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
  docUpload: boolean;                              // 📄 file uploads enabled — the "Attach a document" button is active
  showDates: boolean;                              // 🕒 show each card's created date/time
  imageGen: boolean;                               // "Suggest AI": show the 🖼️ per-card picture button
  emojiApprove: boolean;                           // ✅ show the per-card emoji that cycles the assignment status (no upload)
  studyMode: boolean;                              // 🎬 study path: show the "generate slides" button on 🔵 prompt cards
  openStudy: (promptText: string, sourceCard?: RepoCard, opts?: { autoGenerate?: boolean }) => void; // open the slide tool with card + topic context
  authorizedUsers: string[];                       // usernames that bypass a card's paywall (plus owner/admin)
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
const blankCard = (kind: 'card' | 'section' = 'card'): RepoCard => {
  const now = new Date().toISOString();
  return { id: newId(), kind, title: kind === 'section' ? 'New section' : 'New card', links: [], createdAt: now, lastEdited: now };
};

const sameCardShape = (a: RepoCard | undefined, b: RepoCard | undefined): boolean => {
  const strip = (c?: RepoCard): any => {
    if (!c) return null;
    const { lastEdited, children, ...rest } = c;
    return { ...rest, children: Array.isArray(children) ? children.map(strip) : [] };
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
};

const stampEditedTree = (prev: RepoCard[], next: RepoCard[], now: string): RepoCard[] => {
  const walk = (prevCards: RepoCard[], nextCards: RepoCard[]): RepoCard[] => {
    const prevById = new Map(prevCards.map((c) => [c.id, c] as const));
    return nextCards.map((card) => {
      const prevCard = prevById.get(card.id);
      const prevChildren = Array.isArray(prevCard?.children) ? prevCard!.children : [];
      const nextChildren = Array.isArray(card.children) ? card.children : [];
      const stampedChildren = nextChildren.length ? walk(prevChildren, nextChildren) : undefined;
      const changed = !prevCard || !sameCardShape(prevCard, { ...card, children: stampedChildren || [] });
      const out: RepoCard = { ...card };
      if (stampedChildren) out.children = stampedChildren;
      if (changed) out.lastEdited = now;
      return out;
    });
  };
  return walk(prev, next);
};

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
// The ✅ emoji-approval cycle: just the workflow statuses (skips disabled/preview),
// so a tap advances Set status → Assigned → Pending → Approved → Rejected → back.
const APPROVE_ORDER: CardMode[] = ['enabled', 'assigned', 'pending', 'approved', 'rejected'];
const nextApprove = (m?: string): CardMode => { const i = APPROVE_ORDER.indexOf(modeOf(m)); return APPROVE_ORDER[i < 0 ? 1 : (i + 1) % APPROVE_ORDER.length]; };

// A study-path PROMPT card is one whose description (or AI prompt) starts with a
// blue circle 🔵 — the agreed marker that "this card holds a slide-generation
// prompt". The 🎬 study button opens the slide tool with that prompt as the topic.
const PROMPT_MARK = '🔵';
const promptTextOf = (c: RepoCard): string => {
  const t = String(c.text || '').trim();
  if (t.startsWith(PROMPT_MARK)) return t.slice(PROMPT_MARK.length).trim();
  const p = String(c.aiPrompt || '').trim();
  if (p.startsWith(PROMPT_MARK)) return p.slice(PROMPT_MARK.length).trim();
  return '';
};
const isPromptCard = (c: RepoCard): boolean => !!promptTextOf(c);

const normTopic = (s: string) => s.trim().replace(/^[-•*\d.)\s]+/, '').replace(/\s+/g, ' ');
const splitTopics = (raw: string): string[] => {
  const clean = String(raw || '').replace(/^\s*🔵\s*/, '').trim();
  if (!clean) return [];
  const parts = clean
    .split(/\r?\n|[;,]|\s\|\s|\s+and\s+/i)
    .map(normTopic)
    .filter((t) => t.length >= 3)
    .slice(0, 16);
  if (parts.length >= 2) return parts;
  return clean.length <= 180 ? [clean] : [];
};

const uniqTopics = (items: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of items) {
    const v = normTopic(t);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
};

const flattenCards = (list: RepoCard[]): RepoCard[] => list.flatMap((c) => [c, ...(c.children?.length ? flattenCards(c.children) : [])]);

const findPathToCard = (list: RepoCard[], id: string, path: RepoCard[] = []): RepoCard[] | null => {
  for (const c of list) {
    const next = [...path, c];
    if (c.id === id) return next;
    if (c.children?.length) {
      const hit = findPathToCard(c.children, id, next);
      if (hit) return hit;
    }
  }
  return null;
};

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

// Per-unit colors for the nested-card guide lines — one hue per top-level unit,
// cycled if there are more units than colors. Distinct + legible on the paper bg.
const UNIT_LINE_COLORS = ['#d1495b', '#3a6ea5', '#2e8b57', '#e08a1e', '#7b5cd6', '#1f9e9e', '#c9518a', '#9a6a3f'];

// A settings toggle row (icon · label · ON/OFF pill). Defined at MODULE scope (not
// inline in the render) so React reconciles it in place instead of remounting the
// whole list on every toggle — which would empty the 186px scroll area and snap it
// back to the top, losing your place at the switch you just clicked.
function SettingRow({ icon, label, hint, on, onClick }: { icon: string; label: string; hint?: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={hint}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 11px', borderRadius: 10, border: '1.5px solid var(--ink)', background: 'rgba(0,0,0,0.02)', cursor: 'pointer' }}>
      <span style={{ fontSize: 18, flex: '0 0 auto' }}>{icon}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 11, opacity: 0.55 }}>{hint}</span>}
      </span>
      <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, border: '1.5px solid var(--ink)', background: on ? 'var(--accent,#2d6cdf)' : 'transparent', color: on ? '#fff' : 'inherit' }}>{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}

// A collection card rendered through the SAME shared CardShell used by the home
// gallery — adapted to a repo card: title, description, cover image, a favorite
// ★, and the attachments as footer buttons. Owner/admin edit IN PLACE: a ✎ pencil
// sits next to the title (with 🎨 to AI-rewrite it) and another ✎ next to the
// subtitle, so you edit the thing you click. Card-level actions stay small and
// bare: ⚙️ add a sibling, ➕ add a card inside, 🗑 delete. In rows view all nested
// cards are shown; in grid view a card is shown alone (click it to flip to rows).
function RepoCollectionCard({ card, view, ctx, switchToRows, nested, imgSize, unitColor }: { card: RepoCard; view: 'grid' | 'row'; ctx: ViewCtx; switchToRows?: () => void; nested?: boolean; imgSize?: number; unitColor?: string }) {
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
  // PAYWALL: a card locked behind a paywall is greyed + content-blocked for anyone
  // who is not the owner/admin and not on the repo's authorized-users list.
  const locked = !!card.paywall && !ctx.canEdit && !ctx.authorizedUsers.includes(ctx.me || '');
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
  const [attachColor, setAttachColor] = useState<'blue' | 'green' | 'ref'>('blue');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [attachBusy, setAttachBusy] = useState(false); // 📎 file upload in progress
  const [genBusy, setGenBusy] = useState(false);       // 🖼️ AI product-image generation
  const [showImg, setShowImg] = useState(false);       // 🖼️ image popup open
  const [copied, setCopied] = useState(false);         // 📋 copy title+description feedback
  const [aiOpen, setAiOpen] = useState(false);         // 🤖 AI-question prompt editor open
  const [aiDraft, setAiDraft] = useState('');          // 🤖 prompt draft
  const [aiBusy, setAiBusy] = useState(false);         // 🤖 generating an answer child
  const [settingsOpen, setSettingsOpen] = useState(false); // ⚙️ card-settings popup open
  const [settingsPage, setSettingsPage] = useState(0);     // ⚙️ popup pagination
  // 🔀 per-card order for THIS card's nested cards: manual → ascending → descending
  // → random (a nonce reshuffles "random"). Falls back to the repo-wide order when
  // manual, so the global toggle still governs cards left on manual.
  const [childSort, setChildSort] = useState<'manual' | 'asc' | 'desc' | 'random'>('manual');
  const [childSortN, setChildSortN] = useState(0);
  // Cycle this card's own order: manual → ascending → descending → random → manual.
  // "random" reshuffles every time it lands back on random (bump the nonce).
  const cycleChildSort = () => {
    setChildSort((m) => (m === 'manual' ? 'asc' : m === 'asc' ? 'desc' : m === 'desc' ? 'random' : 'manual'));
    setChildSortN((n) => n + 1);
  };
  // Order THIS card's nested cards. Manual defers to the repo-wide order so the
  // global toggle still governs cards left on manual; otherwise sort by creation
  // date (oldest/newest) or a stable per-nonce shuffle.
  const sortKids = (list: RepoCard[]): RepoCard[] => {
    if (childSort === 'manual') return ctx.sortCards(list);
    if (list.length < 2) return list;
    const arr = [...list];
    if (childSort === 'random') {
      const h = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
      return arr.map((c) => ({ c, k: h(c.id + ':' + childSortN) })).sort((a, b) => a.k - b.k).map((x) => x.c);
    }
    const key = (c: RepoCard) => (c.createdAt ? Date.parse(c.createdAt) || 0 : 0);
    return arr.sort((a, b) => (childSort === 'asc' ? key(a) - key(b) : key(b) - key(a)));
  };
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

  // PAYWALL for a non-authorized viewer: the card is greyed out with a 🔒 lock and
  // its content is blocked — only the title shows. Owner/admin and authorized users
  // fall through and see the whole card.
  if (locked) {
    return (
      <div style={{ opacity: 0.55, pointerEvents: 'none' }} title="Locked — authorized users only">
        <CardShell view={view} title={`🔒 ${card.title || 'Untitled'}`} subtitle="Locked — authorized users only" />
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
  // The Moderator (blue) slot is any link that is neither a User (green) upload nor
  // a Reference (ref) material — so 'ref' links don't get mistaken for the turn-in.
  const posterLinkIdx = (() => { for (let i = links.length - 1; i >= 0; i--) { const cl = links[i].color; if (cl !== 'green' && cl !== 'ref') return i; } return -1; })();
  const myUserLinkIdx = links.findIndex((l) => l.color === 'green' && l.by === ctx.me);
  // Reference materials (📄): moderator-posted further-reading links/documents.
  // Many per card; each carries its original array index for open / remove.
  const refLinks = links.map((l, i) => ({ l, i })).filter((x) => x.l.color === 'ref');
  // Card ROLE in a lesson path: the 🔵 slide-build PROMPT card is the leaf; the
  // OBJECTIVE is the card directly above it (its child is a prompt). The turn-in
  // slots (📎 moderator + 📁 user) belong ONLY to objective cards; the 📄 reference
  // materials go on everything EXCEPT the prompt card.
  const isPrompt = isPromptCard(card);
  const isObjective = (card.children || []).some((k) => isPromptCard(k));
  // Who may EDIT each slot (open the editor to add / replace / delete):
  //  • 📎 clip = the Moderator's turn-in link — owner/admin only, OBJECTIVE cards.
  //  • 📁 folder = a user's OWN turn-in — any signed-in person, OBJECTIVE cards.
  // A per-card override (posterOff / userOff) can turn a slot off for one card.
  const canPoster = ctx.canEdit && isObjective && !card.posterOff && (ctx.posterUpload || posterLinkIdx >= 0);
  const canUser = !!ctx.me && isObjective && !card.userOff && (ctx.userUpload || myUserLinkIdx >= 0);
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
  // 'ref' (reference materials) allow MANY per card, so there is no single slot —
  // return -1 so commitLink always APPENDS a new reference instead of replacing.
  const slotIdx = () => (attachColor === 'ref' ? -1 : attachColor === 'green' ? myUserLinkIdx : posterLinkIdx);
  // Save a link/file into the current slot: if it already holds one, REPLACE it
  // (remove the old, add the new) so a slot only ever carries a single attachment.
  const commitLink = async (label: string, url: string) => {
    const idx = slotIdx();
    if (idx >= 0) await attachServer({ action: 'remove', index: idx });
    await attachServer({ action: 'add', color: attachColor, link: { label: label.slice(0, 15) || 'Link', url } });
  };
  // Open the inline editor for a role — pre-filled with the existing values when
  // editing. Clicking the same role's icon again closes it.
  const openAttach = (color: 'blue' | 'green' | 'ref', existingIdx: number) => {
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
  // 📄 "File upload in editor" (docUpload) = REFERENCE materials. The moderator adds
  // further-reading links or documents through the same inline editor (link OR a
  // document), appended as 'ref' attachments. Many per card; each shows to every
  // viewer as a green "reference" download pill at the card's foot.
  const openRef = () => openAttach('ref', -1);

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

  // Inline title / description editors. The ✎ / 🎨 / 🔢 / 🎲 triggers moved into
  // the ⚙️ Card-settings popup — only the input row still renders inline, in
  // place, once editing starts (from the popup).
  const afterTitle = ctx.canEdit && editingTitle ? (
    <span style={editorRow} onClick={stop}>
      <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
        style={{ fontSize: 14, minWidth: 120 }} onClick={stop} />
      <button className="btn small green" onClick={saveTitle}>Save</button>
      <button className="btn small ghost" onClick={() => setEditingTitle(false)}>✕</button>
    </span>
  ) : null;

  const afterSubtitle = ctx.canEdit && editingSub ? (
    <span style={editorRow} onClick={stop}>
      <input autoFocus value={subDraft} placeholder="Description" maxLength={300} onChange={(e) => setSubDraft(e.target.value.slice(0, 300))}
        onKeyDown={(e) => { if (e.key === 'Enter') saveSub(); if (e.key === 'Escape') setEditingSub(false); }}
        style={{ fontSize: 13, minWidth: 120 }} onClick={stop} />
      <button className="btn small green" onClick={saveSub}>Save</button>
      <button className="btn small ghost" onClick={() => setEditingSub(false)}>✕</button>
    </span>
  ) : null;

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
  // Owner/admin cycle: Enabled → Assigned → Pending → Approved → Rejected
  // → Disabled → Preview. Setting it back to Enabled clears the field. The cycle
  // now lives in the ⚙️ Card-settings popup; the card shows only the read-only
  // status chip (which everyone sees on cards with a real workflow status).
  const cycleMode = () => { const nm = nextMode(card.mode); ctx.editField(card.id, { mode: nm === 'enabled' ? undefined : nm }); };
  const assignControl = isStatus ? statusChip : null;

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
  // 📎 Moderator TURN-IN reference — only on OBJECTIVE cards. Everyone can OPEN a
  // saved one from the card; the moderator opens the editor to add/replace/delete.
  if (isObjective && posterLinkIdx >= 0 && !card.posterOff) {
    if (canPoster) activeControls.push(<button key="clip" type="button" title={posterLinkIdx >= 0 ? 'Edit or delete the turn-in reference' : 'Attach a turn-in reference'} style={attachIcon(true)} onClick={eat(clipAction)}>📎</button>);
    else activeControls.push(dlAnchor('clip', links[posterLinkIdx].url, '📎', 'Open the Moderator turn-in reference'));
  } else if (canPoster && posterLinkIdx < 0) {
    activeControls.push(<button key="clip" type="button" title="Attach a turn-in reference (link or document)" style={attachIcon(false)} onClick={eat(clipAction)}>📎</button>);
  }
  // 📁 User TURN-IN upload — only on OBJECTIVE cards. The owner of the upload edits
  // their own; anyone else opens it.
  if (canUser || (isObjective && myUserLinkIdx >= 0)) {
    if (canUser) activeControls.push(<button key="folder" type="button" title={myUserLinkIdx >= 0 ? 'Edit or delete your turn-in' : 'Turn in your own file or link'} style={attachIcon(myUserLinkIdx >= 0)} onClick={eat(folderAction)}>📁</button>);
    else if (myUserLinkIdx >= 0) activeControls.push(dlAnchor('folder', links[myUserLinkIdx].url, '📁', 'Open the turn-in'));
  }
  // 📄 REFERENCE materials (docUpload) — on every card EXCEPT the 🔵 prompt card.
  // Moderator-only icon that opens the editor to add a link OR a document (many
  // per card). Viewers never see this icon — only the green reference pills below.
  if (ctx.canEdit && ctx.docUpload && !isPrompt) {
    activeControls.push(
      <button key="ref" type="button" title="Add reference material — a link or document for further reading (everyone can open it)"
        style={attachIcon(refLinks.length > 0)} onClick={eat(openRef)}>📄</button>
    );
  }
  // 🤖 AI-question editing moved to the ⚙️ popup; these save/clear handlers back it.
  const saveAi = () => { ctx.editField(card.id, { aiPrompt: aiDraft.trim() || undefined }); setAiOpen(false); };
  const clearAi = () => { ctx.editField(card.id, { aiPrompt: undefined }); setAiDraft(''); setAiOpen(false); };

  // 🖼️ card picture — the card keeps the VIEW button once a picture exists (any
  // viewer); generating/regenerating moved to the ⚙️ popup.
  if (hasGen) activeControls.push(
    <button key="img" type="button" onClick={eat(frameClick)} disabled={genBusy}
      title={ctx.canEdit ? 'View the picture — regenerate or delete it' : 'View the picture'}
      style={attachIcon(true)}>{genBusy ? '⏳' : '🖼️'}</button>
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
  // 🔀 Order this card's own nested cards. One button whose BOTTOM line changes
  // colour per mode (manual = none, ascending = green, descending = blue,
  // random = orange); the hover title spells out each state. Moderator/admin
  // only, and only when there is more than one nested card to reorder.
  if (ctx.canEdit && kids.length > 1) {
    const CS_COLOR: Record<typeof childSort, string> = { manual: 'transparent', asc: '#2e9e57', desc: '#5c80bc', random: '#f0a202' };
    const CS_TIP: Record<typeof childSort, string> = {
      manual: 'Order of nested cards: Manual (as arranged) — click to sort',
      asc: 'Order of nested cards: Oldest first (green) — click for Newest',
      desc: 'Order of nested cards: Newest first (blue) — click for Random',
      random: 'Order of nested cards: Random (orange) — click for Manual',
    };
    permanentControls.push(
      <button key="csort" type="button" title={CS_TIP[childSort]}
        style={{ ...iconBtn, borderBottom: `3px solid ${CS_COLOR[childSort]}`, borderRadius: 3, paddingBottom: 1 }}
        onClick={eat(cycleChildSort)}>🔀</button>,
    );
  }
  // 🎬 Study — on the 🔵 PROMPT card in study mode. Opens the repo's slide tool with
  // this objective's prompt PRESET in the settings (topic + context), WITHOUT auto-
  // generating — the learner sets level/tone, then clicks Generate slides there.
  if (ctx.studyMode && isPrompt) activeControls.push(
    <button key="study" type="button" title="Study this objective: opens the slide tool with this prompt preset in the settings — set the level & tone, then generate the slides."
      style={{ ...iconBtn, fontSize: 16 }} onClick={eat(() => ctx.openStudy(promptTextOf(card), card, { autoGenerate: false }))}>🎬</button>,
  );

  // ── ⚙️ Card settings — ALL owner/moderator controls for this card, gathered in
  // one popup instead of a pile of icons. Each entry: emoji, name, description
  // (also the hover title), a state chip when it's a toggle/status, and the same
  // handler the old inline icon ran. `keepOpen` keeps the popup up for toggles.
  type CtlEntry = { key: string; icon: string; label: string; desc: string; state?: string; on?: boolean; keepOpen?: boolean; disabled?: boolean; run: () => void };
  const settingsEntries: CtlEntry[] = [];
  if (ctx.canEdit) {
    settingsEntries.push(
      { key: 'title', icon: '✎', label: 'Edit title', desc: 'Rename this card — an inline editor opens next to the title.', run: openTitle },
      { key: 'title-ai', icon: '🎨', label: 'AI reword title', desc: 'The AI rephrases the title (same meaning, new wording).', disabled: distorting, run: distort },
      { key: 'desc', icon: '✎', label: 'Edit description', desc: 'Change the card’s description text (up to 300 characters).', run: openSub },
      { key: 'desc-ai', icon: '🎨', label: 'AI reword description', desc: 'The AI rephrases the description in place.', disabled: distorting, run: distortSub },
      { key: 'number', icon: '🔢', label: 'Number icon', desc: 'Set the icon to this card’s number within its level.', keepOpen: true, run: () => ctx.numberCard(card.id) },
      { key: 'dice', icon: '🎲', label: 'Random emoji icon', desc: 'Roll a fresh emoji icon — click again for another.', keepOpen: true, run: () => ctx.setIcon(card.id, { icon: randomEmoji(card.icon), image: undefined }) },
    );
    if (nested) settingsEntries.push({ key: 'icon-up', icon: '📎', label: 'Upload icon image', desc: 'Use your own picture as this card’s icon.', disabled: imgBusy, run: uploadImage });
    if (canPoster) settingsEntries.push({ key: 'clip', icon: '📎', label: 'Moderator link', desc: 'Attach a link or document every viewer can open from the card.', state: posterLinkIdx >= 0 ? 'Set' : 'Empty', on: posterLinkIdx >= 0, run: clipAction });
    if (ctx.aiShown) settingsEntries.push({ key: 'robot', icon: '🤖', label: 'AI question', desc: 'Write the prompt that guides the AI answer generated by “Add card inside”.', state: card.aiPrompt ? 'Set' : 'Empty', on: !!card.aiPrompt, run: () => { setAiDraft(card.aiPrompt || ''); setAiOpen(true); } });
    if (ctx.imageGen) settingsEntries.push({ key: 'pic', icon: '🖼️', label: 'Card picture', desc: hasGen ? 'View, regenerate or delete the saved AI picture.' : 'Generate an AI picture of this item (saved for everyone).', state: hasGen ? 'Saved' : 'None', on: hasGen, disabled: genBusy, run: frameClick });
    settingsEntries.push(
      { key: 'sib', icon: '🆕', label: aiGen ? 'AI answer at this level' : 'Add card at this level', desc: aiGen ? 'Generate an AI answer card beside this one (uses your 🤖 prompt).' : 'Insert a new blank card right after this one.', disabled: aiBusy, run: () => (aiGen ? genSibling() : ctx.addSibling(card.id)) },
      { key: 'child', icon: '➕', label: aiGen ? 'AI answer inside' : 'Add card inside', desc: aiGen ? 'Generate an AI answer card nested inside (uses your 🤖 prompt).' : 'Insert a new blank card nested inside this one.', disabled: aiBusy, run: () => (aiGen ? genChild() : ctx.addSubcard(card.id)) },
      { key: 'hide', icon: '👁︎', label: 'Hidden from viewers', desc: 'Hide this card from normal users — you still see it greyed.', state: card.hidden ? 'On' : 'Off', on: !!card.hidden, keepOpen: true, run: () => ctx.editField(card.id, { hidden: !card.hidden }) },
    );
    if (ctx.assignShown) settingsEntries.push({ key: 'assign', icon: MODE_BTN[mode], label: 'Assignment status', desc: 'Cycle: Set status → Assigned → Pending → Approved → Rejected → Disabled → Preview.', state: MODE_LABEL[mode], on: isStatus, keepOpen: true, run: cycleMode });
    if (ctx.emojiApprove) settingsEntries.push({ key: 'approve', icon: '✅', label: 'Emoji approval', desc: 'One-tap status cycle (no upload needed): Assigned → Pending → Approved → Rejected.', state: MODE_LABEL[mode], on: isStatus, keepOpen: true, run: () => { const nm = nextApprove(card.mode); ctx.editField(card.id, { mode: nm === 'enabled' ? undefined : nm }); } });
    settingsEntries.push({ key: 'paywall', icon: '🔒', label: 'Paywall', desc: 'Grey the card out and block its content for anyone not on the Authorized users list.', state: card.paywall ? 'On' : 'Off', on: !!card.paywall, keepOpen: true, run: () => ctx.editField(card.id, { paywall: !card.paywall }) });
    if (ctx.userUpload) settingsEntries.push({ key: 'useroff', icon: '📁', label: 'User folder on this card', desc: 'Allow or block the per-user 📁 upload folder on this card only.', state: card.userOff ? 'Off here' : 'On', on: !card.userOff, keepOpen: true, run: () => ctx.editField(card.id, { userOff: !card.userOff }) });
    settingsEntries.push(
      { key: 'up', icon: '▲', label: 'Move up', desc: 'Swap this card with the one above it (same level).', keepOpen: true, run: () => ctx.moveCard(card.id, -1) },
      { key: 'down', icon: '▼', label: 'Move down', desc: 'Swap this card with the one below it (same level).', keepOpen: true, run: () => ctx.moveCard(card.id, 1) },
      { key: 'del', icon: '🗑', label: 'Delete card', desc: 'Remove this card and everything nested inside it.', run: () => ctx.deleteCard(card.id) },
    );
  }
  // The single ⚙ trigger replaces the old icon pile (owner/moderator/admin only).
  if (ctx.canEdit) permanentControls.push(
    <button key="settings" type="button" title="Card settings — every moderator control for this card, organized in one panel"
      style={{ ...iconBtn, fontSize: 16 }} onClick={eat(() => { setSettingsPage(0); setSettingsOpen(true); })}>⚙️</button>,
  );

  // The control cluster. The icon buttons (active + permanent) are laid out on a
  // 3-column grid, so they wrap onto a NEW ROW every 3 icons instead of stretching
  // across one long line. The assignment control/chip (a wider LABELLED button)
  // sits on its own line above the icon grid.
  const iconButtons = [...activeControls, ...permanentControls];
  const iconGrid = (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flex: '0 0 auto' }}>
      {assignControl && <div>{assignControl}</div>}
      {iconButtons.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '4px 6px', justifyItems: 'center', alignItems: 'center' }}>
          {iconButtons}
        </div>
      )}
    </div>
  );
  // Collapse toggle — hides this card's nested cards (the card itself stays). Only
  // meaningful in rows view where the tree is drawn; available to every viewer.
  const collapseBtn = (view === 'row' && kids.length > 0) ? (
    <button type="button" onClick={() => setCollapsed((c) => !c)}
      title={collapsed ? `Expand ${kids.length} card${kids.length === 1 ? '' : 's'} inside` : 'Collapse the cards inside'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1, opacity: 0.75, flex: '0 0 auto' }}>{collapsed ? '▸' : '▾'}</button>
  ) : null;
  const actions = (
    <>
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
  // When the section exposes the IMAGE-size dropdown, honor it: No image hides the
  // picture, Small/Medium/Large/Cover resize it (same mapping the gallery cards use).
  const imgProps = imgSize != null ? cardImageProps(imgSize) : {};
  const shell = (
    <CardShell view={view}
      gridHeight={isGrid ? 340 : undefined}
      {...imgProps}
      rowTextLines={2}
      title={editingTitle ? '' : (card.title || 'Untitled')}
      subtitle={editingSub ? ' ' : (card.text || '')}
      thumbnail={isImg(card.image) ? card.image : null}
      badge={dimmed ? '🙈 hidden' : (ctx.canEdit && mode === 'disabled' ? '🚫 disabled' : ctx.canEdit && mode === 'preview' ? '👓 preview' : (view === 'grid' && kids.length ? `📂 ${kids.length} inside` : undefined))}
      onOpen={open}
      leading={isGrid ? undefined : collapseBtn}
      iconNode={iconNode}
      meta={ctx.showDates && (card.createdAt || card.lastEdited) ? (
        <span style={{ fontSize: 10.5, opacity: 0.55, display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          {card.createdAt && <span>🕒 created {new Date(card.createdAt).toLocaleString()}</span>}
          {card.lastEdited && card.lastEdited !== card.createdAt && <span>✏️ edited {new Date(card.lastEdited).toLocaleString()}</span>}
        </span>
      ) : undefined}
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
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>{attachColor === 'green' ? '📁 User — your own turn-in link or document (only you or an admin can remove it)' : attachColor === 'ref' ? '📄 Reference — a link or document for further reading (everyone can open it; add as many as you like)' : '📎 Moderator — a turn-in reference link or document everyone can open'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={linkUrl} placeholder="Paste a link (https://…)" onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }} style={{ flex: '3 1 220px', fontSize: 13 }} />
        {/* All three slots (📎 turn-in · 📁 user · 📄 reference) take a link OR a
            document, so the attach-a-document button is always available here. */}
        <label className="btn small ghost" style={{ cursor: 'pointer' }} title="Attach a document or file from your device">
          {attachBusy ? 'Uploading…' : '📎 Attach a document'}
          <input type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) attachUpload(f); e.currentTarget.value = ''; }} />
        </label>
        <button className={`btn small ${attachColor === 'ref' ? 'blue' : attachColor}`} disabled={!linkUrl.trim()} onClick={addLink}>{attachColor === 'ref' ? '✓ Add' : hasSlot ? '✓ Replace' : '✓ Submit'}</button>
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

  // ⚙️ Card-settings popup — the organized panel of every moderator control for
  // this card: paper card + dashed rule, a grid of hoverable tiles (emoji, name,
  // short description, state chip), paginated when they don't all fit.
  const TILES_PER_PAGE = 8;
  const settingsPopup = settingsOpen && ctx.canEdit ? (() => {
    const pages = Math.max(1, Math.ceil(settingsEntries.length / TILES_PER_PAGE));
    const p = Math.min(settingsPage, pages - 1);
    const slice = settingsEntries.slice(p * TILES_PER_PAGE, (p + 1) * TILES_PER_PAGE);
    return (
      <div onClick={eat(() => setSettingsOpen(false))} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div className="card" onClick={stop} style={{ maxWidth: 640, width: '100%', padding: '14px 16px', maxHeight: '86vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 15 }}>⚙️ Card settings <span style={{ opacity: 0.55, fontWeight: 400 }}>— {card.title || 'Untitled'}</span></b>
            <button className="btn small ghost" onClick={eat(() => setSettingsOpen(false))}>✕</button>
          </div>
          <p style={{ fontSize: 12, opacity: 0.65, margin: '2px 0 8px' }}>Every moderator control for this card. Green chips show what’s active; toggles keep the panel open.</p>
          <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.45, margin: '0 0 10px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
            {slice.map((en) => (
              <button key={en.key} type="button" className="ctl-tile" disabled={en.disabled} title={en.desc}
                onClick={eat(() => { en.run(); if (!en.keepOpen) setSettingsOpen(false); })}>
                <span style={{ fontSize: 22, lineHeight: 1.2, flex: '0 0 auto' }} aria-hidden>{en.icon}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                    <b style={{ fontSize: 13 }}>{en.label}</b>
                    {en.state && <span style={{ borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 700, lineHeight: 1.5, color: en.on ? '#fff' : 'var(--ink)', background: en.on ? '#2e9e57' : 'rgba(0,0,0,0.08)', flex: '0 0 auto' }}>{en.state}</span>}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, opacity: 0.65, lineHeight: 1.35, marginTop: 2 }}>{en.desc}</span>
                </span>
              </button>
            ))}
          </div>
          {pages > 1 && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
              <button className="btn small ghost" disabled={p <= 0} onClick={eat(() => setSettingsPage(p - 1))}>‹ Prev</button>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Page {p + 1} / {pages}</span>
              <button className="btn small ghost" disabled={p >= pages - 1} onClick={eat(() => setSettingsPage(p + 1))}>Next ›</button>
            </div>
          )}
        </div>
      </div>
    );
  })() : null;

  // 🟢 REFERENCE pills at the foot of the card — one green download link per 📄
  // reference material, shown to EVERYONE (users included) for further reading.
  // The moderator/admin also gets a ✕ on each pill to remove it; users just open.
  const docLight = (!isPrompt && refLinks.length > 0) ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {refLinks.map(({ l, i }) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px 3px 10px', borderRadius: 999, border: '1.5px solid #2e9e57', background: 'rgba(46,158,87,0.12)' }}>
          <a href={l.url} target="_blank" rel="noopener noreferrer" download onClick={stop} title={`Open ${l.label || 'the reference'}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1f7a3d', fontSize: 11.5, fontWeight: 700, textDecoration: 'none' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#2e9e57', boxShadow: '0 0 5px #2e9e57', flex: '0 0 auto' }} />
            📄 {l.label || 'Reference'}
          </a>
          {ctx.canEdit && <button type="button" title="Remove this reference" onClick={eat(() => removeLinkAt(i))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, opacity: 0.7, padding: 0, color: '#1f7a3d' }}>✕</button>}
        </span>
      ))}
    </div>
  ) : null;

  // A disabled card is greyed + unclickable for viewers; a hidden card (owner/
  // admin preview) is just greyed.
  const body = <div style={blocked ? { opacity: 0.5, pointerEvents: 'none' as const } : (dimmed ? { opacity: 0.5 } : undefined)}>{shell}{docLight}{attachForm}{aiForm}{imgPopup}{settingsPopup}</div>;

  // GRID view: a card is shown ALONE — no nested cards beneath it (clicking a
  // card with children flips to the rows view to reveal the tree). ROWS view
  // draws ALL nested cards, always.
  if (view === 'grid' || !kids.length) return <div>{body}</div>;
  return (
    <div>
      {body}
      {!collapsed && (
        <div style={{ marginLeft: 14, marginTop: 8, borderLeft: `3px solid ${unitColor || 'var(--accent, #5c80bc)'}`, paddingLeft: 10, display: 'grid', gap: 8 }}>
          {sortKids(kids).map((k) => <RepoCollectionCard key={k.id} card={k} view="row" ctx={ctx} nested imgSize={imgSize} unitColor={unitColor} />)}
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
  // 📄 file uploads — persisted. Off by default (link-only); the moderator turns it
  // on to enable the "Attach a document" button in the attach editor.
  const [docUpload, setDocUpload] = useState(!!repo.docUpload);
  // 🕒 show each card's created date/time — persisted, default on. Owner/admin
  // toggle with the 👁 dates button.
  const [showDates, setShowDates] = useState(repo.showDates !== false);
  // PERSISTED repo-wide switches for the Moderator (📎 clip) and User (📁 folder)
  // attach features. When ON, every card offers that upload; when OFF, the icon is
  // hidden EXCEPT on cards that already hold an attachment (which stay viewable /
  // manageable). Stored on the repo as clipForAll / folderForAll.
  const [posterUpload, setPosterUpload] = useState(!!repo.clipForAll);
  const [userUpload, setUserUpload] = useState(!!repo.folderForAll);
  // Authorized users — usernames that can view PAYWALLED cards without the lock
  // (in addition to the owner/admin). Persisted repo-wide.
  const [authorizedUsers, setAuthorizedUsers] = useState<string[]>(repo.authorizedUsers || []);
  // ✅ Emoji approval — show the per-card one-tap status-cycle emoji. Persisted.
  const [emojiApprove, setEmojiApprove] = useState(!!repo.emojiApprove);
  // 🎬 Study path — mark this repo as one that carries 🔵 prompt cards, and set the
  // slide tool the "generate slides" button opens. Persisted.
  const [studyMode, setStudyMode] = useState(!!repo.studyMode);
  const [studyToolSlug, setStudyToolSlug] = useState(repo.studyToolSlug || '');
  // Known usernames for the Authorized-users picker dropdown. Best-effort: the
  // /api/users list is admin-only, so a non-admin owner just types a username.
  const [knownUsers, setKnownUsers] = useState<string[]>([]);
  const [authInput, setAuthInput] = useState('');
  useEffect(() => {
    if (!canEdit) return;
    API.get('/api/users').then((r: any) => { if (Array.isArray(r)) setKnownUsers(r.map((u: any) => String(u.username || '')).filter(Boolean)); }).catch(() => { /* not an admin — manual entry only */ });
  }, [canEdit]);
  // 🎬 Study-path tool picker: the list of presentation (lesson) tools the owner
  // can point the 🎬 buttons at, plus a search box. Beats typing a raw slug.
  const [studyToolList, setStudyToolList] = useState<{ slug: string; title: string }[]>([]);
  // The redesigned top "create a lesson" wizard: which approach the owner picked in
  // step 1 (existing tool / new tool / AI build). Drives step 2's fields.
  const [approach, setApproach] = useState<'existing' | 'create' | 'ai'>('existing');
  // The ⚙️ repo-controls popup (owner/moderator only). All the feature toggles that
  // used to sprawl across the toolbar now live in this guided wizard modal.
  const [controlsStep, setControlsStep] = useState(0);   // page in the inline settings wizard card
  // Whether the whole repo-settings card is expanded. It starts HIDDEN every time the
  // page loads — the owner reveals it with the "Repo settings" bar when they need it.
  const [repoSettingsOpen, setRepoSettingsOpen] = useState(false);
  const toggleRepoSettings = () => setRepoSettingsOpen((o) => !o);
  // Fields for a newly created slide tool.
  const [ccSubject, setCcSubject] = useState('');
  const [ccLevel, setCcLevel] = useState('Beginner');
  const [ccSlides, setCcSlides] = useState(8);
  const [ccLength, setCcLength] = useState<'brief' | 'medium' | 'detailed'>('medium');
  const [ccTone, setCcTone] = useState('');
  useEffect(() => {
    if (!canEdit) return;
    API.get('/api/tools').then((r: any) => {
      const list = Array.isArray(r?.tools) ? r.tools : [];
      // Presentations = the 'lesson' archetype (the scored slide deck). These are
      // the tools a study prompt should open.
      const slides = list.filter((t: any) => (t.archetype || t.definition?.archetype) === 'lesson')
        .map((t: any) => ({ slug: String(t.slug || ''), title: String(t.title || t.definition?.title || t.slug || '') }))
        .filter((t: any) => t.slug);
      // De-dupe by slug (featured examples + owned can overlap).
      const seen = new Set<string>();
      setStudyToolList(slides.filter((t: any) => (seen.has(t.slug) ? false : (seen.add(t.slug), true))));
    }).catch(() => { /* keep manual entry */ });
  }, [canEdit]);
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
  // 📖 Read-more pagination BY UNIT: a "unit" is one top-level card WITH all of
  // its nested cards. The repo shows the first unit fully; each "Read more" reveals
  // the next whole unit, and "Read less" folds the last unit back — down to one.
  const [readUnits, setReadUnits] = useState(1);
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

  // One place that builds & sends the repo settings payload, so every persisted
  // switch carries ALL the current settings (never dropping authorizedUsers or a
  // sibling toggle). Pass only the field(s) that changed as `over`.
  const postRepo = async (over: Record<string, any> = {}) => {
    const body = {
      layout: repo.layout, display, displayLocked: repo.displayLocked, offlineExport: repo.offlineExport,
      imageGen, clipForAll: posterUpload, folderForAll: userUpload, assignShow: assignShown,
      docUpload, showDates, authorizedUsers, emojiApprove, studyMode, studyToolSlug, cards, ...over,
    };
    const r = await API.post('/api/tools/repo', { slug, repo: body });
    if (r?.repo && def) def.repo = r.repo;
    return r;
  };

  // Persist a new card tree (used by the inline card icons in collection view).
  // Optimistically updates, then reconciles with the sanitized server copy.
  const saveCards = async (next: RepoCard[]) => {
    // Editing is gated by canEdit at the UI level (the User preview has no edit
    // controls), so both the Admin and Moderators views can persist changes —
    // a moderator needs to actually set/cycle statuses, not just look.
    const prev = cards;
    const stamped = stampEditedTree(prev, next, new Date().toISOString());
    setCards(stamped);
    try {
      const r = await postRepo({ cards: stamped });
      if (r?.error) throw new Error(r.error);
      if (r?.repo) setCards(r.repo.cards || stamped);
      dirty.current = false;
    } catch (e: any) {
      setCards(prev);
      dirty.current = false;
      alert(e?.message || 'Could not save this repository.');
    }
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

  // Navigate the repo('tool' view) → a slide tool('tool' view). nav() pushes a
  // single history entry for the slide tool (the repo is already the CURRENT
  // entry), so Back pops straight to this repo; rerender() forces the keyed
  // <main key={tool:slug}> to remount since the view string is unchanged.
  const goToTool = (tool: any) => {
    appState.activeTool = tool;
    app.nav('tool');
    app.rerender();
  };

  const repoTopicCoverage = (focus?: RepoCard): string[] => {
    const all = flattenCards(cards);
    const preferred = all.filter((c) => {
      const tt = `${c.title || ''} ${c.subtitle || ''}`.toLowerCase();
      return isPromptCard(c) || /\b(topic|topics|cover|coverage|card\s*2|lesson\s*2)\b/.test(tt);
    });
    const src = preferred.length ? preferred : all;
    const core = src.flatMap((c) => splitTopics(promptTextOf(c) || c.text || ''));
    const aroundFocus = focus ? splitTopics(promptTextOf(focus) || focus.text || focus.title || '') : [];
    return uniqTopics([...aroundFocus, ...core]).slice(0, 24);
  };

  const studySeedFromCard = (promptText: string, sourceCard?: RepoCard) => {
    const repoTitle = String(def?.title || 'Study path').trim();
    const path = sourceCard ? findPathToCard(cards, sourceCard.id) : null;
    const unit = (path && path.length > 0 ? path[0] : undefined) || sourceCard;
    const unitTitle = String(unit?.title || '').trim();
    const cardTitle = String(sourceCard?.title || '').trim();
    const cardPrompt = String(promptText || '').trim() || (sourceCard ? promptTextOf(sourceCard) : '');
    const cardTopics = sourceCard ? splitTopics(cardPrompt || sourceCard.text || sourceCard.title || '') : [];
    const unitTopics = unit ? uniqTopics(flattenCards([unit]).flatMap((c) => splitTopics(promptTextOf(c) || c.text || ''))).slice(0, 12) : [];
    const topics = uniqTopics([...cardTopics, ...unitTopics, ...repoTopicCoverage(sourceCard)]).slice(0, 16);
    const topic = cardPrompt || (topics.length ? topics.join(', ') : '') || cardTitle || unitTitle || repoTitle;

    // Where this lesson sits in its unit, and what EARLIER lessons already taught —
    // computed LIVE from the repo (so a renamed title never breaks the link), so the
    // generator can build FORWARD instead of repeating the previous lesson's content.
    const lessonCard = path && path.length > 1 ? path[1] : undefined;
    const unitLessons = (unit?.children || []).filter(Boolean) as RepoCard[];
    const lessonIndex = lessonCard ? unitLessons.findIndex((l) => l.id === lessonCard.id) : -1;
    const lessonCount = unitLessons.length;
    const lessonTitle = cardTitle || String(lessonCard?.title || '').trim();
    // GLOBAL order across the whole course: flatten every unit's lessons in order, so a
    // lesson gets a 1-based sequence number telling the learner which order to play them.
    const allLessons: RepoCard[] = [];
    for (const u of (cards || [])) for (const l of (u.children || [])) allLessons.push(l);
    const lessonSeq = lessonCard ? (allLessons.findIndex((l) => l.id === lessonCard.id) + 1) : 0;
    const lessonSeqTotal = allLessons.length;
    const shortDesc = (c?: RepoCard) => {
      const t = String(c?.text || '').trim() || String((c?.children && c.children[0]?.text) || '').trim() || String(c?.title || '').trim();
      return t.replace(/\s+/g, ' ').slice(0, 160);
    };
    const priorLessons = lessonIndex > 0 ? unitLessons.slice(0, lessonIndex) : [];
    const priorLine = priorLessons.map((l, i) => `Lesson ${i + 1} "${String(l.title || '').trim()}": ${shortDesc(l)}`).filter(Boolean).join(' | ');

    const customInstructions = [
      `Use this repository as the source of truth: ${repoTitle}.`,
      unitTitle ? `Unit to teach now: ${unitTitle}.` : '',
      cardTitle ? `Source card: ${cardTitle}.` : '',
      (lessonSeq > 0 && lessonSeqTotal > 0) ? `This is lesson ${lessonSeq} of ${lessonSeqTotal} in the course (unit lesson ${lessonIndex + 1} of ${lessonCount}).` : '',
      priorLine ? `Earlier lessons ALREADY taught the following as THEIR main topics — the learner has already studied them: ${priorLine}. Treat this knowledge as KNOWN. You may reference it in a SINGLE short clause only when it's needed to make sense of THIS lesson's new idea — but do NOT re-teach, re-derive or re-explain it in depth (no paragraph revisiting a previous lesson's topic). Reserve the depth and detail for THIS lesson's own new topic, like a later chapter that assumes the earlier chapters were read.` : '',
      topics.length ? `Topics to cover in this lesson: ${topics.join('; ')}.` : '',
      'Keep slide sequence cohesive: introduction, core ideas, then application/check questions tied to these topics.',
    ].filter(Boolean).join(' ');
    return { topic, topics, customInstructions, repoTitle, unitTitle, lessonTitle, lessonIndex, lessonCount, lessonSeq, lessonSeqTotal };
  };

  // Open the configured slide tool with card-aware seed data. If no study tool is
  // configured yet and the editor has permission, auto-create one from the repo.
  const openStudy = async (promptText: string, sourceCard?: RepoCard, opts?: { autoGenerate?: boolean }) => {
    const seed = studySeedFromCard(promptText, sourceCard);
    const autoGenerate = opts?.autoGenerate !== false;
    // What EARLIER lessons in this unit actually taught (from saved lesson logs), so the
    // new lesson builds on real prior content — like a later chapter — not just the
    // outline. Deduped to the most-recent log per earlier lesson.
    let taught = '';
    if (typeof seed.lessonIndex === 'number' && seed.lessonIndex > 0) {
      const priorLogs = entries.filter((e: any) => e?.data?.__lessonLog && typeof e.data.lessonIndex === 'number' && e.data.lessonIndex < seed.lessonIndex);
      const byLesson: Record<number, any> = {};
      for (const e of priorLogs) { const li = e.data.lessonIndex; if (!byLesson[li] || new Date(e.data.playedAt) > new Date(byLesson[li].data.playedAt)) byLesson[li] = e; }
      const parts = Object.keys(byLesson).map(Number).sort((a, b) => a - b).map((li) => {
        const d = byLesson[li].data;
        const pts = (d.slides || []).map((s: any) => s.title).filter(Boolean).slice(0, 8).join('; ');
        return `Lesson ${li + 1}${d.lessonTitle ? ` "${d.lessonTitle}"` : ''} already taught: ${pts || d.topic || ''}`;
      });
      if (parts.length) taught = ` PREVIOUSLY TAUGHT in this course (build on this like a later chapter — assume the learner already knows it, do NOT re-explain it): ${parts.join(' | ')}.`;
    }
    // Link the generated lesson to its ORIGIN repo by the stable slug (never the title,
    // which can change) + a short reference code, plus the unit/lesson position — all
    // carried into the run record and named inside the custom instructions.
    const ref = repoRef(slug);
    const seqLabel = seed.lessonSeq > 0 ? ` · lesson ${seed.lessonSeq} of ${seed.lessonSeqTotal} in the course` : '';
    const originLine = ` [Origin repo #${ref} — "${seed.repoTitle}" · slug:${slug}${seed.unitTitle ? ` · unit:${seed.unitTitle}` : ''}${seqLabel}]`;
    appState.slideSeed = {
      topic: seed.topic, slides: ccSlides, customInstructions: seed.customInstructions + taught + originLine, autoGenerate,
      repoSlug: slug, repoRef: ref, repoTitle: seed.repoTitle, unitTitle: seed.unitTitle,
      lessonTitle: seed.lessonTitle, lessonIndex: seed.lessonIndex, lessonCount: seed.lessonCount,
      lessonSeq: seed.lessonSeq, lessonSeqTotal: seed.lessonSeqTotal,
    };
    let s = (studyToolSlug || '').trim();
    if (!s && canEdit) {
      const made = await createStudyTool({ subject: seed.topic, topics: seed.topics, openAfterCreate: false });
      if (made) s = made;
    }
    if (s) {
      try {
        const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(s)}`);
        if (r?.tool) { goToTool(r.tool); return; }
      } catch { /* fall through */ }
      alert(`Could not open the study tool "${s}". Pick it from the list in this repo's Study-path settings.`);
      return;
    }
    if (canEdit) { alert('Could not create or open the study tool from this repository. Check your permissions and try again.'); return; }
    appState.builderSeed = { artifact: 'presentation', subject: seed.topic, context: seed.customInstructions } as any;
    app.nav('toolbuilder');
  };

  const openStudySetup = async () => {
    await openStudy('', undefined, { autoGenerate: false });
  };

  const ctx: ViewCtx = { slug, me, isOwner, done, toggle, entriesByCard, onAdded: loadEntries, favs: myFavs, toggleFav, collapseCmd, levelIndex, assignShown, posterUpload, userUpload, aiShown, canEdit, isAdmin, preview, docUpload, showDates, imageGen, emojiApprove, studyMode, openStudy, authorizedUsers, applyRepo, editField, distortTitle, distortText, addSubcard, addAnswerChild, addAnswerSibling, addSibling, sortCards, moveCard, setIcon, numberCard, deleteCard };

  // Persist the "Suggest AI" toggle (imageGen) without touching cards.
  const saveImageGen = async (next: boolean) => { setImageGen(next); try { await postRepo({ imageGen: next }); } catch { /* keep the optimistic toggle */ } };
  // Persist the Moderator (📎 clip) / User (📁 folder) upload switches.
  const saveUploads = async (poster: boolean, user: boolean) => { setPosterUpload(poster); setUserUpload(user); try { await postRepo({ clipForAll: poster, folderForAll: user }); } catch { /* keep the optimistic toggle */ } };
  // Persist the 🏷️ Assignment feature switch.
  const saveAssign = async (next: boolean) => { setAssignShown(next); try { await postRepo({ assignShow: next }); } catch { /* keep the optimistic toggle */ } };
  // Persist the 📄 file-upload (Attach a document) switch.
  const saveDocUpload = async (next: boolean) => { setDocUpload(next); try { await postRepo({ docUpload: next }); } catch { /* keep the optimistic toggle */ } };
  // Persist the 🕒 show-dates switch.
  const saveShowDates = async (next: boolean) => { setShowDates(next); try { await postRepo({ showDates: next }); } catch { /* keep the optimistic toggle */ } };
  // Persist the 🔒 Authorized-users list (usernames that bypass card paywalls).
  const saveAuthorized = async (next: string[]) => { setAuthorizedUsers(next); try { await postRepo({ authorizedUsers: next }); } catch { /* keep the optimistic list */ } };
  // Persist the ✅ Emoji-approval switch.
  const saveEmojiApprove = async (next: boolean) => { setEmojiApprove(next); try { await postRepo({ emojiApprove: next }); } catch { /* keep the optimistic toggle */ } };
  // Persist the 🎬 Study-path switch + which slide tool it opens.
  const saveStudyMode = async (next: boolean) => { setStudyMode(next); try { await postRepo({ studyMode: next }); } catch { /* keep the optimistic toggle */ } };
  const saveStudyTool = async (next: string) => { setStudyToolSlug(next); try { await postRepo({ studyToolSlug: next }); } catch { /* keep the optimistic value */ } };
  // Create a brand-new slide-generator tool from THIS repo (title + description),
  // wired to the engaging activity catalogue (no tooltips), then point the study
  // buttons at it. The repo's prompt cards then feed topics into this fresh tool.
  const [creatingTool, setCreatingTool] = useState(false);
  const createStudyTool = async (opts?: { subject?: string; topics?: string[]; openAfterCreate?: boolean }): Promise<string | null> => {
    setCreatingTool(true);
    let createdSlug: string | null = null;
    try {
      const topicCoverage = uniqTopics([...(opts?.topics || []), ...repoTopicCoverage()]).slice(0, 16);
      const subject = String(opts?.subject || ccSubject || def?.title || 'Study').trim();
      const definition = buildStudyToolDefinition({ title: def?.title || 'Study', context: def?.description || '', subject, level: ccLevel, slides: ccSlides, length: ccLength, tone: ccTone, topics: topicCoverage });
      const r: any = await API.post('/api/tools', { definition, visibility: 'unlisted' });
      if (r?.slug) {
        createdSlug = r.slug;
        await saveStudyTool(r.slug);
        setStudyToolList((l) => [{ slug: r.slug, title: definition.title }, ...l]);
        // Open the fresh tool (returns to this repo on Back) unless the caller
        // wants to continue a card-driven launch sequence itself.
        if (opts?.openAfterCreate !== false) {
          try { const rr: any = await API.get(`/api/tools?slug=${encodeURIComponent(r.slug)}`); if (rr?.tool) goToTool(rr.tool); } catch { /* stays configured */ }
        }
      } else { alert(r?.error || 'Could not create the slide tool.'); }
    } catch (e: any) { alert(e?.message || 'Could not create the slide tool.'); }
    setCreatingTool(false);
    return createdSlug;
  };
  // Ask the AI to build the tool: hand the tool builder this repo as context.
  const openAiBuilder = () => {
    appState.builderSeed = { artifact: 'presentation', subject: def?.title || '', context: def?.description || '' } as any;
    app.nav('toolbuilder');
  };

  // Display lock: the owner/admin can lock the grid/rows view for a collection so
  // everyone sees the same layout. Persisted on the repo (display + displayLocked).
  const saveDisplayLock = async (lockedNext: boolean, viewSel: 'grid' | 'row') => {
    const nextDisplay: 'bars' | 'grid' = viewSel === 'grid' ? 'grid' : 'bars';
    try { await postRepo({ display: nextDisplay, displayLocked: lockedNext }); } catch { /* ignore */ }
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
      const r = await postRepo({ cards });
      if (r?.repo) { setCards(r.repo.cards || []); dirty.current = false; setSaved('Saved ✓'); }
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

  // Read-more bookkeeping BY UNIT: reveal whole top-level units at a time. Each
  // shown unit keeps ALL of its nested cards (no mid-subtree trimming); only the
  // COUNT of top-level units grows/shrinks.
  const visibleTop = cards.filter((c) => canEdit || !c.hidden);
  const orderedTop = isCollection ? sortCards(visibleTop) : visibleTop;
  const totalUnits = orderedTop.length;
  const shownUnits = Math.min(totalUnits, Math.max(1, readUnits));
  const prunedTop = orderedTop.slice(0, shownUnits);
  const remainingUnits = totalUnits - shownUnits;
  // Each unit's nested-card guide lines get their OWN color (red, blue, green …),
  // shared by every level inside that unit. Keyed by the unit's stable position so
  // the color doesn't shift as units are revealed/folded.
  const unitColorOf = (id: string) => {
    const i = orderedTop.findIndex((c) => c.id === id);
    return UNIT_LINE_COLORS[(i < 0 ? 0 : i) % UNIT_LINE_COLORS.length];
  };
  const studyCardCount = flattenCards(cards).filter((c) => c.kind !== 'section' && (isPromptCard(c) || !!String(c.text || '').trim() || !!String(c.title || '').trim())).length;
  const selectedStudyName = studyToolSlug.trim() ? ((studyToolList.find((t) => t.slug === studyToolSlug)?.title) || studyToolSlug) : '';

  return (
    <div>
      {/* ── Create a lesson from this repo — the SAME half/half wizard-card + mug
          used on the slide-runs page. A guided flow (pick approach → configure →
          act) replaces the old wall of buttons. Owner/admin only; viewers get a
          one-line hint. */}
      {canEdit ? (
        <div style={{ margin: '0 0 12px' }}>
          {/* The repo-settings card, shown INLINE here (it used to open from a ⚙️
              gear popup). Full-width so it spans the whole page. */}
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            {/* Collapsed: a slim bar that expands the repo settings (visible by default). */}
            {!repoSettingsOpen && (
              <div className="card" onClick={toggleRepoSettings} title="Show repo settings"
                style={{ cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ opacity: 0.45, fontSize: 12 }}>▸</span>
                <b>⚙️ 🗂️ Repo settings</b>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, opacity: 0.6 }}>settings hidden — tap to show</span>
              </div>
            )}
            {repoSettingsOpen && (() => {
              const Row = SettingRow;   // stable module-level component — no remount on toggle
              // Shared field wrappers so every repo-settings control looks exactly
              // like a slide-tool field: a title label above a fixed-width control.
              const fieldWrap: React.CSSProperties = { width: '100%', margin: 0 };
              const fieldLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', marginBottom: 4 };
              // Single-column stacks — the two groups sit side by side (see below),
              // so within each group the fields stack vertically to stay compact.
              const stackGrid: React.CSSProperties = { display: 'grid', gap: 12, alignContent: 'start' };
              const colHead: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', opacity: 0.55, margin: '0 0 8px' };
              const hasNested = cards.some((c) => (c.children || []).length > 0);
              // Card order and Nested cards sit on the SAME row (two columns) so step 1
              // stays short — it drops to one column only when there's nothing nested.
              const cardsContent = (
                <div style={{ width: '100%', display: 'grid', gridTemplateColumns: hasNested ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr', gap: 20, alignItems: 'start' }}>
                  <label className="field" style={fieldWrap}>
                    <span style={fieldLabel}>🔀 Card order</span>
                    <button className={`btn ${sortMode === 'manual' ? 'ghost' : 'blue'}`} style={FIELD_CONTROL_STYLE} title="Sort the cards — cycle: Manual → ↑ Oldest → ↓ Newest → 🔀 Random" onClick={cycleSort}>{SORT_LABEL[sortMode]}</button>
                  </label>
                  {hasNested && (
                    <label className="field" style={fieldWrap}>
                      <span style={fieldLabel}>🗂️ Nested cards</span>
                      <button className="btn ghost" style={FIELD_CONTROL_STYLE} title={collapseCmd.on ? 'Expand every card to show its nested cards' : 'Collapse every card — show only the top-level cards'} onClick={() => collapseAll(!collapseCmd.on)}>{collapseCmd.on ? '⊕ Expand all' : '⊖ Collapse all'}</button>
                    </label>
                  )}
                </div>
              );
              const featuresContent = (
                <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8, alignContent: 'start' }}>
                  <Row icon="🏷️" label="Assignment status" hint="Show a status cycle on every card" on={assignShown} onClick={() => saveAssign(!assignShown)} />
                  <Row icon="✅" label="Emoji approval" hint="One-tap status emoji per card" on={emojiApprove} onClick={() => saveEmojiApprove(!emojiApprove)} />
                  <Row icon="🎬" label="Study path" hint="🔵 cards get a lesson-generate button" on={studyMode} onClick={() => saveStudyMode(!studyMode)} />
                  <Row icon="📎" label="Moderator upload" hint="Owner/mod can attach a file to any card" on={posterUpload} onClick={() => saveUploads(!posterUpload, userUpload)} />
                  <Row icon="📁" label="User upload" hint="Users can attach their own file per card" on={userUpload} onClick={() => saveUploads(posterUpload, !userUpload)} />
                  <Row icon="🤖" label="AI question" hint="Each card gets an AI prompt + answer" on={aiShown} onClick={() => setAiShown((v) => !v)} />
                  <Row icon="🖼️" label="Card picture" hint="Generate an AI picture per card" on={imageGen} onClick={() => saveImageGen(!imageGen)} />
                  <Row icon="📄" label="File upload in editor" hint="Enable the attach-a-document button" on={docUpload} onClick={() => saveDocUpload(!docUpload)} />
                  <Row icon="🕒" label="Show dates" hint="Show each card’s created date/time" on={showDates} onClick={() => saveShowDates(!showDates)} />
                </div>
              );
              // Step 1 — just the card controls (order + nested), on one short row.
              const cardsPage = (
                <div style={{ width: '100%' }}>
                  <div style={colHead}>🗂️ Cards &amp; order</div>
                  {cardsContent}
                </div>
              );
              // Step 2 — access: the study-path slide-tool picker plus the paywall
              // bypass list. The invited-user chips have the rest of the page to grow.
              const accessPageContent = (
                <div style={{ width: '100%' }}>
                  <div style={colHead}>🔑 Access &amp; study tool</div>
                  {/* Study-path picker and paywall-bypass input SIDE BY SIDE (they stack
                      only on a narrow card), so the page stays short with no scrollbar. */}
                  <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, alignItems: 'start', marginBottom: 8 }}>
                    <label className="field" style={fieldWrap}>
                      <span style={fieldLabel}>🎬 Study-path slide tool</span>
                      <select value={studyToolSlug} onChange={(e) => saveStudyTool(e.target.value)} style={FIELD_CONTROL_STYLE}>
                        <option value="">— none picked —</option>
                        {studyToolList.map((t) => <option key={t.slug} value={t.slug}>{t.title}</option>)}
                      </select>
                    </label>
                    <label className="field" style={fieldWrap}>
                      <span style={fieldLabel} title="These users (plus you) can open cards you lock with the 🔒 paywall.">👥 Bypass the 🔒 paywall</span>
                      <input type="text" value={authInput} onChange={(e) => setAuthInput(e.target.value)} placeholder="type a username + Enter" list="repo-known-users"
                        onKeyDown={(e) => { if (e.key === 'Enter') { const v = authInput.trim(); if (v && !authorizedUsers.includes(v)) saveAuthorized([...authorizedUsers, v]); setAuthInput(''); } }}
                        style={FIELD_CONTROL_STYLE} />
                      <datalist id="repo-known-users">{knownUsers.map((u) => <option key={u} value={u} />)}</datalist>
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start', alignContent: 'flex-start' }}>
                    {authorizedUsers.length === 0
                      ? <span style={{ fontSize: 12, opacity: 0.6 }}>none yet — 🔒 cards stay locked for everyone but you</span>
                      : authorizedUsers.map((u) => (
                          <span key={u} style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 999, padding: '2px 4px 2px 9px' }}>
                            @{u}
                            <button className="btn small ghost" style={{ padding: '0 5px' }} title="Remove" onClick={() => saveAuthorized(authorizedUsers.filter((x) => x !== u))}>✕</button>
                          </span>
                        ))}
                  </div>
                </div>
              );
              const goN = () => setControlsStep((s) => Math.min(3, s + 1));
              const goB = () => setControlsStep((s) => Math.max(0, s - 1));
              const steps: WizardStep[] = [
                { key: 'main', title: 'Cards & order', render: () => <WizardGridTemplate tall top={cardsPage} onNext={goN} onBack={goB} backDisabled={controlsStep === 0} /> },
                { key: 'access', title: 'Access & study tool', render: () => <WizardGridTemplate tall top={accessPageContent} onNext={goN} onBack={goB} backDisabled={controlsStep === 0} /> },
                { key: 'features', title: 'Card features', render: () => <WizardGridTemplate tall top={featuresContent} onNext={goN} onBack={goB} backDisabled={controlsStep === 0} /> },
                { key: 'prompt', title: 'How it replies — the prompt', render: () => <WizardGridTemplate tall top={<PromptInspector kind="repo" topic={def?.title || ''} />} onBack={goB} backDisabled={controlsStep === 0} /> },
              ];
              return (
                <SetupWizardCard title={<span onClick={toggleRepoSettings} title="Hide repo settings"
                    style={{ fontSize: 15, cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ opacity: 0.45, fontSize: 12 }}>▾</span>⚙️ 🗂️ Repo settings</span>}
                  steps={steps} stepIndex={controlsStep} onStepChange={setControlsStep} />
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="card alt" style={{ padding: '12px 14px', marginBottom: 10, borderStyle: 'dashed', fontSize: 12, opacity: 0.8 }}>
          {studyMode
            ? `🎬 Study mode is on${selectedStudyName ? ` with ${selectedStudyName}` : ''}. Tap 🎬 on a card to open the lesson flow.`
            : 'This repository is a plain collection — open a card to view its contents.'}
        </div>
      )}

      {/* Dashed rule closing the settings-card + mug row, separating it from the
          filter / cards section below. */}
      <div style={{ borderTop: '2px dotted var(--ink)', opacity: 0.4, margin: '2px 0 14px' }} />

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
        {/* The cards section, styled like the top-level Repos gallery: NO section
            title / dashed rule, a BARE "Filters" row (no dashed OutlineBox, no
            "FILTERS & DISPLAY" caption, no item count), and the gallery's LAYOUT +
            IMAGE size dropdowns (default List + Small) driving the cards. The repo
            settings now live INLINE above (no ⚙️ gear here). */}
        <Collection<RepoCard>
          bareFilter hideCount
          sizePageKey={`sl_repo_size_${slug}`}
          items={prunedTop}
          id={(c: RepoCard) => c.id}
          searchText={(c: RepoCard) => `${c.title || ''} ${c.subtitle || ''} ${c.text || ''}`}
          showRefresh={false}
          gridMinPx={260}
          /* no perPage: the Prev/Next pager is retired — the "Read more" link
             below the cards paginates instead (6 cards per click, nested count) */
          maxWidth={900}
          searchPlaceholder="🔍 search cards"
          favs={myFavs}
          likedByAdmin={(c: RepoCard) => adminFavSet.has(c.id)}
          likedByOwner={(c: RepoCard) => ownerFavSet.has(c.id)}
          renderGrid={(c: RepoCard, v?: { setView: (m: 'grid' | 'row') => void; imgSize?: number }) => <RepoCollectionCard card={c} view="grid" ctx={ctx} imgSize={v?.imgSize} unitColor={unitColorOf(c.id)} switchToRows={() => v?.setView('row')} />}
          renderRow={(c: RepoCard, v?: { imgSize?: number }) => <RepoCollectionCard card={c} view="row" ctx={ctx} imgSize={v?.imgSize} unitColor={unitColorOf(c.id)} />}
          emptyAll="This collection is empty."
          emptyFiltered="No cards match your search."
        />

       </>
      ) : (
        <div style={display === 'grid'
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }
          : { display: 'grid', gap: 12 }}>
          {prunedTop.map((c) => <CardView key={c.id} card={c} depth={0} defaultDisplay={display} ctx={ctx} />)}
        </div>
      )}

      {/* Read more / Read less — plain letters at the foot of the card section,
          right above the closing dashed rule. "Read more" reveals the NEXT whole
          unit (a top-level card + all its nested cards); "Read less" folds the
          last unit back up, disabled once only the first unit remains. */}
      {!editing && totalUnits > 1 && (() => {
        const link = { background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 16, color: 'var(--ink)', textUnderlineOffset: 3, padding: 0 } as const;
        const canLess = shownUnits > 1;
        return (
          <>
            <div style={{ display: 'flex', gap: 22, justifyContent: 'center', marginTop: 12, marginBottom: 2 }}>
              <button disabled={remainingUnits === 0} onClick={() => setReadUnits((n) => n + 1)}
                title={remainingUnits === 0 ? 'All units are shown' : `Show the next unit (${shownUnits} of ${totalUnits} units shown)`}
                style={{ ...link, cursor: remainingUnits === 0 ? 'default' : 'pointer', opacity: remainingUnits === 0 ? 0.35 : 0.75, textDecoration: remainingUnits === 0 ? 'none' : 'underline' }}>
                Read more ↓
              </button>
              <button disabled={!canLess} onClick={() => setReadUnits((n) => Math.max(1, n - 1))}
                title={canLess ? 'Fold the last unit back up' : 'The first unit always stays shown'}
                style={{ ...link, cursor: canLess ? 'pointer' : 'default', opacity: canLess ? 0.75 : 0.35, textDecoration: canLess ? 'underline' : 'none' }}>
                Read less ↑
              </button>
            </div>
            {/* Closing dashed rule at the foot of the card section, below the
                Read more / Read less controls. */}
            <div style={{ borderTop: '2px dotted var(--ink)', opacity: 0.4, margin: '12px 0 0' }} />
          </>
        );
      })()}

      {/* Repo cards table — every card in the tree (units + all nested cards)
          flattened into one row each, keyed by the unit it belongs to, capturing
          each card's saved info: title, description, study-path link, paywall,
          attachments, status and dates. The repo-wide study tool + paywall-bypass
          users are summarised in the caption above it. Admin-only. */}
      {!editing && cards.length > 0 && isAdmin && (() => {
        const fmt = (v?: string) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString(); };
        const rows: Cell[][] = [];
        const walk = (list: RepoCard[], unit: string, depth: number) => {
          list.forEach((c) => {
            const u = depth === 0 ? (c.title || 'Untitled unit') : unit;
            const links = c.links || [];
            const nBlue = links.filter((l) => (l.color || 'blue') === 'blue').length;
            const nUser = links.filter((l) => l.color === 'green').length;
            const nRef = links.filter((l) => l.color === 'ref').length;
            const attach = [nBlue && `📎${nBlue}`, nUser && `📁${nUser}`, nRef && `📄${nRef}`].filter(Boolean).join('  ') || '—';
            const prompt = isPromptCard(c);
            const role = c.kind === 'section' ? 'Section'
              : depth === 0 ? 'Unit'
              : prompt ? '🔵 Prompt'
              : (c.children || []).some(isPromptCard) ? 'Objective'
              : `Sub · L${depth}`;
            rows.push([
              rows.length + 1,
              u,
              role,
              c.title || '—',
              String(c.text || '').trim() || '—',
              prompt && studyMode ? (selectedStudyName || 'study path on') : '—',
              c.paywall ? '🔒 locked' : '—',
              attach,
              c.mode || '—',
              fmt(c.createdAt),
              fmt(c.lastEdited),
            ]);
            if (c.children?.length) walk(c.children, u, depth + 1);
          });
        };
        walk(cards, '', 0);
        return (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', margin: '0 0 8px' }}>
              <h3 style={{ margin: 0 }}>🗂️ All cards — table</h3>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {selectedStudyName ? `🎬 Study tool: ${selectedStudyName}` : '🎬 No study tool'} · 👥 Bypass paywall: {authorizedUsers.length ? authorizedUsers.map((u) => `@${u}`).join(', ') : 'none'}
              </span>
            </div>
            <PagedTable
              headers={['#', 'Unit', 'Role', 'Title', 'Description', 'Study path', 'Paywall', 'Attachments', 'Status', 'Created', 'Last edited']}
              rows={rows}
              empty="No cards yet."
              rowsPerPage={8}
            />
          </div>
        );
      })()}

      {/* Persisted LESSON RUNS: every playable presentation generated from this repo's
          🎬 prompts is logged back here (by the stable repo slug) — who played it, when,
          which unit/lesson, their score, time, and a verbal summary of what was taught.
          This is the memory the NEXT lesson builds on. Admin / moderator (each learner
          sees only their own rows via the entries API). */}
      {(canEdit || isAdmin) && (() => {
        const logs = entries.filter((e: any) => e?.data?.__lessonLog)
          .sort((a: any, b: any) => new Date(b.data?.playedAt || 0).getTime() - new Date(a.data?.playedAt || 0).getTime());
        const rows: Cell[][] = logs.map((e: any) => {
          const d = e.data || {};
          const when = d.playedAt ? new Date(d.playedAt).toLocaleString() : '—';
          const lesson = `${typeof d.lessonIndex === 'number' ? d.lessonIndex + 1 : '?'} of ${d.lessonCount || '?'}${d.lessonTitle ? ` — ${d.lessonTitle}` : ''}`;
          const secs = d.timeSeconds || 0;
          const time = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
          const summary = (d.slides || []).map((s: any) => `${s.n}. ${s.title}${s.seconds ? ` (${s.seconds}s)` : ''}`).join('  ·  ');
          const order = d.lessonSeq ? `${d.lessonSeq} of ${d.lessonSeqTotal || '?'}` : '—';
          return [order, String(d.playedBy || '—'), when, String(d.slideTool || '—'), String(d.unitTitle || '—'), lesson, String(d.level || '—'), String(d.score || '—'), time, summary || '—'];
        });
        return (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', margin: '0 0 8px' }}>
              <h3 style={{ margin: 0 }}>📊 Lesson runs — who learned what</h3>
              <span style={{ fontSize: 12, opacity: 0.7 }}>This repo’s reference: <b>#{repoRef(slug)}</b> · a lesson tagged with this code came from here.</span>
            </div>
            <PagedTable
              headers={['Course order', 'Student', 'Played', 'Slide tool', 'Unit', 'Lesson', 'Level', 'Score', 'Time', 'Slides taught (summary)']}
              rows={rows}
              empty="No lessons have been played from this repository yet — play one from a 🎬 prompt and it appears here."
              rowsPerPage={8}
            />
          </div>
        );
      })()}
    </div>
  );
}
