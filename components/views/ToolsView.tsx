'use client';
/* Tool gallery: browse published tools (public + your own) and open them in the
 * runtime, or start the Builder chat to make a new one. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { toolCategory } from '@/lib/tool-category';
import { CategoryFilter } from '@/components/tools/CategoryFilter';

const PER_PAGE = 9;   // gallery shows 9 tools per page

export function ToolsView() {
  const app = useApp();
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [newestFirst, setNewestFirst] = useState(true);   // sort order; toggle below
  const [page, setPage] = useState(0);                    // 0-based page index
  const [viewMode, setViewMode] = useState<'grid' | 'row'>('grid');   // card grid vs horizontal rows
  const [q, setQ] = useState('');                         // search by name / @username
  const [favOnly, setFavOnly] = useState(false);          // "my favorites" (liked)
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setFavs(JSON.parse(localStorage.getItem('sl_tool_likes') || '{}')); } catch { /* ignore */ }
    try { const v = localStorage.getItem('sl_tools_view'); if (v === 'row' || v === 'grid') setViewMode(v); } catch { /* ignore */ }
  }, []);
  const setView = (v: 'grid' | 'row') => { setViewMode(v); try { localStorage.setItem('sl_tools_view', v); } catch { /* ignore */ } };

  const HIDDEN_KEY = 'sl_hidden_examples';
  const loadHidden = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } };

  const load = async () => {
    setLoading(true);
    try {
      const r = await API.get('/api/tools');
      const hidden = loadHidden();
      setTools((Array.isArray(r?.tools) ? r.tools : []).filter((t: any) => !hidden.includes(t.slug)));
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Category counts (for the filter chips) + the visible subset.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tools.length };
    for (const t of tools) { const k = toolCategory(t); c[k] = (c[k] || 0) + 1; }
    return c;
  }, [tools]);
  const needle = q.trim().toLowerCase();
  const filtered = tools.filter(t => {
    if (filter !== 'all' && toolCategory(t) !== filter) return false;
    if (favOnly && !favs[t.slug]) return false;
    if (needle && !(String(t.title || '').toLowerCase().includes(needle) || String(t.owner || '').toLowerCase().includes(needle))) return false;
    return true;
  });
  // Sort by creation time; newest→oldest by default, toggleable to oldest→newest.
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return newestFirst ? tb - ta : ta - tb;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, filter, newestFirst, q, favOnly, favs]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  // Keep the page in range when the filter/sort/list changes.
  useEffect(() => { setPage(p => Math.min(p, pageCount - 1)); }, [pageCount]);
  useEffect(() => { setPage(0); }, [filter, newestFirst, q, favOnly]);
  const shown = sorted.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  // A dashed rule that separates gallery sections, matching the sketch theme.
  const Divider = () => <div style={{ maxWidth: 900, margin: '16px auto', borderTop: '2px dashed var(--ink)', opacity: 0.5 }} />;

  const open = (t: any) => { appState.activeTool = t; app.nav('tool'); };
  const isExample = (t: any) => (t.tags || []).includes('example');
  // Real tools: owner/admin may delete. Built-in examples: anyone may hide from their own gallery.
  const canRemove = (t: any) => isExample(t) || app.user?.role === 'admin' || app.user?.username === t.owner;
  const del = async (t: any) => {
    if (isExample(t)) {
      const hidden = Array.from(new Set([...loadHidden(), t.slug]));
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)); } catch { /* ignore */ }
      setTools(ts => ts.filter(x => x.slug !== t.slug));
      return;
    }
    if (!confirm(`Delete “${t.title}”? This can't be undone.`)) return;
    try { await API.del(`/api/tools?slug=${encodeURIComponent(t.slug)}`); setTools(ts => ts.filter(x => x.slug !== t.slug)); } catch (e: any) { alert(e?.message || 'Could not delete.'); }
  };

  return (
    <>
      <h1 className="view-title">Tool <span className="scribble-underline">gallery</span></h1>
      <p className="view-sub" style={{ textAlign: 'center' }}>Open a tool, or build your own by describing it to the AI.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="btn small green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>
        <button className="btn small" onClick={load}>↻ Refresh</button>
      </div>

      {!loading && tools.length > 0 && (
        <>
          <CategoryFilter value={filter} onChange={setFilter} counts={counts} />
          <Divider />
          <div style={{ maxWidth: 900, margin: '0 auto 10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 search by name or @user" style={{ fontSize: 13, flex: '1 1 200px', maxWidth: 280, padding: '5px 9px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
            <button className={`btn small ${favOnly ? 'blue' : 'ghost'}`} onClick={() => setFavOnly(v => !v)} title="Show only tools you've favorited">★ My favorites</button>
            {/* grid vs horizontal-rows display */}
            <div style={{ display: 'inline-flex', border: '1.5px solid var(--ink)', borderRadius: 6, overflow: 'hidden' }}>
              <button className={`btn small ${viewMode === 'grid' ? 'blue' : 'ghost'}`} style={{ borderRadius: 0, border: 'none' }} title="Card grid" onClick={() => setView('grid')}>▦</button>
              <button className={`btn small ${viewMode === 'row' ? 'blue' : 'ghost'}`} style={{ borderRadius: 0, border: 'none' }} title="Rows" onClick={() => setView('row')}>☰</button>
            </div>
          </div>
          <div style={{ maxWidth: 900, margin: '0 auto 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, opacity: 0.6 }}>{sorted.length} tool{sorted.length === 1 ? '' : 's'}</span>
            <button className="btn small" onClick={() => setNewestFirst(v => !v)} title="Toggle sort order">
              {newestFirst ? '↓ Newest first' : '↑ Oldest first'}
            </button>
          </div>
        </>
      )}

      {loading ? <p style={{ textAlign: 'center', opacity: 0.7 }}>Loading…</p>
        : tools.length === 0 ? (
          <div className="card alt" style={{ maxWidth: 560, margin: '10px auto', padding: '18px 20px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 10px' }}>No tools yet. Be the first — describe a tool and the AI will assemble it.</p>
            <button className="btn green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>
          </div>
        ) : shown.length === 0 ? (
          <p style={{ textAlign: 'center', opacity: 0.7 }}>No tools match these filters.</p>
        ) : (
          <>
          {/* Card GRID or single-column horizontal ROWS. */}
          <div style={viewMode === 'grid'
            ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, maxWidth: 900, margin: '0 auto' }
            : { display: 'grid', gap: 10, maxWidth: 900, margin: '0 auto' }}>
            {shown.map(t => {
              const kind = t.archetype === 'app' ? 'APP' : t.archetype === 'lesson' ? 'LESSON' : t.archetype === 'repo' ? 'REPO' : 'GEN';
              const meta = <span style={{ fontSize: 11, opacity: 0.6 }}>@{t.owner} · {t.visibility}{t.aiGenerated ? ' · ✦AI' : ''}</span>;
              const actions = (
                <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
                  {canRemove(t) && <button className="btn small ghost" title={isExample(t) ? 'Hide this example' : 'Delete'} onClick={() => del(t)}>{isExample(t) ? '✕' : '🗑'}</button>}
                  <button className="btn small green" onClick={() => open(t)}>Open →</button>
                </span>
              );
              if (viewMode === 'row') return (
                <div key={t.id} className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 15 }}>{t.title}</strong>
                      <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.55 }}>{kind}</span>
                      {favs[t.slug] && <span style={{ fontSize: 11 }}>★</span>}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || 'No description.'}</div>
                    {meta}
                  </div>
                  {actions}
                </div>
              );
              return (
                <div key={t.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 16 }}>{t.title}{favs[t.slug] ? ' ★' : ''}</strong>
                    <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>{kind}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.85, flex: 1 }}>{t.description || 'No description.'}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(Array.isArray(t.tags) ? t.tags : []).map((tag: string) => <span key={tag} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1.5px solid var(--ink)' }}>#{tag}</span>)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    {meta}
                    {actions}
                  </div>
                </div>
              );
            })}
          </div>
          {pageCount > 1 && (
            <>
              <Divider />
              <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <button className="btn small" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Prev</button>
                <span style={{ fontSize: 13, opacity: 0.7 }}>Page {page + 1} / {pageCount}</span>
                <button className="btn small" disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Next →</button>
              </div>
            </>
          )}
          </>
        )}
    </>
  );
}
