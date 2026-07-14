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
import { Collection } from '@/components/ui/Collection';
import type { RepoCard, RepoLink, RepoSpec } from '@/lib/tool-schema';

// Shared runtime context threaded through the read-only card tree.
type ViewCtx = {
  slug: string; me: string; isOwner: boolean;
  done: Record<string, boolean>; toggle: (id: string) => void;
  entriesByCard: Record<string, any[]>; onAdded: () => void;
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
  const kids = card.children || [];
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
      </div>
      {card.text && <div style={{ fontSize: 14, marginTop: 6 }}><RichText text={card.text} /></div>}
      {!!card.links?.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {card.links.map((l, i) => (
            <a key={i} className="btn small blue" href={l.url} target="_blank" rel="noreferrer">🔗 {l.label || 'Open'}</a>
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

export function RepoView({ def, slug, canEdit }: { def: any; slug: string; canEdit: boolean }) {
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
  const ctx: ViewCtx = { slug, me, isOwner, done, toggle, entriesByCard, onAdded: loadEntries };

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
        /* A collection: gallery-style filter toolbar over VERTICAL cards (no grid). */
        <Collection
          items={cards}
          id={(c: RepoCard) => c.id}
          searchText={(c: RepoCard) => `${c.title || ''} ${c.subtitle || ''} ${c.text || ''}`}
          lockView="row"
          perPage={8}
          maxWidth={900}
          searchPlaceholder="🔍 search cards"
          renderGrid={(c: RepoCard) => <CardView card={c} depth={0} defaultDisplay="bars" ctx={ctx} />}
          renderRow={(c: RepoCard) => <CardView card={c} depth={0} defaultDisplay="bars" ctx={ctx} />}
          emptyAll="This collection is empty."
          emptyFiltered="No cards match your search."
        />
      ) : (
        <div style={display === 'grid'
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }
          : { display: 'grid', gap: 12 }}>
          {cards.map((c) => <CardView key={c.id} card={c} depth={0} defaultDisplay={display} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}
