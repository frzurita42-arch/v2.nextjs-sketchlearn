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
  const filtered = filter === 'all' ? tools : tools.filter(t => toolCategory(t) === filter);
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
  }, [tools, filter, newestFirst]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  // Keep the page in range when the filter/sort/list changes.
  useEffect(() => { setPage(p => Math.min(p, pageCount - 1)); }, [pageCount]);
  useEffect(() => { setPage(0); }, [filter, newestFirst]);
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
      <p className="view-sub">Open a tool, or build your own by describing it to the AI.{' '}
        <button className="btn small green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>{' '}
        <button className="btn small" onClick={load}>↻ Refresh</button></p>

      {!loading && tools.length > 0 && (
        <>
          <CategoryFilter value={filter} onChange={setFilter} counts={counts} />
          <Divider />
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
          <p style={{ textAlign: 'center', opacity: 0.7 }}>No tools in this category yet.</p>
        ) : (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, maxWidth: 900, margin: '0 auto' }}>
            {shown.map(t => (
              <div key={t.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 16 }}>{t.title}</strong>
                  <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>{t.archetype === 'app' ? 'APP' : t.archetype === 'lesson' ? 'LESSON' : 'GEN'}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.85, flex: 1 }}>{t.description || 'No description.'}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(Array.isArray(t.tags) ? t.tags : []).map((tag: string) => <span key={tag} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1.5px solid var(--ink)' }}>#{tag}</span>)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>@{t.owner} · {t.visibility}{t.aiGenerated ? ' · ✦AI' : ''}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {canRemove(t) && <button className="btn small ghost" title={isExample(t) ? 'Hide this example' : 'Delete'} onClick={() => del(t)}>{isExample(t) ? '✕' : '🗑'}</button>}
                    <button className="btn small green" onClick={() => open(t)}>Open →</button>
                  </span>
                </div>
              </div>
            ))}
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
