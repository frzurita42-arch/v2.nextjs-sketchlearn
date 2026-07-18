'use client';
/* Sandbox — a workbench for the new shell layout. It now previews the EMPTY-gallery
 * state: the looping ✏️ "make one" pencil CTA plus a recommended repo card (the
 * shared <ToolCard>), centred in the same working column as the chat. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { ToolCard } from '@/components/tools/ToolCard';
import { useCardSize, useImgSize, galleryLayout } from '@/lib/card-size';
import { PageHeading } from '@/components/ui/PageHeading';

export function SandboxView() {
  const app = useApp();
  const [repo, setRepo] = useState<any>(null);
  const cardSize = useCardSize('sandbox');
  const imgMode = useImgSize('sandbox');
  const layout = galleryLayout(cardSize);

  useEffect(() => {
    let alive = true;
    API.get('/api/tools').then((r: any) => {
      if (!alive) return;
      const all = Array.isArray(r?.tools) ? r.tools : [];
      const repos = all.filter((t: any) => (t?.archetype || t?.definition?.archetype) !== 'lesson');
      // Prefer a free/example repo as the "recommended" pick, else the first one.
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
        <PageHeading pageKey="sandbox" title="🧪 Sandbox" subtitle="Empty-gallery state preview." />

        <div style={{ ...layout.container, alignItems: 'stretch' }}>
          {/* The looping pencil "make one" CTA card — stretches to the card height. */}
          <div className="card" style={{ height: '100%', minHeight: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, padding: 18 }}>
            <span className="sl-pencil" style={{ fontSize: 42, color: 'var(--ink)' }} aria-hidden>
              <span className="sl-pencil__line" />
              <span className="sl-pencil__tip">✏️</span>
            </span>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4 }}>Make a repository or create a Slide Tool to get started.</p>
            <button className="btn green" onClick={() => app.nav('chat')}>＋ Build one</button>
          </div>

          {/* A recommended repo, shown with the shared card (Open button hidden). */}
          {repo && <ToolCard tool={repo} view={layout.view} hideOpen onOpen={openTool} imageMode={imgMode} />}
        </div>
      </div>
    </div>
  );
}
