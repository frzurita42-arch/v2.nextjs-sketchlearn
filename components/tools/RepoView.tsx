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
import { useEffect, useMemo, useRef, useState } from 'react';
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
  // Owner/admin inline card controls on the collection cards (bare icons):
  canEdit: boolean;
  editField: (id: string, patch: Partial<RepoCard>) => void;        // ✎ edit title/subtitle in place
  distortTitle: (card: RepoCard) => Promise<void>;                  // 🎨 AI rewrite the title
  distortText: (card: RepoCard) => Promise<void>;                  // 🎨 AI rewrite the description
  addSubcard: (id: string) => void;                                // ⚙️ add a card inside
  addSibling: (id: string) => void;                                // ➕ add a card at this level
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
const blankCard = (kind: 'card' | 'section' = 'card'): RepoCard => ({ id: newId(), kind, title: kind === 'section' ? 'New section' : 'New card', links: [] });

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

// Number → keycap emoji(s): 0 → 0️⃣, 10 → 1️⃣0️⃣ (one keycap per digit).
const toKeycaps = (n: number) => String(Math.max(0, Math.floor(n))).split('').map((d) => `${d}️⃣`).join('');
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
// bare: ⚙️ add a card inside, 🗑 delete. Nested cards show ONLY the first as a
// preview and can be collapsed/expanded to reveal the rest — this preview
// behaviour is exclusive to repo collection cards (not the tool gallery, posts,
// or homepage).
function RepoCollectionCard({ card, view, ctx, switchToRows, nested }: { card: RepoCard; view: 'grid' | 'row'; ctx: ViewCtx; switchToRows?: () => void; nested?: boolean }) {
  // Hidden children vanish for normal viewers; owner/admin still see them greyed.
  const kids = (card.children || []).filter((k) => ctx.canEdit || !k.hidden);
  const links = card.links || [];
  const dimmed = !!card.hidden && ctx.canEdit;   // owner/admin preview of a hidden card
  const iconNode = card.icon ? <span aria-hidden>{card.icon}</span> : undefined;   // number emoji, if set
  const isFav = !!ctx.favs[card.id];
  const [expanded, setExpanded] = useState(true);   // default: show all nested (Show less)
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
  const [attachBusy, setAttachBusy] = useState(false);
  const editing = editingTitle || editingSub;

  // ---- attachments: BOTH the 📎 clip and the 📁 folder add a link or uploaded
  // file to THIS card (they render as the 🔗 buttons). They differ only in the
  // button colour — clip → blue, folder → green — so you can group attachments.
  const toggleAttach = (c: 'blue' | 'green') => {
    if (attaching && attachColor === c) { setAttaching(false); return; }
    setAttachColor(c); setAttaching(true);
  };
  const appendLink = (label: string, url: string) => ctx.editField(card.id, {
    links: [...(card.links || []), { label: label.slice(0, 15) || 'Link', url, ...(attachColor === 'green' ? { color: 'green' as const } : {}) }],
  });
  const addLink = () => {
    let url = linkUrl.trim(); if (!url) return;
    // A bare domain like "example.com" is dropped by the server sanitizer (which
    // keeps only http(s):// or /… URLs), which made the button vanish a second
    // after it appeared. Give it a scheme so it sticks.
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) url = 'https://' + url;
    appendLink(linkLabel.trim(), url);
    setLinkLabel(''); setLinkUrl(''); setAttaching(false);
  };
  const attachUpload = async (f: File) => {
    if (f.size > 25_000_000) { alert('Please pick a file under 25 MB.'); return; }
    setAttachBusy(true);
    try {
      let url = '';
      try { const up = await API.upload('/api/upload', f); if (up?.url) url = up.url; } catch { /* data-URL fallback */ }
      if (!url) url = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.readAsDataURL(f); });
      appendLink(f.name, url);
      setAttaching(false);
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
  const openLink = links[0]?.url ? () => { try { window.open(links[0].url, '_blank', 'noopener'); } catch { /* ignore */ } } : undefined;
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

  const actions = (
    <>
      {links.map((l, i) => <a key={i} className={`btn small ${l.color === 'green' ? 'green' : 'blue'}`} href={l.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>🔗 {cap15(l.label || 'Open')}</a>)}
      {card.completable && <button className={`btn small ${ctx.done[card.id] ? 'green' : 'ghost'}`} onClick={() => ctx.toggle(card.id)}>{ctx.done[card.id] ? '✓ Done' : '○ Mark done'}</button>}
      <button onClick={() => ctx.toggleFav(card.id)} title={isFav ? 'Unfavorite' : 'Favorite'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1, color: isFav ? '#f0a202' : 'var(--ink)', opacity: isFav ? 1 : 0.5 }}>{isFav ? '★' : '☆'}</button>
      {ctx.canEdit && <button type="button" title="Add a card inside" style={iconBtn} onClick={() => { ctx.addSubcard(card.id); setExpanded(true); }}>⚙️</button>}
      {ctx.canEdit && <button type="button" title="Add a card at this level" style={iconBtn} onClick={() => ctx.addSibling(card.id)}>➕</button>}
      {/* 📎 clip → blue attachment button · 📁 folder → green attachment button. */}
      {ctx.canEdit && <button type="button" title="Attach a file or link (blue button)" style={{ ...iconBtn, opacity: attaching && attachColor === 'blue' ? 1 : 0.85 }} onClick={() => toggleAttach('blue')}>📎</button>}
      {ctx.canEdit && <button type="button" title="Attach a file or link (green button)" style={{ ...iconBtn, opacity: attaching && attachColor === 'green' ? 1 : 0.85 }} onClick={() => toggleAttach('green')}>📁</button>}
      {/* 👁 hide from normal viewers — always last. Owner/admin still see it (greyed). */}
      {ctx.canEdit && <button type="button" title={card.hidden ? 'Hidden from viewers — click to show' : 'Hide from normal viewers'} style={{ ...iconBtn, opacity: card.hidden ? 0.5 : 1 }} onClick={() => ctx.editField(card.id, { hidden: !card.hidden })}>👁︎</button>}
    </>
  );
  const del = ctx.canEdit ? (
    <button type="button" title="Delete this card" style={delIcon} onClick={() => ctx.deleteCard(card.id)}>🗑</button>
  ) : undefined;

  const shell = (
    <CardShell view={view}
      title={editingTitle ? '' : (card.title || 'Untitled')}
      subtitle={editingSub ? ' ' : (card.text || '')}
      thumbnail={isImg(card.image) ? card.image : null}
      badge={dimmed ? '🙈 hidden' : (view === 'grid' && kids.length ? `📂 ${kids.length} inside` : undefined)}
      onOpen={open}
      iconNode={iconNode}
      overlay={imgOverlay} placeholder={imgPlaceholder}
      afterTitle={afterTitle} afterSubtitle={afterSubtitle}
      actions={actions} del={del} />
  );

  // The clip/folder inline editor: type a link (label + URL) or upload a file.
  // Both append to the card's links (shown as 🔗 buttons) in the chosen colour.
  const attachForm = ctx.canEdit && attaching ? (
    <div className="card alt" style={{ padding: '8px 10px', marginTop: 6, display: 'grid', gap: 6 }} onClick={stop}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>{attachColor === 'green' ? '📁' : '📎'} Attach a file or add a link — makes a <span style={{ color: attachColor === 'green' ? '#1f8b4c' : '#2f6fdb' }}>{attachColor}</span> button</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={linkLabel} placeholder="Label (max 15)" maxLength={15} onChange={(e) => setLinkLabel(e.target.value.slice(0, 15))} style={{ flex: '1 1 90px', fontSize: 13 }} />
        <input value={linkUrl} placeholder="https://…" onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }} style={{ flex: '2 1 150px', fontSize: 13 }} />
        <button className={`btn small ${attachColor}`} onClick={addLink}>Add link</button>
        <label className="btn small ghost" style={{ cursor: 'pointer' }} title="Attach a document or file">
          {attachBusy ? 'Uploading…' : '📎 Upload file'}
          <input type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) attachUpload(f); e.currentTarget.value = ''; }} />
        </label>
        <button className="btn small ghost" onClick={() => setAttaching(false)}>✕</button>
      </div>
    </div>
  ) : null;

  // Owner/admin see a hidden card greyed out (normal viewers never get here).
  const body = <div style={dimmed ? { opacity: 0.5 } : undefined}>{shell}{attachForm}</div>;

  // GRID view: a card is shown ALONE — no nested cards beneath it. (Clicking a
  // card with children flips to the rows view, above, to reveal the tree.) Only
  // the ROWS view draws the nested preview + collapse/expand.
  if (view === 'grid' || !kids.length) return <div>{body}</div>;
  // Preview: show just the first nested card; the rest collapse/expand in place.
  const shown = expanded ? kids : kids.slice(0, 1);
  const more = kids.length - 1;
  return (
    <div>
      {body}
      <div style={{ marginLeft: 14, marginTop: 8, borderLeft: '3px solid var(--accent, #5c80bc)', paddingLeft: 10, display: 'grid', gap: 8 }}>
        {shown.map((k) => <RepoCollectionCard key={k.id} card={k} view="row" ctx={ctx} nested />)}
        {more > 0 && (
          <button type="button" onClick={() => setExpanded((e) => !e)}
            title={expanded ? 'Collapse' : `Show ${more} more inside`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textAlign: 'left', fontSize: 12, fontWeight: 700, opacity: 0.7, color: 'var(--ink)', justifySelf: 'start' }}>
            {expanded ? '▾ Show less' : `▸ Show ${more} more ${more === 1 ? 'card' : 'cards'} inside`}
          </button>
        )}
      </div>
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
  const me = app.user?.username || '';
  const isOwner = canEdit;
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
    setCards(next);
    try {
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display, displayLocked: repo.displayLocked, offlineExport: repo.offlineExport, cards: next } });
      if (r?.repo) { setCards(r.repo.cards || next); if (def) def.repo = r.repo; }
    } catch { /* keep the optimistic copy */ }
  };
  const editField = (id: string, p: Partial<RepoCard>) => saveCards(mapTree(cards, id, (c) => ({ ...c, ...p })));
  // The gear adds a nested card seeded with a generic title AND subtitle, so its
  // ✎ pencils have something to edit right away.
  const addSubcard = (id: string) => saveCards(addChildTo(cards, id, { ...blankCard('card'), text: 'New subtitle' }));
  // ➕ add a sibling card at the SAME level as this card (a new top-level card when
  // used on a top card, a new nested sibling when used on a nested card).
  const addSibling = (id: string) => saveCards(addSiblingAfter(cards, id, { ...blankCard('card'), text: 'New subtitle' }));
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

  const ctx: ViewCtx = { slug, me, isOwner, done, toggle, entriesByCard, onAdded: loadEntries, favs: myFavs, toggleFav, canEdit, editField, distortTitle, distortText, addSubcard, addSibling, setIcon, numberCard, deleteCard };

  // Display lock: the owner/admin can lock the grid/rows view for a collection so
  // everyone sees the same layout. Persisted on the repo (display + displayLocked).
  const saveDisplayLock = async (lockedNext: boolean, viewSel: 'grid' | 'row') => {
    const nextDisplay: 'bars' | 'grid' = viewSel === 'grid' ? 'grid' : 'bars';
    try {
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display: nextDisplay, displayLocked: lockedNext, offlineExport: repo.offlineExport, cards } });
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
      const r = await API.post('/api/tools/repo', { slug, repo: { layout: repo.layout, display, cards } });
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
      {/* Offline export — available to every viewer unless the owner turned it off. */}
      {offlineOn && !editing && cards.length > 0 && (
        <div style={{ textAlign: 'right', marginBottom: 8 }}>
          <button className="btn small ghost" disabled={zipBusy} onClick={downloadZip}>{zipBusy ? 'Zipping…' : '⬇ Offline copy (.zip)'}</button>
        </div>
      )}

      {/* Owner/admin edit bar */}
      {canEdit && (
        <div className="card alt" style={{ padding: '8px 12px', marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className={`btn small ${editing ? 'green' : 'blue'}`} onClick={() => setEditing((e) => !e)}>{editing ? '✓ Done editing' : '✎ Edit'}</button>
          {editing && <button className="btn small green" disabled={saving} onClick={save}>{saving ? 'Saving…' : '💾 Save'}</button>}
          {editing && <span style={{ fontSize: 11, opacity: 0.6 }}>Each card&apos;s “Children as” controls bars vs grid for what&apos;s inside it.</span>}
          {saved && <span style={{ fontSize: 12, opacity: 0.75 }}>{saved}</span>}
        </div>
      )}

      {/* AI layout chat (edit mode) */}
      {canEdit && editing && (
        <div className="card" style={{ padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>🤖 ASK AI TO LAY IT OUT</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={aiInstr} placeholder="e.g. Make a 4-week Python course with units and activity links"
              onChange={(e) => setAiInstr(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') aiLayout(); }} style={{ flex: '1 1 220px', fontSize: 13 }} />
            <button className="btn small green" disabled={aiBusy} onClick={aiLayout}>{aiBusy ? 'Thinking…' : 'Generate layout'}</button>
          </div>
        </div>
      )}

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
        /* A collection: the shared titled + banner'd + filterable gallery block. */
        <GallerySection
          titleKey="collectionShelfTitle" titleFallback="🗂️ Cards"
          bannerKey="collectionBanner" bannerDefault="🗂️ Your saved cards — search by name, favorite them (★ / liked by admin / OP), switch grid ▦ or rows ☰ (the owner can 🔒 lock the layout), and page through. Tap a card to open its attachment."
          items={cards.filter((c) => canEdit || !c.hidden)}
          id={(c: RepoCard) => c.id}
          searchText={(c: RepoCard) => `${c.title || ''} ${c.subtitle || ''} ${c.text || ''}`}
          defaultView={display === 'grid' ? 'grid' : 'row'}
          viewLocked={!!repo.displayLocked}
          canLockView={canEdit}
          onViewLockChange={saveDisplayLock}
          onRefresh={loadEntries}
          showCollapse
          storageKey={`sl_repo_view_${slug}`}
          gridMinPx={260}
          perPage={8}
          maxWidth={900}
          searchPlaceholder="🔍 search cards"
          extra={canEdit ? <button className="btn small green" title="Add a new top-level card" onClick={addTopCardSaved}>＋ New card</button> : undefined}
          favs={myFavs}
          likedByAdmin={(c: RepoCard) => adminFavSet.has(c.id)}
          likedByOwner={(c: RepoCard) => ownerFavSet.has(c.id)}
          renderGrid={(c: RepoCard, v?: { setView: (m: 'grid' | 'row') => void }) => <RepoCollectionCard card={c} view="grid" ctx={ctx} switchToRows={() => v?.setView('row')} />}
          renderRow={(c: RepoCard) => <RepoCollectionCard card={c} view="row" ctx={ctx} />}
          emptyAll="This collection is empty."
          emptyFiltered="No cards match your search."
        />
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
