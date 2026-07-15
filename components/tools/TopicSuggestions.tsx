'use client';
/* "Learn any of these topics" — on a repository page, a sliding shelf of 10
 * AI-recommended TOPICS drawn from the repo's own subjects. Each card shows a
 * topic-related emoji (in the image spot, with the same ✎/🎨 edit chrome as a
 * real image) + a one-line blurb. A dropdown next to "Recommend 10" focuses the
 * picks on ONE unit of the repo. Clicking a card opens the presentation builder
 * seeded with that topic, where the AI proposes a layout the user can edit or
 * generate as-is. */
import { useCallback, useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { Carousel } from '@/components/ui/Carousel';
import { CardShell, overlayIcon } from '@/components/ui/CardShell';

type Topic = { topic: string; emoji: string; blurb: string; image?: string };

// A friendly pool for the local ✎/🎨 emoji controls (no persistence — these are
// ephemeral preset cards).
const EMOJI_POOL = ['📘', '🧠', '🔬', '📐', '🧪', '🌍', '🎨', '🎵', '💡', '⚙️', '📊', '🧭', '🚀', '🌱', '🔎', '📝', '🎯', '🏛️', '⚗️', '🧮', '🌡️', '🔭', '📚', '✏️'];
const randEmoji = (not?: string) => { let e = not; for (let i = 0; i < 8 && (!e || e === not); i++) e = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]; return e || '💡'; };

// Module-level cache so re-entering a repo (SPA navigation) reuses the last
// AI-generated topic picks instead of paying for a fresh run every time. Keyed by
// slug|unit for topics, slug for the units list. Cleared/replaced only when the
// user asks for a fresh set (Refresh / Recommend 10).
const topicCache = new Map<string, Topic[]>();
const unitsCache = new Map<string, string[]>();

