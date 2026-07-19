'use client';
/* Empty — a copy of the Sandbox (empty-gallery state preview) under its own nav
 * entry, so it can diverge from the Sandbox later. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { useCardSize, useImgSize } from '@/lib/card-size';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { CardViewMenu } from '@/components/ui/CardViewMenu';
import { GalleryFilterRow } from '@/components/ui/GalleryChrome';
import { GallerySkeleton } from '@/components/ui/GallerySkeleton';

export function EmptyView() {
  const app = useApp();
  const [repo, setRepo] = useState<any>(null);
  const cardSize = useCardSize('empty');
  const imgMode = useImgSize('empty');

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
        <PageHeaderBar pageKey="empty" title="📭 Empty" subtitle="Empty-gallery state preview." />

        <GalleryFilterRow right={<CardViewMenu pageKey="empty" />} />

        {/* The shared gallery skeleton (make/play card + recommended + pager). */}
        <GallerySkeleton cardSize={cardSize} imgMode={imgMode} recommended={repo} onBuild={() => app.nav('chat')} onOpen={openTool} />
      </div>
    </div>
  );
}
