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
  if ((f.type === 'image' || f.type === 'drawing') && typeof v === 'string' && v.startsWith('data:')) {
    return <img src={v} alt={f.label} style={{ width: '100%', borderRadius: 8, border: '2px solid var(--ink)', display: 'block' }} />;
  }
  if (f.type === 'audio' && typeof v === 'string' && v.startsWith('data:')) {
    return <audio controls src={v} style={{ width: '100%', height: 36 }} />;
  }
  if (f.type === 'toggle') return v ? 'yes' : 'no';
  if (f.type === 'textarea' || f.type === 'text') return <RichText text={String(v ?? '')} />;
  return String(v ?? '');
}

function EntryDisplay({ entries: entriesIn, display, fields: fieldsIn }: { entries: any[]; display: string; fields: any[] }) {
  const entries = asArray(entriesIn);
  const fields = asArray(fieldsIn);
  if (!entries.length) return <p style={{ opacity: 0.6 }}>No entries yet — add the first one above.</p>;
  const imageFields = fields.filter((f: any) => f.type === 'image');
  const textFields = fields.filter((f: any) => f.type !== 'image');

  if (display === 'table') return (
    <div style={{ overflowX: 'auto' }}>
      <table className="sketch-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left', borderBottom: '2px solid var(--ink)', padding: 6 }}>By</th>{fields.map(f => <th key={f.id} style={{ textAlign: 'left', borderBottom: '2px solid var(--ink)', padding: 6 }}>{f.label}</th>)}</tr></thead>
        <tbody>{entries.map(e => (
          <tr key={e.id}>
            <td style={{ padding: 6, fontSize: 12, opacity: 0.7 }}>@{e.username || 'anon'}</td>
            {fields.map(f => <td key={f.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.15)', padding: 6, maxWidth: 160 }}>{fieldValue(f, e)}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
  if (display === 'list') return (
    <div>{entries.map(e => (
      <div key={e.id} style={{ borderBottom: '2px dashed var(--ink)', padding: '8px 0' }}>
        {imageFields.map((f: any) => e.data?.[f.id] && <div key={f.id} style={{ maxWidth: 320, marginBottom: 6 }}>{fieldValue(f, e)}</div>)}
        {textFields.map((f: any) => <span key={f.id} style={{ marginRight: 10 }}><b>{f.label}:</b> {fieldValue(f, e)}</span>)}
        <Byline e={e} />
      </div>
    ))}</div>
  );
  // cards (social-page style)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
      {entries.map(e => (
        <div key={e.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {imageFields.map((f: any) => e.data?.[f.id] && <div key={f.id}>{fieldValue(f, e)}</div>)}
          <div style={{ padding: '10px 12px' }}>
            {textFields.map((f: any) => <div key={f.id} style={{ fontSize: 14, marginBottom: 3 }}>{f.type === 'textarea' ? fieldValue(f, e) : <><b>{f.label}:</b> {fieldValue(f, e)}</>}</div>)}
            <Byline e={e} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ToolRunnerView() {
  const app = useApp();
  const tool = appState.activeTool;
  const def = tool?.definition;

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

  // Like state (platform chrome): count from the tool, per-user liked flag in localStorage.
  const [likes, setLikes] = useState<number>(tool?.likeCount || 0);
  const [liked, setLiked] = useState<boolean>(false);
  useEffect(() => {
    try { const set = JSON.parse(localStorage.getItem('sl_tool_likes') || '{}'); setLiked(!!set[tool?.slug]); } catch { /* ignore */ }
  }, [tool?.slug]);

  const isApp = def?.archetype === 'app';
  const isLesson = def?.archetype === 'lesson';
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

  const share = () => {
    const url = `${window.location.origin}/?tool=${encodeURIComponent(tool.slug)}`;
    navigator.clipboard?.writeText(url).then(
      () => alert(`Share link copied:\n${url}`),
      () => window.prompt('Copy this share link:', url)
    );
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
  const created = tool.createdAt ? new Date(tool.createdAt).toLocaleDateString() : '';

  return (
    <>
      <h1 className="view-title">{tool.title}</h1>

      {/* Social chrome: author + stats + like + share, provided by the platform
          (so tools never build their own author/like/comment components). */}
      <div className="card" style={{ maxWidth: 820, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: authorAv.color, border: '2px solid var(--ink)', fontSize: 20 }}>{authorAv.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>@{tool.owner}</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{created}{created ? ' · ' : ''}{tool.archetype} · {tool.visibility}{tool.aiGenerated ? ' · ✦AI-built' : ''}</div>
        </div>
        <button className="btn small ghost" onClick={toggleLike} aria-pressed={liked}>{liked ? '❤️' : '🤍'} {likes}</button>
        {tool.visibility !== 'private' && <button className="btn small blue" onClick={share}>🔗 Share</button>}
        <button className="btn small ghost" onClick={() => app.nav('tools')}>← Tools</button>
      </div>
      {def.description && <p className="view-sub" style={{ maxWidth: 820, margin: '8px auto 0' }}>{def.description}</p>}

      <section style={{ maxWidth: 820, margin: '8px auto 0' }}>
        {isLesson ? (
          <LessonPlayer def={def} slug={tool.slug} />
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
              <EntryDisplay entries={entries} display={def.app?.display || 'cards'} fields={entryFields} />
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

      {/* Platform-provided comment section on every tool. */}
      <CommentSection targetType="tool" targetId={tool.slug} />
    </>
  );
}