export function TopicSuggestions({ repoSlug, repoTitle }: { repoSlug: string; repoTitle?: string }) {
  const app = useApp();
  const [topics, setTopics] = useState<Topic[]>(() => topicCache.get(`${repoSlug}|`) || []);
  const [units, setUnits] = useState<string[]>(() => unitsCache.get(repoSlug) || []);
  const [unit, setUnit] = useState('');            // '' = whole repository
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState<number | null>(null);  // index of the card being turned into a lesson

  // `force` bypasses the cache (Refresh / Recommend 10) and replaces the cached
  // set with the new one; otherwise a cached set is used with no AI call.
  const load = useCallback(async (focusUnit: string, force = false) => {
    const key = `${repoSlug}|${focusUnit}`;
    if (!force && topicCache.has(key)) {
      setTopics(topicCache.get(key)!);
      if (unitsCache.has(repoSlug)) setUnits(unitsCache.get(repoSlug)!);
      return;
    }
    setBusy(true);
    try {
      const r: any = await API.post('/api/tools/repo/topics', { slug: repoSlug, unit: focusUnit });
      const t = Array.isArray(r?.topics) ? r.topics : [];
      setTopics(t); topicCache.set(key, t);
      if (Array.isArray(r?.units)) { setUnits(r.units); unitsCache.set(repoSlug, r.units); }
    } catch { setTopics([]); }
    finally { setBusy(false); }
  }, [repoSlug]);

  // On mount use the cache when present; only fetch the first time for this repo.
  useEffect(() => { load(''); }, [load]);
  // Keep the cache in sync with local edits (emoji / image) so they survive re-nav.
  useEffect(() => { if (topics.length) topicCache.set(`${repoSlug}|${unit}`, topics); }, [topics, repoSlug, unit]);

  const setEmoji = (i: number, emoji: string) => setTopics((ts) => ts.map((t, j) => (j === i ? { ...t, emoji } : t)));
  const setImage = (i: number, image: string) => setTopics((ts) => ts.map((t, j) => (j === i ? { ...t, image } : t)));
  // Upload your own image for a topic card (local only — these are ephemeral).
  const pickImage = (i: number) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; if (f.size > 8_000_000) { alert('Please pick an image under 8 MB.'); return; } const rd = new FileReader(); rd.onload = () => setImage(i, String(rd.result || '')); rd.readAsDataURL(f); };
    inp.click();
  };

  // Pressing a topic pick asks the AI to DESIGN a full multi-slide lesson plan
  // (teach → practise → check) adapted to the subject, then opens the Studio
  // builder PREFILLED with those preset slides so the user can review and edit
  // them before generating/publishing — it does not build the lesson on its own.
  const mkUid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const build = async (t: Topic, i: number) => {
    if (building !== null) return;
    setBuilding(i);
    const where = repoTitle ? `Part of the "${repoTitle}" repository${unit ? `, unit "${unit}"` : ''}. ` : '';
    const context = `${where}An engaging, comprehension-checking lesson about "${t.topic}" that helps someone understand it.`;
    let pages: any[] | undefined;
    try {
      const d: any = await API.post('/api/tools/studio-design', { subject: t.topic, title: t.topic, context }, { retries: 1 });
      // Turn the designer's per-slide component ids into editable Studio pages
      // (one layout block per slide, each component with a unique placement id).
      if (Array.isArray(d?.pages) && d.pages.length) {
        pages = d.pages.map((pg: any) => ({
          layouts: [{ template: 'auto', components: (Array.isArray(pg?.components) ? pg.components : []).map((c: any) => ({ id: typeof c === 'string' ? c : c?.id, uid: mkUid() })).filter((c: any) => c.id) }],
          length: ['brief', 'medium', 'detailed'].includes(pg?.length) ? pg.length : 'medium',
          paragraphs: Math.max(1, Math.min(4, parseInt(pg?.paragraphs, 10) || 1)),
        }));
      }
    } catch { /* fall through with no preset pages */ }
    // Seed the builder (presentation artifact, prefilled slides) and open it.
    appState.builderSeed = { artifact: 'presentation', subject: t.topic, title: t.topic, tone: 'Friendly', context, pages };
    setBuilding(null);
    app.nav('toolbuilder');
  };

  const onSelectUnit = (u: string) => { setUnit(u); load(u); };

  const card = (t: Topic, i: number) => {
    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
    const overlay = (
      <span style={{ position: 'absolute', top: 6, right: 8, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <button title="Random emoji" style={overlayIcon} onClick={stop(() => { setImage(i, ''); setEmoji(i, randEmoji(t.emoji)); })}>🎲</button>
        <button title="Upload your own image" style={overlayIcon} onClick={stop(() => pickImage(i))}>📎</button>
      </span>
    );
    return (
      <CardShell view="grid"
        title={t.topic}
        subtitle={t.blurb}
        badge="TOPIC"
        thumbnail={t.image || null}
        iconNode={t.image ? undefined : <span aria-hidden>{t.emoji || '💡'}</span>}
        overlay={overlay}
        onOpen={() => build(t, i)}
        actions={<button className="btn small green" disabled={building !== null} onClick={() => build(t, i)}>{building === i ? '⏳ Designing…' : '✨ Make a lesson →'}</button>} />
    );
  };

  const headerExtra = (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {units.length > 0 && (
        <select value={unit} onChange={(e) => onSelectUnit(e.target.value)} title="Focus the picks on one unit of this repository"
          style={{ fontSize: 12, maxWidth: 180 }}>
          <option value="">All units</option>
          {units.map((u) => <option key={u} value={u}>{u.length > 30 ? u.slice(0, 29) + '…' : u}</option>)}
        </select>
      )}
      <button className="btn small" disabled={busy} onClick={() => load(unit, true)} title="Replace with 10 fresh AI topic picks">{busy ? '…' : '✨ Recommend 10'}</button>
    </span>
  );

  return (
    <Carousel title="🎓 Learn any of these — AI topic picks" onRefresh={() => load(unit, true)} refreshing={busy} cardWidth={230} cardHeight={360}
      showCollapse
      banner={<span>Ten topics drawn from {unit ? <b>{unit}</b> : 'this repository'} (kept until you refresh). Tap one to open the presentation builder with an AI-suggested lesson — edit it or generate as-is. Pick a unit or hit <b>✨ Recommend 10</b> for a fresh set.</span>}
      headerExtra={headerExtra}
      empty={busy ? 'Finding topics…' : 'No topic picks yet.'}>
      {topics.map((t, i) => <div key={`${t.topic}-${i}`} style={{ height: '100%' }}>{card(t, i)}</div>)}
    </Carousel>
  );
}
