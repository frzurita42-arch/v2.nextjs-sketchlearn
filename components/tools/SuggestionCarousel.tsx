'use client';
/* "Top picks for you" — a self-contained sliding feed of personalized tool +
 * repository suggestions (based on the viewer's activity: what they own and
 * favorited). Drop it in anywhere: the Tools home page and below the comments on
 * a tool page both render <SuggestionCarousel/>. Refresh pulls a fresh set. Each
 * card is the shared ToolCard, so owner/admin get the same ✎/🎨/📎 edit controls
 * (title, description and picture — with AI or a custom input) as the gallery. */
import { useCallback, useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { ToolCard } from '@/components/tools/ToolCard';
import { RecommendButton } from '@/components/tools/RecommendButton';
import { Carousel } from '@/components/ui/Carousel';

export function SuggestionCarousel({ likeSlug, title = '✨ Top picks for you', limit = 10,
  canEditTitle, onRenameTitle, onRemixTitle, remixingTitle }: {
  likeSlug?: string; title?: string; limit?: number;
  canEditTitle?: boolean; onRenameTitle?: (t: string) => void; onRemixTitle?: () => void; remixingTitle?: boolean;
}) {
  const app = useApp();
  const [picks, setPicks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [work, setWork] = useState<Record<string, boolean>>({});   // per-card AI busy

  const favSlugs = (): string => {
    try { const m = JSON.parse(localStorage.getItem('sl_tool_likes') || '{}'); return Object.keys(m).filter(k => m[k]).join(','); } catch { return ''; }
  };

  const load = useCallback(async (s: number) => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ seed: String(s), limit: String(limit) });
      const favs = favSlugs(); if (favs) qs.set('favs', favs);
      if (likeSlug) qs.set('like', likeSlug);
      const r = await API.get(`/api/tools/suggestions?${qs.toString()}`);
      setPicks(Array.isArray(r?.picks) ? r.picks : []);
    } catch { setPicks([]); }
    finally { setBusy(false); }
  }, [likeSlug, limit]);

  useEffect(() => { load(seed); }, [load, seed]);
  const refresh = () => setSeed(Math.floor(Math.random() * 1e6));

  const patch = (slug: string, p: any) => setPicks(list => list.map(x => x.slug === slug ? { ...x, ...p } : x));
  const setBusyFor = (slug: string, v: boolean) => setWork(w => { const n = { ...w }; if (v) n[slug] = true; else delete n[slug]; return n; });

  const open = async (t: any) => {
    try {
      const r = await API.get(`/api/tools?slug=${encodeURIComponent(t.slug)}`);
      if (r?.tool) { appState.activeTool = r.tool; app.nav('tool'); }
    } catch { /* ignore */ }
  };

  // Owner/admin editing — same actions as the gallery, kept self-contained here.
  const isExample = (t: any) => (t.tags || []).includes('example');
  const canEdit = (t: any) => isExample(t) ? app.user?.role === 'admin' : (app.user?.role === 'admin' || app.user?.username === t.owner);

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

  // Delete: an owner/admin actually deletes a real tool; otherwise it just
  // dismisses the suggestion from this shelf.
  const remove = async (t: any) => {
    if (!isExample(t) && canEdit(t)) {
      if (!confirm(`Delete “${t.title}”? This can't be undone.`)) return;
      try { await API.del(`/api/tools?slug=${encodeURIComponent(t.slug)}`); } catch { /* ignore */ }
    }
    setPicks(list => list.filter(x => x.slug !== t.slug));
  };

  const card = (p: any) => {
    // ToolCard reads these fields; the pick carries them + a reason as description.
    const t = { ...p, description: p.description || p.reason };
    const editable = canEdit(p);
    return (
      <ToolCard tool={t} view="grid" onOpen={open} hideOpen
        canEdit={editable} onEdit={editable ? editText : undefined} onRemix={editable ? remixText : undefined} mixing={!!work[p.slug]}
        onGenThumb={editable ? ((x: any) => genThumb(x)) : undefined} onThumbPrompt={editable ? thumbPrompt : undefined}
        onUploadThumb={editable ? uploadThumb : undefined} thumbing={!!work[p.slug]}
        canRemove isExample={isExample(p)} onRemove={remove} />
    );
  };

  return (
    <Carousel title={title} onRefresh={refresh} refreshing={busy} cardWidth={230} cardHeight={360}
      canEditTitle={canEditTitle} onRenameTitle={onRenameTitle} onRemixTitle={onRemixTitle} remixingTitle={remixingTitle}
      headerExtra={<RecommendButton likeSlug={likeSlug} limit={limit} label="✨ Recommend 10" onResults={setPicks} />}
      empty={busy ? 'Finding picks…' : 'No suggestions yet — favorite a few tools and check back.'}>
      {picks.map((p) => <div key={p.slug} style={{ height: '100%' }}>{card(p)}</div>)}
    </Carousel>
  );
}
