'use client';
/* Sandbox — a workbench for the new shell layout. It now previews the EMPTY-gallery
 * state: the looping ✏️ "make one" pencil CTA plus a recommended repo card (the
 * shared <ToolCard>), centred in the same working column as the chat. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { useCardSize, useImgSize } from '@/lib/card-size';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { CardViewMenu } from '@/components/ui/CardViewMenu';
import { GalleryFilterRow } from '@/components/ui/GalleryChrome';
import { GallerySkeleton } from '@/components/ui/GallerySkeleton';

export function SandboxView() {
  const app = useApp();
  const [repo, setRepo] = useState<any>(null);
  const cardSize = useCardSize('sandbox');
  const imgMode = useImgSize('sandbox');

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
        <PageHeaderBar pageKey="sandbox" title="🧪 Sandbox" subtitle="Empty-gallery state preview." />

        <GalleryFilterRow right={<CardViewMenu pageKey="sandbox" />} />

        {/* The shared gallery skeleton (make/play card + recommended + pager). */}
        <GallerySkeleton cardSize={cardSize} imgMode={imgMode} recommended={repo} onBuild={() => app.nav('chat')} onOpen={openTool} />
      </div>
    </div>
  );
}
