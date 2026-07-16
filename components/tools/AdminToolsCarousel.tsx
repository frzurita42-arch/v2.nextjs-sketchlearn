'use client';
/* "Admin's Made Tools" — the platform's built-in learning activities (Learning
 * Path, Suggested Topic, Time Travel, Structured Explanations, Language Learning)
 * shown as tools. Each opens the STANDARD tool page (input box + generations feed
 * with results & new-generation + comments + filter). Cards carry the trashcan
 * (delete/hide), the ♻️ new-generation and the 📖 OP-history icons. Up to 10 shown
 * in a random order. Reusable slider — more of these can appear elsewhere later. */
import { useCallback, useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { ToolCard } from '@/components/tools/ToolCard';
import { Carousel } from '@/components/ui/Carousel';

export function AdminToolsCarousel({ title = '🛠️ Admin\'s Made Tools', max = 10, banner,
  canEditTitle, onRenameTitle, onRemixTitle, remixingTitle,
  showCollapse, collapsed, onToggleCollapse }: {
  title?: string; max?: number; banner?: React.ReactNode;
  canEditTitle?: boolean; onRenameTitle?: (t: string) => void; onRemixTitle?: () => void; remixingTitle?: boolean;
  showCollapse?: boolean; collapsed?: boolean; onToggleCollapse?: () => void;
}) {
  const app = useApp();
  const [tools, setTools] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [work, setWork] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await API.get('/api/tools/admin-made');
      const list = Array.isArray(r?.tools) ? r.tools : [];
      setTools([...list].sort(() => Math.random() - 0.5).slice(0, max));   // random, max 10
    } catch { setTools([]); } finally { setBusy(false); }
  }, [max]);
  useEffect(() => { load(); }, [load]);

  // Effective admin (viewAs-aware): these built-in tools are admin-curated, so
  // the edit controls must disappear in the Moderators / User previews (and for
  // a real moderator or user account) — only a real admin sees them.
  const isAdmin = app.eff().isAdmin;
  const patch = (slug: string, p: any) => setTools(list => list.map(x => x.slug === slug ? { ...x, ...p, definition: { ...(x.definition || {}), ...(p.title ? { title: p.title } : {}), ...(p.description ? { description: p.description } : {}) } } : x));
  const setBusyFor = (slug: string, v: boolean) => setWork(w => { const n = { ...w }; if (v) n[slug] = true; else delete n[slug]; return n; });

  const openTool = async (t: any, intent?: { action: 'results' | 'replay' | 'generate'; config?: any }) => {
    try {
      const r = await API.get(`/api/tools?slug=${encodeURIComponent(t.slug)}`);
      if (r?.tool) { appState.activeTool = r.tool; appState.openIntent = intent || null; app.nav('tool'); }
    } catch { /* ignore */ }
  };

  const editText = (t: any) => {
    const titleV = window.prompt('Title:', t.title); if (titleV == null) return;
    const descV = window.prompt('Description:', t.description || ''); if (descV == null) return;
    API.post('/api/tools/rename', { slug: t.slug, title: titleV, description: descV })
      .then((r: any) => { if (r?.ok) patch(t.slug, { title: r.title, description: r.description }); else if (r?.error) alert(r.error); })
      .catch((e: any) => alert(e?.message || 'Could not save.'));
  };
  const remixText = async (t: any) => {
    setBusyFor(t.slug, true);
    try {
      const r = await API.post('/api/tools/remix', { slug: t.slug });
      if (r?.title) { await API.post('/api/tools/rename', { slug: t.slug, title: r.title, description: r.description }); patch(t.slug, { title: r.title, description: r.description }); }
      else if (r?.error) alert(r.error);
    } catch (e: any) { alert(e?.message || 'Could not remix.'); } finally { setBusyFor(t.slug, false); }
  };
  const genThumb = async (t: any, instruction?: string) => {
    setBusyFor(t.slug, true);
    try { const r = await API.post('/api/tools/thumbnail', { slug: t.slug, instruction }); if (r?.thumbnail) patch(t.slug, { thumbnail: r.thumbnail }); else if (r?.error) alert(r.error); }
    catch (e: any) { alert(e?.message || 'Could not generate.'); } finally { setBusyFor(t.slug, false); }
  };
  const thumbPrompt = (t: any) => { const i = window.prompt('Describe the image to generate:', ''); if (i == null) return; genThumb(t, i); };
  const uploadThumb = (t: any, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      setBusyFor(t.slug, true);
      try { const r = await API.post('/api/tools/thumbnail', { slug: t.slug, image: String(reader.result || '') }); if (r?.thumbnail) patch(t.slug, { thumbnail: r.thumbnail }); else if (r?.error) alert(r.error); }
      catch (e: any) { alert(e?.message || 'Could not upload.'); } finally { setBusyFor(t.slug, false); }
    };
    reader.readAsDataURL(file);
  };
  const remove = (t: any) => setTools(list => list.filter(x => x.slug !== t.slug));   // dismiss from this shelf

  const card = (t: any) => (
    <ToolCard tool={t} view="grid" onOpen={(x) => openTool(x)} hideOpen
      canEdit={isAdmin} onEdit={isAdmin ? editText : undefined} onRemix={isAdmin ? remixText : undefined} mixing={!!work[t.slug]}
      onGenThumb={isAdmin ? ((x: any) => genThumb(x)) : undefined} onThumbPrompt={isAdmin ? thumbPrompt : undefined}
      onUploadThumb={isAdmin ? uploadThumb : undefined} thumbing={!!work[t.slug]}
      canRemove isExample onRemove={remove}
      onReplay={(x) => openTool(x, { action: 'generate' })}
      onHistory={(x) => openTool(x, { action: 'results' })} />
  );

  return (
    <Carousel title={title} onRefresh={load} refreshing={busy} cardWidth={230} cardHeight={360} banner={banner}
      canEditTitle={canEditTitle} onRenameTitle={onRenameTitle} onRemixTitle={onRemixTitle} remixingTitle={remixingTitle}
      showCollapse={showCollapse} collapsed={collapsed} onToggleCollapse={onToggleCollapse}
      empty={busy ? 'Loading…' : 'No admin tools.'}>
      {tools.map((t) => <div key={t.slug} style={{ height: '100%' }}>{card(t)}</div>)}
    </Carousel>
  );
}
