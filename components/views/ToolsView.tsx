'use client';
/* Tool gallery: browse published tools (public + your own) and open them in the
 * runtime, or start the Builder chat to make a new one. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';

export function ToolsView() {
  const app = useApp();
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await API.get('/api/tools'); setTools(Array.isArray(r?.tools) ? r.tools : []); } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const open = (t: any) => { appState.activeTool = t; app.nav('tool'); };
  const canDelete = (t: any) => !(t.tags || []).includes('example') && (app.user?.role === 'admin' || app.user?.username === t.owner);
  const del = async (t: any) => {
    if (!confirm(`Delete “${t.title}”? This can't be undone.`)) return;
    try { await API.del(`/api/tools?slug=${encodeURIComponent(t.slug)}`); setTools(ts => ts.filter(x => x.slug !== t.slug)); } catch (e: any) { alert(e?.message || 'Could not delete.'); }
  };

  return (
    <>
      <h1 className="view-title">Tool <span className="scribble-underline">gallery</span></h1>
      <p className="view-sub">Open a tool, or build your own by describing it to the AI.{' '}
        <button className="btn small green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>{' '}
        <button className="btn small" onClick={load}>↻ Refresh</button></p>

      {loading ? <p style={{ textAlign: 'center', opacity: 0.7 }}>Loading…</p>
        : tools.length === 0 ? (
          <div className="card alt" style={{ maxWidth: 560, margin: '10px auto', padding: '18px 20px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 10px' }}>No tools yet. Be the first — describe a tool and the AI will assemble it.</p>
            <button className="btn green" onClick={() => app.nav('toolbuilder')}>＋ Build a tool</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, maxWidth: 900, margin: '0 auto' }}>
            {tools.map(t => (
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
                    {canDelete(t) && <button className="btn small ghost" title="Delete" onClick={() => del(t)}>🗑</button>}
                    <button className="btn small green" onClick={() => open(t)}>Open →</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
    </>
  );
}
