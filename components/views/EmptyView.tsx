'use client';
/* Empty — a copy of the Sandbox (empty-gallery state preview) under its own nav
 * entry, so it can diverge from the Sandbox later. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { ToolCard } from '@/components/tools/ToolCard';
import { useCardSize, useImgSize, galleryLayout } from '@/lib/card-size';

export function EmptyView() {
  const app = useApp();
  const [repo, setRepo] = useState<any>(null);
  const cardSize = useCardSize('empty');
  const imgMode = useImgSize('empty');
  const layout = galleryLayout(cardSize);

  useEffect(() => {
    let alive = true;
    API.get('/api/tools').then((r: any) => {
      if (!alive) return;
      const all = Array.isArray(r?.tools) ? r.tools : [];
      const repos = all.filter((t: any) => (t?.archetype || t?.definition?.archetype) !== 'lesson');
      setRepo(repos.find((t: any) => (t.tags || []).includes('example')) || repos[0] || null);
    }).catch(() => { /* none */ });
    return () => { alive = false; };
  }, []);

  const openTool = async (t: any) => {
    try { const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(t.slug)}`); appState.activeTool = r?.tool || t; }
    catch { appState.activeTool = t; }
    app.nav('tool');
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <h2 className="scribble-underline" style={{ display: 'inline-block', margin: '0 0 4px' }}>📭 Empty</h2>
        <p style={{ margin: '0 0 16px', color: 'var(--muted,#8a7f70)', fontSize: 14 }}>Empty-gallery state preview.</p>

        <div style={{ ...layout.container, alignItems: 'stretch' }}>
          <div className="card" style={{ height: '100%', minHeight: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, padding: 18 }}>
            <span className="sl-pencil" style={{ fontSize: 42, color: 'var(--ink)' }} aria-hidden>
              <span className="sl-pencil__line" />
              <span className="sl-pencil__tip">✏️</span>
            </span>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4 }}>Make a repository or create a Slide Tool to get started.</p>
            <button className="btn green" onClick={() => app.nav('chat')}>＋ Build one</button>
          </div>
          {repo && <ToolCard tool={repo} view={layout.view} hideOpen onOpen={openTool} imageMode={imgMode} />}
        </div>
      </div>
    </div>
  );
}
