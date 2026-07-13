'use client';
/* Tool gallery: browse published tools (public + your own) and open them in the
 * runtime, or start the Builder chat to make a new one. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { toolCategory } from '@/lib/tool-category';
import { CategoryFilter } from '@/components/tools/CategoryFilter';
import { Collection } from '@/components/ui/Collection';

export function ToolsView() {
  const app = useApp();
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');            // category chip (section-specific)
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setFavs(JSON.parse(localStorage.getItem('sl_tool_likes') || '{}')); } catch { /* ignore */ } }, []);

  // Admin-editable page copy (heading + subtitle), saved for everyone.
  const isAdmin = app.user?.role === 'admin';
  const [site, setSite] = useState<{ galleryTitle?: string; gallerySubtitle?: string }>({});
  const [editHeading, setEditHeading] = useState<null | 'galleryTitle' | 'gallerySubtitle'>(null);
  const [headingDraft, setHeadingDraft] = useState('');
  useEffect(() => { API.get('/api/site-settings').then((r: any) => setSite(r?.settings || {})).catch(() => { /* ignore */ }); }, []);
  const saveHeading = async (key: 'galleryTitle' | 'gallerySubtitle', val: string) => {
    setEditHeading(null);
    const v = val.trim();
    setSite(s => ({ ...s, [key]: v }));
    try { await API.put('/api/site-settings', { key, value: v }); } catch { /* ignore */ }
  };

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
  // Category is the section-specific filter; the standard Collection owns the rest.
  const catItems = filter === 'all' ? tools : tools.filter(t => toolCategory(t) === filter);
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

  const kindOf = (t: any) => t.archetype === 'app' ? 'APP' : t.archetype === 'lesson' ? 'LESSON' : t.archetype === 'repo' ? 'REPO' : 'GEN';
  const meta = (t: any) => <span style={{ fontSize: 11, opacity: 0.6 }}>@{t.owner} · {t.visibility}{t.aiGenerated ? ' · ✦AI' : ''}</span>;
  const actions = (t: any) => (
    <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
      {canRemove(t) && <button className="btn small ghost" title={isExample(t) ? 'Hide this example' : 'Delete'} onClick={() => del(t)}>{isExample(t) ? '✕' : '🗑'}</button>}
      <button className="btn small green" onClick={() => open(t)}>Open →</button>
    </span>
  );
  const renderRow = (t: any) => {
    const desc = t.description || 'No description.';
    const long = desc.length > 110;
    return (
      <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, maxWidth: '100%' }}>
        <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15 }}>{t.title}</strong>
            <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.55 }}>{kindOf(t)}</span>
            {favs[t.slug] && <span style={{ fontSize: 11 }}>★</span>}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {long ? desc.slice(0, 110).trimEnd() + '… ' : desc}
            {long && <button className="btn small ghost" style={{ padding: '0 4px', fontSize: 11 }} onClick={() => open(t)}>Read more</button>}
          </div>
          {meta(t)}
        </div>
        {actions(t)}
      </div>
    );
  };
  const renderGrid = (t: any) => (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <strong style={{ fontSize: 16 }}>{t.title}{favs[t.slug] ? ' ★' : ''}</strong>
        <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>{kindOf(t)}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85, flex: 1 }}>{t.description || 'No description.'}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(Array.isArray(t.tags) ? t.tags : []).map((tag: string) => <span key={tag} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1.5px solid var(--ink)' }}>#{tag}</span>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>{meta(t)}{actions(t)}</div>
    </div>
  );

  return (
    <>
      {editHeading === 'galleryTitle' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', maxWidth: 620, margin: '0 auto' }}>
          <input value={headingDraft} onChange={e => setHeadingDraft(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveHeading('galleryTitle', headingDraft); if (e.key === 'Escape') setEditHeading(null); }}
            style={{ fontSize: 24, fontWeight: 700, padding: '4px 8px', borderRadius: 8, border: '2px solid var(--ink)', width: '100%', maxWidth: 460 }} />
          <button className="btn small green" onClick={() => saveHeading('galleryTitle', headingDraft)}>Save</button>
          <button className="btn small ghost" onClick={() => setEditHeading(null)}>✕</button>
        </div>
      ) : (
        <h1 className="view-title">
          {site.galleryTitle ? site.galleryTitle : <>Tool <span className="scribble-underline">gallery</span></>}
          {isAdmin && <button title="Edit heading (admin)" onClick={() => { setHeadingDraft(site.galleryTitle || 'Tool gallery'); setEditHeading('galleryTitle'); }} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>✎</button>}
        </h1>
      )}
      {editHeading === 'gallerySubtitle' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', maxWidth: 620, margin: '4px auto' }}>
          <input value={headingDraft} onChange={e => setHeadingDraft(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveHeading('gallerySubtitle', headingDraft); if (e.key === 'Escape') setEditHeading(null); }}
            style={{ fontSize: 14, padding: '4px 8px', borderRadius: 8, border: '2px solid var(--ink)', width: '100%', maxWidth: 460 }} />
          <button className="btn small green" onClick={() => saveHeading('gallerySubtitle', headingDraft)}>Save</button>
          <button className="btn small ghost" onClick={() => setEditHeading(null)}>✕</button>
        </div>
      ) : (
        <p className="view-sub" style={{ textAlign: 'center' }}>
          {site.gallerySubtitle || 'Open a tool, or build your own by describing it to the AI.'}
          {isAdmin && <button title="Edit subtitle (admin)" onClick={() => { setHeadingDraft(site.gallerySubtitle || 'Open a tool, or build your own by describing it to the AI.'); setEditHeading('gallerySubtitle'); }} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✎</button>}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="btn small green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>
        <button className="btn small" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? <p style={{ textAlign: 'center', opacity: 0.7 }}>Loading…</p>
        : tools.length === 0 ? (
          <div className="card alt" style={{ maxWidth: 560, margin: '10px auto', padding: '18px 20px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 10px' }}>No tools yet. Be the first — describe a tool and the AI will assemble it.</p>
            <button className="btn green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>
          </div>
        ) : (
          <>
            <CategoryFilter value={filter} onChange={setFilter} counts={counts} />
            <Divider />
            <Collection
              items={catItems}
              id={(t: any) => t.id}
              searchText={(t: any) => `${t.title || ''} ${t.owner || ''}`}
              time={(t: any) => new Date(t.createdAt || 0).getTime()}
              favs={favs}
              likedByAdmin={(t: any) => !!t.likedByAdmin}
              perPage={9}
              storageKey="sl_tools_view"
              emptyFiltered="No tools match these filters."
              emptyAll="No tools in this category yet."
              renderGrid={renderGrid}
              renderRow={renderRow}
            />
          </>
        )}
    </>
  );
}
