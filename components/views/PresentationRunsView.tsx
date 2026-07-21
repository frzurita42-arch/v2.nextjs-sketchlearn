'use client';
/* Presentation runs — a GENERIC empty-state view (like Sandbox / Empty) that shows
 * how a presentation gallery looks before there's data: the gallery skeleton (a
 * "make/play one" card + a recommended presentation + pager) inside the shell
 * working column. The presentation-specific tool — the "Make a slide presentation"
 * settings form — lives behind the ⚙️ gear in the filter row (and the CTA button),
 * opening as a popup. This is what makes it different from the Slides gallery. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState, LEVELS, TONES } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { type ToolField, MAX_SLIDES } from '@/lib/tool-schema';
import { useCardSize, useImgSize, galleryLayout, cardImageProps } from '@/lib/card-size';
import { loadLikes, saveLikes } from '@/lib/tool-likes';
import { ToolCard } from '@/components/tools/ToolCard';
import { ToolFields } from '@/components/tools/ToolFields';
import { SetupWizardCard } from '@/components/ui/SetupWizardCard';
import { SharePanel } from '@/components/tools/SharePanel';
import { avatarFor } from '@/components/social/AuthorBar';
import { CardShell } from '@/components/ui/CardShell';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import { StorageModeBadge } from '@/components/ui/StorageModeBadge';
import { RepoChatComposer } from '@/components/ui/RepoChatComposer';
import { CardViewMenu } from '@/components/ui/CardViewMenu';
import { GalleryFilterRow, GalleryPager } from '@/components/ui/GalleryChrome';
import { GallerySkeleton } from '@/components/ui/GallerySkeleton';
import { PagedTable, type Cell } from '@/components/ui/PagedTable';
import { StepWizard, type WizardStep } from '@/components/ui/StepWizard';
import { WizardGridTemplate } from '@/components/ui/WizardGridTemplate';

const PER_PAGE = 6;

function SlideSettings({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [topic, setTopic] = useState('');
  const [slides, setSlides] = useState(5);
  const [level, setLevel] = useState('Lower Intermediate');
  const [tone, setTone] = useState('Friendly lecture');
  const [textProv, setTextProv] = useState('gemini');
  const [imgProv, setImgProv] = useState('');
  const [textProviders, setTextProviders] = useState<{ id: string; label: string }[]>([]);
  const [imageProviders, setImageProviders] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    API.get('/api/config').then((c: any) => {
      setTextProviders(Array.isArray(c?.textProviders) ? c.textProviders : []);
      setImageProviders(Array.isArray(c?.imageProviders) ? c.imageProviders : []);
    }).catch(() => { /* ignore */ });
  }, []);

  const build = () => {
    if (!app.user) { app.requireLogin(); return; }
    const subject = topic.trim() || 'New presentation';
    appState.builderSeed = {
      artifact: 'presentation', subject, title: subject, tone,
      context: `Level: ${level}. About ${slides} slides. Text model: ${textProv}${imgProv ? `, image model: ${imgProv}` : ''}.`,
    };
    app.nav('toolbuilder');
  };

  const sel: React.CSSProperties = { width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3, display: 'block' };
  return (
    <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '100%', padding: '16px 18px', margin: '4vh 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <b>🎬 Make a slide presentation</b><button className="btn small ghost" onClick={onClose}>✕</button>
      </div>
      <div className="settings-compact" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
        <label style={{ gridColumn: '1 / -1' }}><span style={lbl}>Topic</span>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis, French greetings…" style={sel} /></label>
        <label><span style={lbl}>Slides</span>
          <input type="number" min={1} max={MAX_SLIDES} value={slides} onChange={(e) => setSlides(Math.max(1, Math.min(MAX_SLIDES, parseInt(e.target.value, 10) || 5)))} style={sel} /></label>
        <label><span style={lbl}>Level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={sel}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></label>
        <label><span style={lbl}>Tone</span>
          <select value={tone} onChange={(e) => setTone(e.target.value)} style={sel}>{TONES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label><span style={lbl}>Text API</span>
          <select value={textProv} onChange={(e) => setTextProv(e.target.value)} style={sel}>
            <option value="gemini">Gemini (default)</option>
            {textProviders.filter((p) => p.id !== 'gemini').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select></label>
        <label><span style={lbl}>Image API</span>
          <select value={imgProv} onChange={(e) => setImgProv(e.target.value)} style={sel}>
            <option value="">Auto</option>
            {imageProviders.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select></label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn green" onClick={build}>Build presentation →</button>
      </div>
    </div>
  );
}

export function PresentationRunsView() {
  const app = useApp();
  const [tools, setTools] = useState<any[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);   // inline rename of the create-card tool title
  const [titleDraft, setTitleDraft] = useState('');
  const [allRuns, setAllRuns] = useState<any[]>([]);
  const [toolMeta, setToolMeta] = useState<Record<string, any>>({});
  const [toolRuns, setToolRuns] = useState<any[]>([]);
  const [runsBusy, setRunsBusy] = useState(false);
  const [runsErr, setRunsErr] = useState('');
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const [entryFavs, setEntryFavs] = useState<Record<string, boolean>>({});
  // The generic page starts at All; selecting a specific tool scopes the gallery
  // to that tool's saved cards and defaults it to Favorites.
  const [filter, setFilter] = useState<'all' | 'fav'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [titleFilterSlug, setTitleFilterSlug] = useState('');
  const [tableSortBy, setTableSortBy] = useState<'title' | 'topic' | 'owner' | 'slides'>('title');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openingSlug, setOpeningSlug] = useState<string | null>(null);
  // Generic, non-persistent mock fields: visual input interface for this page.
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardKey, setWizardKey] = useState(0);
  const [form, setForm] = useState<Record<string, any>>({
    title: '', topic: '', level: 'Lower Intermediate', difficulty: 'Lower Intermediate',
    slides: 5, tone: 'Friendly lecture', category: 'General', custom: '',
    theme: 'Any', density: 'Auto (match the level)', imageStyle: 'Any',
    imageProvider: '', textProvider: 'gemini', voice: '', tooltips: true,
    // New content-defining settings: the subject domain, which slide tool types to
    // use, a chosen slide template (ordered components), and a free prompt.
    domain: 'General', toolTypes: ['text', 'mcq'], template: '', prompt: '',
  });
  // Consume a study-path "slide seed" once: a repo's 🎬 prompt card prefills the
  // create form (topic + the prompt as free instructions) so the moderator/learner
  // just sets level & tone, then clicks Generate. We do NOT auto-generate.
  const seedDone = useRef(false);
  useEffect(() => {
    if (seedDone.current) return;
    const seed = appState.slideSeed;
    if (!seed) return;
    seedDone.current = true; appState.slideSeed = null;
    const topic = String(seed.topic || '').trim();
    const customInstructions = String(seed.customInstructions || '').trim();
    if (!topic && !seed.slides && !customInstructions) return;
    setForm((s) => ({
      ...s,
      ...(topic ? { topic } : {}),
      ...(seed.slides ? { slides: seed.slides } : {}),
      ...(customInstructions || topic ? { prompt: [topic, customInstructions].filter(Boolean).join('\n\n'), custom: [topic, customInstructions].filter(Boolean).join('\n\n') } : {}),
    }));
    setWizardStep(0);
  }, []);
  const cardSize = useCardSize('presrun');
  const imgMode = useImgSize('presrun');
  const layout = galleryLayout(cardSize);
  const setupCardSize = useCardSize('slides');
  const setupImgMode = useImgSize('slides');

  useEffect(() => { setFavs(loadLikes()); }, [app.user?.username]);
  useEffect(() => {
    try { setEntryFavs(JSON.parse(localStorage.getItem('sl_entry_favs') || '{}')); } catch { setEntryFavs({}); }
  }, []);
  useEffect(() => {
    let alive = true;
    API.get('/api/tools/entries/summary?archetype=lesson&singleSource=1&limit=200').then((r: any) => {
      if (!alive) return;
      const rows = Array.isArray(r?.summaries) ? r.summaries : [];
      const map: Record<string, any> = {};
      for (const x of rows) {
        const slug = String(x?.slug || '');
        if (slug) map[slug] = x;
      }
      setToolMeta(map);
    }).catch(() => {
      if (!alive) return;
      setToolMeta({});
    });
    return () => { alive = false; };
  }, [app.user?.username]);

  useEffect(() => {
    let alive = true;
    API.get('/api/tools/runs?singleSource=1&limit=500').then((r: any) => {
      if (!alive) return;
      setAllRuns(Array.isArray(r?.runs) ? r.runs : []);
    }).catch(() => { if (alive) setAllRuns([]); });
    return () => { alive = false; };
  }, [app.user?.username]);

  useEffect(() => {
    let alive = true;
    API.get('/api/tools?archetype=lesson&includeFeatured=0&limit=200').then((r: any) => {
      if (!alive) return;
      // Always populate from available lesson tools (no featured examples here).
      const all = Array.isArray(r?.tools) ? r.tools : [];
      if (all.length) { setTools(all); return; }
      // Fallback for fresh accounts: include built-in playable lesson examples.
      API.get('/api/tools?archetype=lesson&limit=200').then((r2: any) => {
        if (!alive) return;
        const fallback = Array.isArray(r2?.tools) ? r2.tools : [];
        setTools(fallback);
      }).catch(() => { if (alive) setTools([]); });
    }).catch(() => {
      // If strict list fails for any reason, still try the broader list.
      API.get('/api/tools?archetype=lesson&limit=200').then((r2: any) => {
        if (!alive) return;
        const fallback = Array.isArray(r2?.tools) ? r2.tools : [];
        setTools(fallback);
      }).catch(() => { if (alive) setTools([]); });
    });
    return () => { alive = false; };
  }, []);

  const toggleFav = (t: any) => {
    setFavs((prev) => {
      const next = { ...prev }; const now = !next[t.slug];
      if (now) next[t.slug] = true; else delete next[t.slug];
      saveLikes(next); API.post('/api/tools/like', { slug: t.slug, liked: now }).catch(() => { /* ignore */ });
      return next;
    });
  };

  const toggleEntryFav = (id: string) => {
    setEntryFavs((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      try { localStorage.setItem('sl_entry_favs', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tools.filter((t) => {
      if (titleFilterSlug && t.slug !== titleFilterSlug) return false;
      if (filter === 'fav' && !favs[t.slug]) return false;
      if (term) {
        const hay = `${t.title || ''} ${t.description || ''} ${(t.tags || []).join(' ')} ${t.owner || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [tools, filter, favs, q, titleFilterSlug]);

  const titleOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...tools]
      .filter((t) => {
        const slug = String(t?.slug || '');
        if (!slug || seen.has(slug)) return false;
        seen.add(slug);
        return true;
      })
      .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || '')))
      .map((t) => ({ slug: String(t.slug || ''), title: String(t.title || 'Untitled slide') }));
  }, [tools]);

  useEffect(() => {
    if (titleFilterSlug && !tools.some((t: any) => t.slug === titleFilterSlug)) {
      setTitleFilterSlug('');
    }
  }, [tools, titleFilterSlug]);

  useEffect(() => {
    setFilter(titleFilterSlug ? 'fav' : 'all');
  }, [titleFilterSlug]);

  const selectedTool = useMemo(() => tools.find((t: any) => t.slug === titleFilterSlug) || null, [tools, titleFilterSlug]);

  useEffect(() => {
    if (!titleFilterSlug) { setToolRuns([]); setRunsBusy(false); setRunsErr(''); return; }
    setRunsBusy(false);
    setRunsErr('');
    setToolRuns(allRuns.filter((r: any) => String(r?.toolSlug || '') === titleFilterSlug));
  }, [allRuns, titleFilterSlug]);

  const galleryRuns = useMemo(() => {
    const base = titleFilterSlug ? toolRuns : allRuns;
    const term = q.trim().toLowerCase();
    return base.filter((e: any) => {
      if (filter === 'fav' && !entryFavs[e.id]) return false;
      if (term) {
        const hay = `${e?.title || ''} ${e?.toolTitle || ''} ${e?.username || ''} ${e?.topic || ''} ${e?.level || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [titleFilterSlug, toolRuns, allRuns, q, filter, entryFavs]);

  const galleryPages = Math.max(1, Math.ceil(galleryRuns.length / PER_PAGE));
  const shownRuns = useMemo(() => galleryRuns.slice((page - 1) * PER_PAGE, page * PER_PAGE), [galleryRuns, page]);
  const sortedForTable = useMemo(() => {
    const dir = tableSortDir === 'asc' ? 1 : -1;
    const asText = (v: any) => String(v || '').toLowerCase();
    const slideTotal = (t: any) => Number(t?.slides || 0) || 0;
    const topicOf = (t: any) => String(t?.topic || '').trim();
    const sorted = [...galleryRuns].sort((a, b) => {
      let cmp = 0;
      if (tableSortBy === 'slides') {
        cmp = slideTotal(a) - slideTotal(b);
      } else if (tableSortBy === 'topic') {
        cmp = asText(topicOf(a)).localeCompare(asText(topicOf(b)));
      } else if (tableSortBy === 'owner') {
        cmp = asText(a?.toolOwner).localeCompare(asText(b?.toolOwner));
      } else {
        cmp = asText(a?.title || a?.toolTitle).localeCompare(asText(b?.title || b?.toolTitle));
      }
      if (cmp === 0) cmp = asText(a?.title || a?.toolTitle).localeCompare(asText(b?.title || b?.toolTitle));
      return cmp * dir;
    });
    return sorted;
  }, [galleryRuns, tableSortBy, tableSortDir]);

  const fmtDate = (v: any) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const supportTokens = (support: any) => {
    const out: string[] = [];
    if (support?.images) out.push('img');
    if (support?.tables) out.push('table');
    if (support?.formulas) out.push('formula');
    if (support?.code) out.push('code');
    if (support?.audio) out.push('audio');
    if (support?.geogebra) out.push('graph');
    return out;
  };

  const activityToken = (kind: string) => {
    const k = String(kind || '').trim().toLowerCase();
    if (k === 'mcq') return 'mcq4';
    if (k === 'fill-blank') return 'fill-blank';
    if (k === 'input') return 'write-answer';
    if (k === 'writing') return 'handwriting';
    if (k === 'annotation') return 'annotation';
    if (k === 'code') return 'code-box';
    return k || 'mcq4';
  };

  const aiComboHint = (tool: any, meta: any = {}) => {
    const hint = String(meta?.aiSlideComboHint || '').trim();
    if (hint) return hint;
    const lesson = tool?.definition?.lesson || {};
    const pages = Array.isArray(lesson?.pages) ? lesson.pages : [];
    const lessonSupport = lesson?.support || {};
    const lessonActivities = Array.isArray(lesson?.activityTypes) ? lesson.activityTypes : [];
    const slots = pages.length ? pages.slice(0, 12) : [{}];
    return slots.map((p: any, i: number) => {
      const readingOn = p?.reading !== false;
      const paraCount = Math.max(1, Math.min(4, parseInt(p?.paragraphsPerSlide, 10) || parseInt(lesson?.paragraphsPerSlide, 10) || 1));
      const seq: string[] = [];
      if (readingOn) {
        for (let j = 0; j < paraCount; j += 1) seq.push('text');
      }
      seq.push(...supportTokens({ ...lessonSupport, ...(p?.support || {}) }));
      const acts = (Array.isArray(p?.activityTypes) && p.activityTypes.length ? p.activityTypes : lessonActivities)
        .map(activityToken)
        .filter(Boolean);
      const evalPart = acts.length ? `[${acts.join(' | ')}]` : '[mcq4 | fill-blank | write-answer]';
      return `${i + 1}: ${[...seq, evalPart].join(', ')}`;
    }).join(' ; ');
  };

  const tableRows: Cell[][] = useMemo(() => sortedForTable.map((t, idx) => {
    const meta = toolMeta[String(t?.toolSlug || '')] || {};
    const slideCount = Number(t?.slides || 0) || '—';
    const level = String(t?.level || '').trim() || 'Auto';
    const topic = String(t?.topic || '').trim() || '—';
    const sourcePath = `/?view=tool&tool=${encodeURIComponent(String(t?.toolSlug || ''))}`;
    const sourceLabel = `${String(t?.toolOwner || 'unknown')}/${String(t?.toolSlug || 'untitled')}`;
    const createdAt = fmtDate(t?.createdAt || meta?.createdAt);
    const lastAccessedAt = fmtDate(t?.updatedAt || t?.createdAt || meta?.lastAccessedAt || meta?.updatedAt);
    const lastAccessedBy = String(t?.username || meta?.lastAccessedBy || '').trim() || '—';
    const srcTool = tools.find((x: any) => String(x?.slug || '') === String(t?.toolSlug || '')) || { slug: t?.toolSlug || '' };
    return [
      idx + 1,
      String(t?.title || t?.topic || t?.toolTitle || 'Saved run').trim() || 'Saved run',
      topic,
      t?.toolOwner || '—',
      slideCount,
      level,
      createdAt,
      lastAccessedAt,
      lastAccessedBy,
      { node: <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span title={sourcePath} style={{ fontSize: 11, opacity: 0.8 }}>{sourceLabel}</span>
        <a className="btn small ghost" title="Open source slide tool" href={sourcePath} style={{ padding: '0 8px', textDecoration: 'none' }}>🔗</a>
      </span> },
      { node: <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <button className="btn small ghost" title="Owner history" onClick={() => openTool(srcTool, 'results')} style={{ padding: '0 8px' }}>📖</button>
        <button className="btn small ghost" title="Play" onClick={() => openTool(srcTool, 'replay', t?.data || {})} style={{ padding: '0 8px' }}>▶️</button>
      </span> },
    ];
  }), [sortedForTable, toolMeta, tools]);

  const slideToolsRows: Cell[][] = useMemo(() => titleOptions.map((o, idx) => {
    const t = tools.find((x: any) => String(x?.slug || '') === o.slug) || {};
    const meta = toolMeta[o.slug] || {};
    const topic = String(meta?.topic || t?.definition?.lesson?.subject || t?.definition?.lesson?.topic || '').trim() || '—';
    const slides = Number(meta?.slideCount || t?.definition?.lesson?.totalSlides || t?.definition?.lesson?.pages?.length || 0) || '—';
    const comboHint = aiComboHint(t, meta);
    const createdAt = fmtDate(meta?.createdAt || t?.createdAt);
    const lastAccessedAt = fmtDate(meta?.lastAccessedAt || meta?.updatedAt || t?.updatedAt || t?.createdAt);
    const lastAccessedBy = String(meta?.lastAccessedBy || '').trim() || '—';
    const sourcePath = `/?view=tool&tool=${encodeURIComponent(String(o.slug || ''))}`;
    return [
      idx + 1,
      o.title,
      topic,
      slides,
      comboHint,
      createdAt,
      lastAccessedAt,
      lastAccessedBy,
      { node: <a className="btn small ghost" href={sourcePath} style={{ padding: '0 8px', textDecoration: 'none' }} title="Open slide tool">🔗</a> },
    ];
  }), [titleOptions, toolMeta, tools]);
  useEffect(() => { setPage(1); }, [filter, q, titleFilterSlug]);
  useEffect(() => { if (page > galleryPages) setPage(galleryPages); }, [page, galleryPages]);

  // The recommended pick for the empty-state skeleton.
  const rec = useMemo(() => tools.find((t: any) => (t.tags || []).includes('example')) || tools[0] || null, [tools]);

  const openTool = async (t: any, intent?: 'results' | 'generate' | 'replay', config?: Record<string, any>) => {
    if (openingSlug) return;
    setOpeningSlug(t?.slug || '');
    try { const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(t.slug)}`); appState.activeTool = r?.tool || t; }
    catch { appState.activeTool = t; }
    if (intent) appState.openIntent = (intent === 'replay' ? { action: intent, config: config || {} } : { action: intent }) as any;
    app.nav('tool');
    setOpeningSlug(null);
  };

  const runRows: Cell[][] = useMemo(() => {
    if (!selectedTool) return [];
    return toolRuns.map((e: any, idx: number) => {
      const d = e?.data || {};
      const created = e?.createdAt ? new Date(e.createdAt).toLocaleString() : '—';
      const accessed = e?.updatedAt ? new Date(e.updatedAt).toLocaleString() : created;
      const topic = String(e?.topic || d?.topic || selectedTool?.definition?.lesson?.subject || '').trim() || '—';
      const slides = Number(e?.slides || d?.slides || selectedTool?.definition?.lesson?.totalSlides || selectedTool?.definition?.lesson?.pages?.length || 0) || '—';
      const level = String(e?.level || d?.level || d?.difficulty || selectedTool?.definition?.lesson?.level || '').trim() || 'Auto';
      return [
        idx + 1,
        String(e?.id || '—'),
        topic,
        slides,
        level,
        created,
        accessed,
        { node: <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <button className="btn small ghost" title="Owner history" onClick={() => openTool(selectedTool, 'results')} style={{ padding: '0 8px' }}>📖</button>
          <button className="btn small ghost" title="Replay this saved run" onClick={() => openTool(selectedTool, 'replay', d)} style={{ padding: '0 8px' }}>▶️</button>
        </span> },
      ];
    });
  }, [toolRuns, selectedTool]);

  const pageTitle = selectedTool ? `🎬 ${selectedTool.title || 'Presentation runs'}` : '🎬 Presentation runs';
  const pageSubtitle = selectedTool
    ? (String(selectedTool.description || '').trim() || 'Playable runs, favorites, and saved cards created with this slide tool.')
    : 'Set up a new presentation, or open one of the slide tools.';
  const owner = String(selectedTool?.owner || 'sketchlearn');
  const av = avatarFor(owner);
  const shareUrl = selectedTool ? `/?view=tool&tool=${encodeURIComponent(String(selectedTool.slug || ''))}` : '/?view=presrun';
  const bannerSubtitle = selectedTool ? `${selectedTool.title || 'Slide tool'} · saved run gallery` : 'Presentation runs · public gallery';
  const createLabel = selectedTool ? `Create a ${selectedTool.title || 'slide'} activity` : 'Create a presentation activity';
  // The create-card title stays on ONE line (a long title truncates); the owner can
  // rename the slide tool inline via a black-and-white pencil at the end of the row.
  const isToolOwner = !!app.user && !!selectedTool && (String(selectedTool.owner || '') === app.user.username || app.user.role === 'admin');
  const saveTitle = async () => {
    const t = titleDraft.trim().slice(0, 70);
    setEditingTitle(false);
    if (!selectedTool || !t || t === selectedTool.title) return;
    const def = { ...(selectedTool.definition || {}), title: t };
    setTools((cur) => cur.map((x) => (x.slug === selectedTool.slug ? { ...x, title: t, definition: def } : x)));   // optimistic
    try { await API.put('/api/tools/settings', { slug: selectedTool.slug, definition: def }); } catch { /* keep optimistic */ }
  };
  const createTitleNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
      {editingTitle && selectedTool ? (
        <input value={titleDraft} autoFocus onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }} onBlur={saveTitle}
          maxLength={70} style={{ fontSize: 15, fontWeight: 700, padding: '2px 6px', border: '1.5px solid var(--ink,#2d2a26)', borderRadius: 6, minWidth: 0, width: 230 }} />
      ) : (
        <span title={createLabel} style={{ display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320, verticalAlign: 'bottom' }}>{createLabel}</span>
      )}
      {isToolOwner && !editingTitle && (
        <button type="button" title="Rename this slide tool" aria-label="Rename this slide tool"
          onClick={() => { setTitleDraft(String(selectedTool!.title || '')); setEditingTitle(true); }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, padding: 0, borderRadius: 5, cursor: 'pointer', border: '1.5px solid var(--ink,#2d2a26)', background: 'transparent', color: 'var(--ink,#2d2a26)', flex: '0 0 auto' }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
      )}
    </span>
  );
  const setupWidth = setupCardSize <= 0 ? 360 : setupCardSize === 1 ? 340 : setupCardSize === 2 ? 392 : setupCardSize === 3 ? 430 : setupCardSize === 4 ? 500 : 560;
  const setupImageProps: any = cardImageProps(setupImgMode);
  const setupGridHeight = typeof setupImageProps.gridHeight === 'number' ? setupImageProps.gridHeight + 110 : 430;

  const formFields: ToolField[] = [
    { id: 'title', label: '📝 Title', type: 'text', placeholder: 'Filter by slide tool title (optional)' },
    { id: 'topic', label: '🌱 Topic (optional)', type: 'text', placeholder: 'e.g. greetings, food' },
    { id: 'level', label: '🎚️ Level', type: 'select-or-custom', options: LEVELS as any },
    { id: 'difficulty', label: '📚 Difficulty', type: 'select-or-custom', options: LEVELS as any },
    { id: 'slides', label: '📄 Slides', type: 'number' },
    { id: 'tone', label: '🎵 Tone', type: 'select-or-custom', options: TONES as any },
    { id: 'category', label: '🗂️ Category', type: 'select-or-custom', options: ['General', 'Science', 'Math', 'Language'] as any },
    { id: 'custom', label: '✍️ Custom', type: 'text', placeholder: 'Any specific guidance…' },
  ];
  const fieldShell: React.CSSProperties = { width: 240, margin: 0 };
  const controlStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: '1.05rem', lineHeight: 1.2 };
  const navSizeStyle: React.CSSProperties = { width: 96, height: 40, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const stepFields = (ids: string[]) => {
    const fs = formFields.filter((f) => ids.includes(String(f.id)));
    return fs.length
      ? <div style={{ width: 240 }}><ToolFields fields={fs} values={form} onChange={(id, v) => setForm((s) => ({ ...s, [id]: v }))} single /></div>
      : <p style={{ fontSize: 13, opacity: 0.7 }}>Nothing to set here — press Next.</p>;
  };
  const titleFilterField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>📝 Title</span>
      <select style={controlStyle} value={titleFilterSlug} onChange={(e) => setTitleFilterSlug(e.target.value)}>
        <option value="">All slide tools</option>
        {titleOptions.map((t) => <option key={t.slug} value={t.slug}>{t.title}</option>)}
      </select>
    </label>
  );
  const themeField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>🎭 Theme</span>
      <select style={controlStyle} value={String((form as any).theme || 'Any')} onChange={(e) => setForm((s) => ({ ...s, theme: e.target.value }))}>
        {['Any', 'Vacations', 'Sports', 'Business', 'Food', 'Travel', 'Culture'].map((th) => <option key={th} value={th}>{th === 'Any' ? 'Any (AI picks)' : th}</option>)}
      </select>
    </label>
  );
  const densityField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>📏 Text density</span>
      <select style={controlStyle} value={String((form as any).density || 'Auto (match the level)')} onChange={(e) => setForm((s) => ({ ...s, density: e.target.value }))}>
        {['Auto (match the level)', 'Light', 'Medium', 'Dense'].map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </label>
  );
  const imageStyleField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>🖼 Image style</span>
      <select style={controlStyle} value={String((form as any).imageStyle || 'Any')} onChange={(e) => setForm((s) => ({ ...s, imageStyle: e.target.value }))}>
        {['Any', 'Illustration', 'Photo', 'Watercolor', 'Sketch', 'Minimal'].map((st) => <option key={st} value={st}>{st === 'Any' ? 'Any (AI picks)' : st}</option>)}
      </select>
    </label>
  );
  const imageApiField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>🔌 Image API</span>
      <select style={controlStyle} value={String((form as any).imageProvider || '')} onChange={(e) => setForm((s) => ({ ...s, imageProvider: e.target.value }))}>
        <option value="">Auto (best available)</option>
        <option value="pollinations">Pollinations</option>
        <option value="openai">OpenAI</option>
      </select>
    </label>
  );
  const textApiField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>🔤 Text API</span>
      <select style={controlStyle} value={String((form as any).textProvider || 'gemini')} onChange={(e) => setForm((s) => ({ ...s, textProvider: e.target.value }))}>
        <option value="gemini">Gemini (default)</option>
        <option value="">Auto (best available)</option>
        <option value="openrouter">OpenRouter</option>
      </select>
    </label>
  );
  const voiceField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>🎙 Voice</span>
      <select style={controlStyle} value={String((form as any).voice || '')} onChange={(e) => setForm((s) => ({ ...s, voice: e.target.value }))}>
        <option value="">Default voice</option>
        <option value="alloy">Alloy</option>
        <option value="verse">Verse</option>
      </select>
    </label>
  );
  const tooltipsField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>💡 Tooltips</span>
      <button type="button" className={`btn ${(form as any).tooltips === false ? 'ghost' : 'blue'}`} style={{ ...controlStyle, justifyContent: 'flex-start', textAlign: 'left', boxShadow: 'none' }}
        onClick={() => setForm((s) => ({ ...s, tooltips: (s as any).tooltips === false }))}>
        💡 Tooltips: {(form as any).tooltips === false ? 'Off' : 'On'}
      </button>
    </label>
  );
  // ── New content-defining settings ──────────────────────────────────────
  const DOMAINS = ['General', 'Programming', 'Mathematics', 'Science', 'Arts', 'Writing', 'Language', 'History', 'Business', 'Music', 'Health'];
  const TOOL_TYPES: { id: string; label: string }[] = [
    { id: 'text', label: '📝 Text' },
    { id: 'mcq', label: '☑️ Multiple choice' },
    { id: 'input', label: '⌨️ Input answer' },
    { id: 'code', label: '💻 Code snippet' },
    { id: 'math', label: '➗ Math / LaTeX' },
    { id: 'wolfram', label: '🧮 WolframAlpha' },
    { id: 'geogebra', label: '📐 GeoGebra' },
    { id: 'image', label: '🖼 Image' },
    { id: 'chart', label: '📊 Chart' },
  ];
  const TEMPLATES: { id: string; label: string; seq: string[] }[] = [
    { id: 'read-look-check', label: 'Read → Look → Check', seq: ['📝 Text', '🖼 Image', '☑️ Multiple choice'] },
    { id: 'explain-recap-quiz', label: 'Explain → Illustrate → Recap → Quiz', seq: ['📝 Text', '📝 Text', '🖼 Image', '📝 Text', '☑️ Multiple choice'] },
    { id: 'concept-formula-solve', label: 'Concept → Formula → Compute → Solve', seq: ['📝 Text', '➗ Math', '🧮 WolframAlpha', '📝 Text', '⌨️ Input answer'] },
    { id: 'demo-graph-practice', label: 'Demo → Graph → Practice', seq: ['📝 Text', '📐 GeoGebra', '☑️ Multiple choice'] },
    { id: 'code-run-quiz', label: 'Code → Explain → Quiz', seq: ['💻 Code snippet', '📝 Text', '☑️ Multiple choice'] },
  ];
  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    padding: '4px 10px', borderRadius: 999, border: '2px solid var(--ink,#2d2a26)',
    background: active ? 'var(--green,#7fb069)' : 'transparent', color: active ? '#fff' : 'var(--ink,#2d2a26)',
  });
  const domainField = (
    <label className="field" style={fieldShell}><span style={{ display: 'block', marginBottom: 4 }}>🧭 Subject domain</span>
      <select style={controlStyle} value={String((form as any).domain || 'General')} onChange={(e) => setForm((s) => ({ ...s, domain: e.target.value }))}>
        {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </label>
  );
  const toolTypesField = (
    <div style={{ width: '100%' }}>
      <span style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>🧰 Tool types the slides may use</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start', maxHeight: 150, overflowY: 'auto' }}>
        {TOOL_TYPES.map((t) => {
          const on = Array.isArray((form as any).toolTypes) && (form as any).toolTypes.includes(t.id);
          return <button key={t.id} type="button" style={chip(on)}
            onClick={() => setForm((s) => { const cur: string[] = Array.isArray((s as any).toolTypes) ? (s as any).toolTypes : []; return { ...s, toolTypes: on ? cur.filter((x) => x !== t.id) : [...cur, t.id] }; })}>{t.label}</button>;
        })}
      </div>
    </div>
  );
  const templatesField = (
    <div style={{ width: '100%' }}>
      <span style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>🧩 Slide template (component order)</span>
      <div style={{ display: 'grid', gap: 6, maxHeight: 150, overflowY: 'auto', paddingRight: 4 }}>
        {TEMPLATES.map((t) => {
          const on = (form as any).template === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setForm((s) => ({ ...s, template: on ? '' : t.id }))}
              style={{ textAlign: 'left', cursor: 'pointer', padding: '7px 10px', borderRadius: 10, border: `2px solid ${on ? 'var(--green,#7fb069)' : 'var(--ink,#2d2a26)'}`, background: on ? 'rgba(127,176,105,0.14)' : 'transparent' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{t.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                {t.seq.map((c, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, border: '1.5px solid var(--ink,#2d2a26)', borderRadius: 6, padding: '1px 6px' }}>{c}</span>
                    {i < t.seq.length - 1 && <span style={{ opacity: 0.5 }}>→</span>}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
  const promptField = (
    <label className="field" style={{ width: '100%', margin: 0 }}><span style={{ display: 'block', marginBottom: 4 }}>💬 Prompt (what to build)</span>
      <textarea value={String((form as any).prompt || '')} onChange={(e) => setForm((s) => ({ ...s, prompt: e.target.value }))}
        placeholder="Describe exactly what the AI should build — the goal, the angle, constraints, examples, anything specific…"
        style={{ width: '100%', minHeight: 150, boxSizing: 'border-box', padding: '10px 14px', fontSize: '1rem', lineHeight: 1.35, resize: 'vertical' }} />
    </label>
  );
  // Step navigation clamped to the full step list (kept in sync with `steps` below).
  const STEP_MAX = 11;
  const goNext = () => setWizardStep((s) => Math.min(STEP_MAX, s + 1));
  const goBack = () => setWizardStep((s) => Math.max(0, s - 1));
  const finalActions = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', width: 96, minWidth: 96 }}>
      <button className="btn small green" style={navSizeStyle} onClick={() => { setSettingsOpen(true); setWizardKey((k) => k + 1); }}>✨ Generate</button>
    </div>
  );
  const steps: WizardStep[] = [
    { key: 'basics', title: 'Name & topic', render: () => <WizardGridTemplate top={titleFilterField} bottom={stepFields(['topic'])} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'domain', title: 'Subject domain', render: () => <WizardGridTemplate top={domainField} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'levels', title: 'Level pair', render: () => <WizardGridTemplate top={stepFields(['level'])} bottom={stepFields(['difficulty'])} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'slides-tone', title: 'Slides & tone', render: () => <WizardGridTemplate top={stepFields(['slides'])} bottom={stepFields(['tone'])} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'tool-types', title: 'Tool types', render: () => <WizardGridTemplate tall top={toolTypesField} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'templates', title: 'Slide template', render: () => <WizardGridTemplate tall top={templatesField} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'cat-custom', title: 'Category & custom', render: () => <WizardGridTemplate top={stepFields(['category'])} bottom={stepFields(['custom'])} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'theme-density', title: 'Theme & density', render: () => <WizardGridTemplate top={themeField} bottom={densityField} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'image-pair', title: 'Image style & API', render: () => <WizardGridTemplate top={imageStyleField} bottom={imageApiField} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'text-voice', title: 'Text API & voice', render: () => <WizardGridTemplate top={textApiField} bottom={voiceField} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'prompt', title: 'Prompt', render: () => <WizardGridTemplate tall top={promptField} onNext={goNext} onBack={goBack} backDisabled={wizardStep === 0} /> },
    { key: 'tooltips', title: 'Tooltips', render: () => <WizardGridTemplate top={tooltipsField} onBack={goBack} backDisabled={wizardStep === 0} rightTop={finalActions} /> },
  ];

  const runCard = (e: any) => {
    const sourceTool = tools.find((t: any) => String(t?.slug || '') === String(e?.toolSlug || titleFilterSlug || '')) || selectedTool;
    if (!sourceTool) return null;
    const d = e?.data || {};
    const title = String(e?.title || d?.title || e?.topic || sourceTool.title || 'Saved run').trim() || 'Saved run';
    const subtitle = [e?.topic || d?.topic, e?.level || d?.level || d?.difficulty, e?.username ? `@${e.username}` : '', e?.createdAt ? new Date(e.createdAt).toLocaleDateString() : ''].filter(Boolean).join(' · ');
    const thumb = String(e?.thumbnail || d?.thumbnail || '').trim() || sourceTool.thumbnail || null;
    const fav = !!entryFavs[e.id];
    const tinyIcon: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 2, margin: 0, fontSize: 15, lineHeight: 1, opacity: 0.75 };
    return (
      <CardShell
        key={e.id}
        view={layout.view}
        title={title}
        subtitle={subtitle || 'Saved playable slide'}
        badge="RUN"
        fav={fav}
        thumbnail={thumb}
        {...cardImageProps(imgMode)}
        onOpen={() => openTool(sourceTool, 'replay', d)}
        meta={<span style={{ fontSize: 11, opacity: 0.7 }}>{e?.updatedAt ? `Last accessed ${new Date(e.updatedAt).toLocaleString()}` : (e?.createdAt ? `Created ${new Date(e.createdAt).toLocaleString()}` : 'Saved run')}</span>}
        actions={<>
          <button style={tinyIcon} title={fav ? 'Unfavorite' : 'Favorite'} onClick={() => toggleEntryFav(e.id)}>{fav ? '★' : '☆'}</button>
          <button style={tinyIcon} title="Owner history" onClick={() => openTool(sourceTool, 'results')}>📖</button>
          <button style={tinyIcon} title="Play this saved run" onClick={() => openTool(sourceTool, 'replay', d)}>▶️</button>
        </>}
      />
    );
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <PageHeaderBar pageKey="presrun" title={pageTitle} subtitle={pageSubtitle} />
        {/* Create-a-slide-activity chat composer directly below the title (public
            gallery only — a specific tool's page has its own create card), closed
            off by a dotted line, matching the Slides/Repos galleries. */}
        {!selectedTool && (<>
          <RepoChatComposer variant="presentation" />
          <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '14px 0' }} />
        </>)}
        <StorageModeBadge />

        {/* The owner banner + share/QR and the create card belong to a SPECIFIC
            tool's run gallery only. The top-level "Presentation runs" page is the
            public gallery of every user's playable slides — no single owner made
            it and there's nothing to create here — so both are hidden there. */}
        {selectedTool && (
          <>
            <div style={{ maxWidth: 820, margin: '0 auto 10px' }}>
              <div className="card author-bar" style={{ padding: '12px 16px' }}>
                <div className="author-bar__id">
                  <span aria-hidden style={{ display: 'inline-flex', flex: '0 0 auto', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: av.color, border: '2px solid var(--ink)', fontSize: 20 }}>{av.emoji}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>@{owner}</div>
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{bannerSubtitle}</div>
                  </div>
                </div>
                <div className="author-bar__actions">
                  <SharePanel shareUrl={shareUrl} title={selectedTool?.title || 'Presentation runs'} label="🔗 Share / QR" />
                </div>
              </div>
              <div style={{ borderTop: '2px dotted var(--line,#d9cfc0)', margin: '10px 0 0' }} />
            </div>

            {/* The create card spans the full page width. */}
            <div style={{ maxWidth: 820, margin: '14px auto 12px', width: '100%' }}>
              <div style={{ width: '100%', boxSizing: 'border-box' }}>
                <SetupWizardCard
                  title={createTitleNode}
                  headerRight={<button onClick={() => setSettingsOpen(true)} title="Open full builder settings" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>⚙️</button>}
                  steps={steps}
                  resetKey={wizardKey}
                  stepIndex={wizardStep}
                  onStepChange={setWizardStep}
                />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '12px 0 14px' }} />
          </>
        )}

        {/* All/Favorites filter + card-size/image menus. The ⚙️ gear opens the
            full "Make a slide presentation" form as a popup. */}
        <GalleryFilterRow q={q} onQ={setQ} filter={filter} onFilter={setFilter} right={<>
          <button className="btn small ghost" title="Make a slide presentation" aria-label="Make a slide presentation"
            onClick={() => setSettingsOpen(true)} style={{ fontSize: 16, padding: '0 9px' }}>⚙️</button>
          <CardViewMenu pageKey="presrun" />
        </>} />

        {galleryRuns.length === 0 ? (
          selectedTool ? (
            <div className="card alt" style={{ padding: '16px 18px', textAlign: 'center' }}>
              {filter === 'fav' ? 'No favorite saved run cards were found for this tool yet.' : 'No saved run cards were found for this tool yet.'}
            </div>
          ) : (
            <GallerySkeleton cardSize={cardSize} imgMode={imgMode} recommended={rec} onBuild={() => setSettingsOpen(true)} onOpen={openTool} />
          )
        ) : (
          <>
            <div style={{ ...layout.container, alignItems: 'stretch' }}>
              {shownRuns.map((e) => runCard(e))}
            </div>
            {galleryPages > 1 && <GalleryPager page={page} pages={galleryPages} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(galleryPages, p + 1))} />}
          </>
        )}

        {/* The data tables at the foot of the page are an admin-only view. */}
        {app.eff().isAdmin && (<>
        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '18px 0 12px' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', margin: '0 0 10px' }}>
          <h3 style={{ margin: 0 }}>🎮 Playable slides</h3>
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <span style={{ opacity: 0.75 }}>Title</span>
              <select value={titleFilterSlug} onChange={(e) => setTitleFilterSlug(e.target.value)} style={{ minWidth: 220 }}>
                <option value="">All slide tools</option>
                {titleOptions.map((t) => <option key={t.slug} value={t.slug}>{t.title}</option>)}
              </select>
            </label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <span style={{ opacity: 0.75 }}>Sort by</span>
              <select value={tableSortBy} onChange={(e) => setTableSortBy(e.target.value as any)} style={{ minWidth: 128 }}>
                <option value="title">Slide title</option>
                <option value="topic">Topic</option>
                <option value="owner">Owner</option>
                <option value="slides">Slide count</option>
              </select>
            </label>
            <button className="btn small ghost" onClick={() => setTableSortDir((d) => d === 'asc' ? 'desc' : 'asc')} title="Toggle ascending/descending order">
              {tableSortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </div>
        <PagedTable
          headers={['#', 'Slide', 'Topic', 'Owner', 'Slides', 'Level', 'Created', 'Last accessed', 'User accessed', 'Source', 'Play']}
          rows={tableRows}
          empty="No playable slides match these filters."
          rowsPerPage={6}
          tight
        />

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '18px 0 12px' }} />
        <h3 style={{ margin: '0 0 10px' }}>🛠 Slide tools</h3>
        <PagedTable
          headers={['#', 'Slide tool', 'Topic', 'Slides', 'AI slide combo hint', 'Created', 'Last accessed', 'User accessed', 'Open']}
          rows={slideToolsRows}
          empty="No slide tools are available."
          rowsPerPage={6}
          tight
        />

        {titleFilterSlug && (
          <>
            <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '18px 0 12px' }} />
            <h3 style={{ margin: '0 0 10px' }}>🧬 Sub slide generations {selectedTool ? `for ${selectedTool.title || selectedTool.slug}` : ''}</h3>
            <PagedTable
              headers={['#', 'Run', 'Topic', 'Slides', 'Level', 'Created', 'Last accessed', 'Play']}
              rows={runRows}
              empty="No sub generations were found for this title yet."
              rowsPerPage={6}
              tight
            />
          </>
        )}
        </>)}
      </div>

      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <SlideSettings onClose={() => setSettingsOpen(false)} />
        </div>
      )}

      {openingSlug && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.38)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ maxWidth: 340, width: '100%', padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>⏳</div>
            <div style={{ fontWeight: 700 }}>Loading presentation…</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Opening the selected run page.</div>
          </div>
        </div>
      )}
    </div>
  );
}
