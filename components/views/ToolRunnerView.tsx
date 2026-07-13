'use client';
/* The interpreter/runtime. Reads appState.activeTool (a Tool Definition record)
 * and renders it — no per-tool code. Two archetypes:
 *   - generator: settings form -> run -> render output (text/cards/table)
 *   - app:       entry form -> save -> browse entries (cards/list/table),
 *                with an owner-only review queue when the tool uses review. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { defaultsFor } from '@/lib/tool-schema';
import { ToolFields } from '@/components/tools/ToolFields';
import { CommentSection } from '@/components/social/CommentSection';
import { RichText } from '@/components/tools/RichText';
import { LessonPlayer } from '@/components/tools/LessonPlayer';
import { RepoView } from '@/components/tools/RepoView';
import { SharePanel } from '@/components/tools/SharePanel';
import { SuggestionCarousel } from '@/components/tools/SuggestionCarousel';
import { InstructionPlank } from '@/components/activities/InstructionPlank';
import { useShelfTitle } from '@/components/tools/useShelfTitle';
import { Collection, type FilterKey } from '@/components/ui/Collection';
import { CardShell, iconBtn, delIcon } from '@/components/ui/CardShell';
import { isRenderableImage } from '@/lib/img';

// Deterministic emoji+color avatar from a username (matches the feed's style).
const AV_EMOJI = ['🦊', '📊', '🐛', '🦉', '🤖', '⚙️', '🗣️', '🛡️', '🔧', '📈', '✏️', '☁️', '🎨', '🔐', '📝', '🌊'];
const AV_COLOR = ['#f9a03f', '#5c80bc', '#7fb069', '#e4572e', '#9b5de5', '#00b4d8', '#f15bb5', '#2d6a4f'];
function avatarFor(name: string) {
  let h = 0; for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return { emoji: AV_EMOJI[h % AV_EMOJI.length], color: AV_COLOR[(h >> 4) % AV_COLOR.length] };
}

// Coerce anything the API/DB hands us into an array, so a stray non-array shape
// (e.g. tags/entries returned oddly) can never throw `.map is not a function`.
const asArray = (x: any): any[] => (Array.isArray(x) ? x : []);

function OutputView({ out }: { out: any }) {
  if (!out) return null;
  if (out.output === 'text') return <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{out.text}</p>;
  if (out.output === 'cards') return (
    <div>{asArray(out.cards).map((c: any, i: number) => (
      <div key={i} className="card" style={{ padding: '12px 14px', marginBottom: 10 }}>
        <strong>{c.title}</strong><p style={{ margin: '6px 0 0', fontSize: 14 }}>{c.body}</p>
      </div>
    ))}</div>
  );
  if (out.output === 'table') return (
    <div style={{ overflowX: 'auto' }}>
      <table className="sketch-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{asArray(out.headers).map((h: string, i: number) => <th key={i} style={{ textAlign: 'left', borderBottom: '2px solid var(--ink)', padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>{asArray(out.rows).map((r: any[], i: number) => <tr key={i}>{asArray(r).map((c, j) => <td key={j} style={{ borderBottom: '1px solid rgba(0,0,0,0.15)', padding: 6 }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  return null;
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}
function Byline({ e }: { e: any }) {
  return (
    <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
      {e.username ? `@${e.username}` : 'anon'}{e.createdAt ? ` · ${timeAgo(e.createdAt)} ago` : ''}
      {e.status && e.status !== 'active' && e.status !== 'approved' && <em> · {e.status}</em>}
    </div>
  );
}
function fieldValue(f: any, e: any) {
  const v = e.data?.[f.id];
  if ((f.type === 'image' || f.type === 'drawing') && isRenderableImage(v)) {
    return <img src={v} alt={f.label} style={{ width: '100%', borderRadius: 8, border: '2px solid var(--ink)', display: 'block' }} loading="lazy" />;
  }
  if (f.type === 'audio' && typeof v === 'string' && v.startsWith('data:')) {
    return <audio controls src={v} style={{ width: '100%', height: 36 }} />;
  }
  if (f.type === 'toggle') return v ? 'yes' : 'no';
  if (f.type === 'textarea' || f.type === 'text') {
    const s = String(v ?? '');
    if (/^https?:\/\//i.test(s.trim())) return <a href={s.trim()} target="_blank" rel="noreferrer">{s.trim()}</a>;
    return <RichText text={s} />;
  }
  return String(v ?? '');
}

// Open a print-friendly window of one entry so the browser can Save-as-PDF.
function printPost(title: string, entry: any, fields: any[], author: string) {
  const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
  const body = asArray(fields).map((f: any) => {
    const v = entry.data?.[f.id];
    if (!v) return '';
    if ((f.type === 'image' || f.type === 'drawing') && String(v).match(/^(data:|https?:)/)) return `<div><img src="${esc(String(v))}" style="max-width:100%;border:1px solid #2d2a26;border-radius:8px"/></div>`;
    if (f.type === 'audio') return `<p><b>${esc(f.label)}:</b> (audio clip)</p>`;
    if (/^https?:\/\//i.test(String(v).trim())) return `<p><b>${esc(f.label)}:</b> <a href="${esc(String(v).trim())}">${esc(String(v).trim())}</a></p>`;
    return `<p><b>${esc(f.label)}:</b> ${esc(String(v))}</p>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Georgia,serif;max-width:640px;margin:28px auto;padding:0 18px;color:#2d2a26;line-height:1.5}h1{margin:0 0 4px}.by{opacity:.6;margin:0 0 16px}</style></head><body><h1>${esc(title)}</h1><p class="by">by @${esc(author)}</p>${body}<script>window.onload=function(){setTimeout(function(){window.print();},250);}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to save as PDF.'); return; }
  w.document.write(html); w.document.close();
}

// Edit a tool's title or description — type it manually, OR ask the AI to write
// it from the tool's context (its type, subject, what it generates). Owner/admin.
function AiEditPopup({ field, slug, initial, onSave, onClose }: {
  field: 'title' | 'description'; slug: string; initial: string;
  onSave: (v: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const [instr, setInstr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const gen = async () => {
    setBusy(true); setErr('');
    try {
      const r = await API.post('/api/tools/describe', { slug, field, instruction: instr });
      if (r?.text) setText(r.text); else setErr(r?.error || 'Could not generate.');
    } catch { setErr('Could not reach the AI.'); }
    setBusy(false);
  };
  const isTitle = field === 'title';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <b>Edit {isTitle ? 'title' : 'description'}</b>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        {isTitle
          ? <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a title…" style={{ width: '100%', fontSize: 15, marginBottom: 8 }} />
          : <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a description…" style={{ width: '100%', minHeight: 70, fontSize: 14, marginBottom: 8 }} />}
        <div style={{ borderTop: '1.5px dashed var(--ink)', paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>✦ OR WRITE IT WITH AI</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder={isTitle ? 'e.g. make it catchy and short' : 'e.g. friendly, mention who it helps'} onKeyDown={(e) => { if (e.key === 'Enter') gen(); }} style={{ flex: '1 1 180px', fontSize: 13 }} />
            <button className="btn small blue" disabled={busy} onClick={gen}>{busy ? '…' : '✦ Write with AI'}</button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 3 }}>The AI writes from what this tool actually does — not just the prompt.</div>
        </div>
        {err && <p style={{ color: 'var(--danger,#e4572e)', fontSize: 12, margin: '6px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn small ghost" onClick={onClose}>Cancel</button>
          <button className="btn small green" onClick={() => onSave(text.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function ToolRunnerView() {
  const app = useApp();
  const tool = appState.activeTool;
  const def = tool?.definition;

  // Clear any leftover Posts-carousel open-intent once this tool page is up. Child
  // effects run first, so the LessonPlayer consumes it before this fires; for
  // non-lesson tools this drops an unconsumed intent so it can't leak later.
  useEffect(() => { const id = setTimeout(() => { appState.openIntent = null; }, 0); return () => clearTimeout(id); }, []);
  // The History section header (editable + AI-distort), persisted for everyone.
  const historyHdr = useShelfTitle('historyShelfTitle', '📖 History');

  // Coerced field arrays used everywhere below (never throw on a bad shape).
  const settingsFields = asArray(def?.settings);
  const entryFields = asArray(def?.app?.entryFields);

  // generator state
  const [values, setValues] = useState<Record<string, any>>(() => defaultsFor(settingsFields));
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // app state
  const [entryVals, setEntryVals] = useState<Record<string, any>>(() => defaultsFor(entryFields));
  const [entries, setEntries] = useState<any[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  // Per-entry favorites (the ★ star + the Collection's favorites filter).
  const [entryFavs, setEntryFavs] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setEntryFavs(JSON.parse(localStorage.getItem('sl_entry_favs') || '{}')); } catch { /* ignore */ } }, []);
  const toggleEntryFav = (id: string) => setEntryFavs(f => { const n = { ...f }; if (n[id]) delete n[id]; else n[id] = true; try { localStorage.setItem('sl_entry_favs', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  // Delete an entry (its author, the tool owner, or an admin — enforced server-side).
  const removeEntry = async (e: any) => {
    if (!confirm('Delete this entry?')) return;
    try {
      const r = await API.call('DELETE', '/api/tools/entries', { slug: tool.slug, entryId: e.id });
      if (r?.ok) setEntries(list => list.filter(x => x.id !== e.id));
      else alert(r?.error || 'Could not delete.');
    } catch (err: any) { alert(err?.message || 'Could not delete.'); }
  };
  const [detail, setDetail] = useState<any>(null);   // entry opened as a post
  const [editField, setEditField] = useState<null | 'title' | 'description'>(null);
  const [descDraft, setDescDraft] = useState<string>(def?.description || '');

  // Like state (platform chrome): count from the tool, per-user liked flag in localStorage.
  const [likes, setLikes] = useState<number>(tool?.likeCount || 0);
  const [liked, setLiked] = useState<boolean>(false);
  useEffect(() => {
    try { const set = JSON.parse(localStorage.getItem('sl_tool_likes') || '{}'); setLiked(!!set[tool?.slug]); } catch { /* ignore */ }
  }, [tool?.slug]);

  const isApp = def?.archetype === 'app';
  const isLesson = def?.archetype === 'lesson';
  const isRepo = def?.archetype === 'repo';
  const loadEntries = useMemo(() => async () => {
    if (!isApp || !tool?.slug) return;
    try { const r = await API.get(`/api/tools/entries?slug=${encodeURIComponent(tool.slug)}`); setEntries(asArray(r?.entries)); setIsOwner(!!r?.isOwner); } catch { /* ignore */ }
  }, [isApp, tool?.slug]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  if (!tool || !def) return (
    <><h1 className="view-title">Tool</h1><p className="view-sub">No tool selected. <button className="btn small" onClick={() => app.nav('tools')}>← Browse tools</button></p></>
  );

  const run = async () => {
    setBusy(true); setErr(''); setOut(null);
    try { const r = await API.post('/api/tools/run', { definition: def, values }); setOut(r); }
    catch (e: any) { setErr(e?.message || 'Run failed'); }
    setBusy(false);
  };

  const addEntry = async () => {
    setBusy(true); setErr('');
    try { await API.post('/api/tools/entries', { slug: tool.slug, data: entryVals }); setEntryVals(defaultsFor(entryFields)); await loadEntries(); }
    catch (e: any) { setErr(e?.message || 'Could not add entry'); }
    setBusy(false);
  };

  const setStatus = async (entryId: string, status: string) => {
    try { await API.put('/api/tools/entries', { slug: tool.slug, entryId, status }); await loadEntries(); } catch { /* ignore */ }
  };

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next); setLikes(n => Math.max(0, n + (next ? 1 : -1)));
    try {
      const set = JSON.parse(localStorage.getItem('sl_tool_likes') || '{}');
      if (next) set[tool.slug] = 1; else delete set[tool.slug];
      localStorage.setItem('sl_tool_likes', JSON.stringify(set));
    } catch { /* ignore */ }
    try { await API.post('/api/tools/like', { slug: tool.slug, liked: next }); } catch { /* ignore */ }
  };

  const authorAv = avatarFor(tool.owner);
  const created = tool.createdAt ? new Date(tool.createdAt).toLocaleString() : '';
  const canEdit = !(tool.tags || []).includes('example') && (app.user?.role === 'admin' || app.user?.username === tool.owner);

  const saveTitle = async (t: string) => {
    setEditField(null);
    if (!t || t === tool.title) return;
    tool.title = t;                                        // optimistic (shared singleton)
    try { await API.post('/api/tools/rename', { slug: tool.slug, title: t }); } catch { /* ignore */ }
  };
  const saveDesc = async (d: string) => {
    setEditField(null);
    setDescDraft(d);
    if (def) def.description = d;                           // optimistic (shared singleton)
    tool.description = d;
    try { await API.post('/api/tools/rename', { slug: tool.slug, description: d }); } catch { /* ignore */ }
  };
  const dashRule = { maxWidth: 820, margin: '10px auto', borderTop: '2px dashed var(--ink)', opacity: 0.45 } as const;

  // One entry rendered as a grid card or a horizontal row (used by Collection).
  const eImageFields = entryFields.filter((f: any) => f.type === 'image' || f.type === 'drawing');
  const eTextFields = entryFields.filter((f: any) => f.type !== 'image' && f.type !== 'drawing');
  // Entry cards use the SAME shared CardShell as the home Tools gallery, fed with
  // this generated tool's own result data: the first image field is the card
  // image, the first text field is the title, the rest become the subtitle.
  const entryCard = (e: any, row: boolean) => {
    const imgField = eImageFields.find((f: any) => isRenderableImage(String(e.data?.[f.id] || '')));
    const thumbnail = imgField ? String(e.data[imgField.id]) : (isRenderableImage(String(e.data?.thumbnail || '')) ? String(e.data.thumbnail) : null);
    const texts = eTextFields.map((f: any) => String(e.data?.[f.id] ?? '')).filter(Boolean);
    const title = String(e.data?.title || texts[0] || `Entry by @${e.username || 'anon'}`);
    const restText = (e.data?.title ? texts : texts.slice(1)).join(' · ');
    const subtitle = String(e.data?.subtitle || restText);
    const canDelete = canEdit || e.username === API.user?.username;
    return (
      <CardShell
        view={row ? 'row' : 'grid'}
        title={title.length > 90 ? title.slice(0, 90).trimEnd() + '…' : title}
        subtitle={subtitle ? (subtitle.length > 140 ? subtitle.slice(0, 140).trimEnd() + '…' : subtitle) : undefined}
        fav={!!entryFavs[e.id]}
        thumbnail={thumbnail}
        onOpen={() => setDetail(e)}
        meta={<Byline e={e} />}
        del={canDelete ? <button style={delIcon} title="Delete this entry" onClick={() => removeEntry(e)}>🗑</button> : null}
        actions={
          <>
            <button style={iconBtn} title={entryFavs[e.id] ? 'Unfavorite' : 'Favorite'} onClick={() => toggleEntryFav(e.id)}>{entryFavs[e.id] ? '★' : '☆'}</button>
            <button className="btn small green" onClick={() => setDetail(e)}>Open →</button>
          </>
        }
      />
    );
  };

  return (
    <>
      <h1 className="view-title">{tool.title}
        {canEdit && <button title="Edit title (type or AI)" onClick={() => setEditField('title')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✎</button>}
      </h1>
      {editField && (
        <AiEditPopup field={editField} slug={tool.slug} initial={editField === 'title' ? tool.title : (descDraft || def.description || '')}
          onSave={editField === 'title' ? saveTitle : saveDesc} onClose={() => setEditField(null)} />
      )}

      {/* ┄ divider: title ┄ author/stats card ┄ */}
      <div style={dashRule} />

      {/* Social chrome: author + stats + like + share, provided by the platform
          (so tools never build their own author/like/comment components). */}
      <div className="card" style={{ maxWidth: 820, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: authorAv.color, border: '2px solid var(--ink)', fontSize: 20 }}>{authorAv.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>@{tool.owner}</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{created}{created ? ' · ' : ''}{tool.archetype} · {tool.visibility}{tool.aiGenerated ? ' · ✦AI-built' : ''}</div>
        </div>
        <button className="btn small ghost" onClick={toggleLike} aria-pressed={liked}>{liked ? '❤️' : '🤍'} {likes}</button>
        {tool.visibility !== 'private' && <SharePanel slug={tool.slug} title={tool.title} />}
        {!(tool.tags || []).includes('example') && (app.user?.role === 'admin' || app.user?.username === tool.owner) && (
          <button className="btn small ghost" onClick={() => app.nav('toolsettings')}>⚙️ Settings</button>
        )}
        <button className="btn small ghost" onClick={() => app.nav('tools')}>← Tools</button>
      </div>
      {(def.description || descDraft || canEdit) && (
        <p className="view-sub" style={{ maxWidth: 820, margin: '8px auto 0' }}>
          {descDraft || def.description || <em style={{ opacity: 0.6 }}>No description yet.</em>}
          {canEdit && <button title="Edit description (type or AI)" onClick={() => setEditField('description')} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✎</button>}
        </p>
      )}

      <section style={{ maxWidth: 820, margin: '8px auto 0' }}>
        {isRepo ? (
          <RepoView def={def} slug={tool.slug} canEdit={canEdit} />
        ) : isLesson ? (
          <LessonPlayer def={def} slug={tool.slug} canEdit={canEdit} />
        ) : !isApp ? (
          !def.generator ? (
            <div className="card alt" style={{ padding: '14px 16px' }}><p style={{ margin: 0 }}>This tool&apos;s definition is incomplete and can&apos;t run. Try rebuilding it from the Builder.</p></div>
          ) : (
          <>
            <div className="card alt" style={{ padding: '14px 16px' }}>
              <ToolFields fields={settingsFields} values={values} onChange={(id, v) => setValues(s => ({ ...s, [id]: v }))} />
              <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
                <button className="btn green" disabled={busy} onClick={run}>{busy ? 'Generating…' : 'Generate →'}</button>
              </div>
              {err && <p style={{ color: 'var(--danger,#e4572e)', marginTop: 8 }}>{err}</p>}
            </div>
            {out && (
              <div style={{ marginTop: 16 }}>
                {out.fallback && <p style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.7 }}>Demo output (no AI connected).</p>}
                <OutputView out={out} />
              </div>
            )}
          </>
          )
        ) : (
          <>
            <div className="card alt" style={{ padding: '14px 16px' }}>
              <h4 style={{ margin: '0 0 8px' }}>Add an entry</h4>
              <ToolFields fields={entryFields} values={entryVals} onChange={(id, v) => setEntryVals(s => ({ ...s, [id]: v }))} />
              <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
                <button className="btn green" disabled={busy} onClick={addEntry}>{busy ? 'Saving…' : (def.app?.review ? 'Submit for review' : 'Add')}</button>
              </div>
              {err && <p style={{ color: 'var(--danger,#e4572e)', marginTop: 8 }}>{err}</p>}
            </div>
            <div style={{ marginTop: 16 }}>
              <InstructionPlank settingKey="historyBanner" defaultText="📖 History — everything people added to this tool. Open an entry, favorite, or search / filter / sort. Refresh shuffles the order." />
              <Collection
                {...historyHdr} onRefresh={loadEntries}
                showCollapse
                items={asArray(entries)}
                id={(e: any) => e.id}
                searchText={(e: any) => `${e.username || ''} ${entryFields.filter((f: any) => !['image', 'audio', 'drawing'].includes(f.type)).map((f: any) => String(e.data?.[f.id] ?? '')).join(' ')}`}
                time={(e: any) => new Date(e.createdAt || 0).getTime()}
                favs={entryFavs}
                likedByAdmin={(e: any) => !!e.byAdmin}
                perPage={9}
                storageKey="sl_entry_view"
                sortPrefKey="entryfeed"
                defaultFilter={(['all', 'fav', 'admin', 'owner'].includes(def?.feedFilter || '') ? def.feedFilter : 'all') as FilterKey}
                canSaveFilter={canEdit}
                onSaveFilter={(f) => { if (def) def.feedFilter = f; API.post('/api/tools/feed-filter', { slug: tool.slug, filter: f }).catch(() => { /* ignore */ }); }}
                searchPlaceholder="🔍 search by text or @user"
                emptyAll="No entries yet — add the first one above."
                emptyFiltered="No entries match these filters."
                renderGrid={(e: any) => entryCard(e, false)}
                renderRow={(e: any) => entryCard(e, true)}
              />
              {isOwner && def.app?.review && asArray(entries).some((e: any) => e.status === 'pending') && (
                <div className="card" style={{ padding: '12px 14px', marginTop: 12 }}>
                  <h4 style={{ margin: '0 0 8px' }}>Review queue (owner)</h4>
                  {asArray(entries).filter((e: any) => e.status === 'pending').map((e: any) => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13 }}>{entryFields.map((f: any) => `${e.data?.[f.id] ?? ''}`).filter(Boolean).join(' · ')}</span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button className="btn small green" onClick={() => setStatus(e.id, 'approved')}>Approve</button>
                        <button className="btn small ghost" onClick={() => setStatus(e.id, 'rejected')}>Reject</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Entry opened as a full post, with a Save-as-PDF (print) option. */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto', padding: '24px 12px' }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '100%', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b>@{detail.username || 'anon'}</b>
              <button className="btn small ghost" onClick={() => setDetail(null)}>✕</button>
            </div>
            {entryFields.map((f: any) => {
              const v = detail.data?.[f.id];
              if (!v) return null;
              return <div key={f.id} style={{ margin: '8px 0' }}>{(f.type === 'image' || f.type === 'drawing' || f.type === 'audio') ? fieldValue(f, detail) : <div><b>{f.label}:</b> {fieldValue(f, detail)}</div>}</div>;
            })}
            <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
              <button className="btn blue" onClick={() => printPost(tool.title, detail, entryFields, detail.username || 'anon')}>📄 Save as PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* ┄ divider: activities/feed ┄ comments ┄ */}
      <div style={dashRule} />

      {/* Platform-provided comment section on every tool. */}
      <CommentSection targetType="tool" targetId={tool.slug} />

      {/* ┄ divider: comments ┄ more picks ┄ */}
      <div style={dashRule} />
      {/* The SAME sliding suggestion feed as the Tools page, biased to this tool. */}
      <SuggestionCarousel likeSlug={tool.slug} title="✨ More like this" />
    </>
  );
}
