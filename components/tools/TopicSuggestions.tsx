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
import { assembleDefinition } from '@/lib/studio-catalog';

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

  // Pressing a topic pick DESIGNS a full multi-slide lesson for it and opens it to
  // play. The AI lays out several slides (teach → practise → check) using the
  // platform's components, adapted to the subject (STEM practice vs. humanities /
  // arts reading & reflection), then we assemble + publish it and open the tool.
  // If anything fails, we fall back to seeding the builder so the user can still
  // generate it by hand.
  const build = async (t: Topic, i: number) => {
    if (building !== null) return;
    setBuilding(i);
    const where = repoTitle ? `Part of the "${repoTitle}" repository${unit ? `, unit "${unit}"` : ''}. ` : '';
    const context = `${where}An engaging, comprehension-checking lesson about "${t.topic}" that helps someone understand it.`;
    try {
      const d: any = await API.post('/api/tools/studio-design', { subject: t.topic, title: t.topic, context }, { retries: 1 });
      const pages = Array.isArray(d?.pages) && d.pages.length ? d.pages : undefined;
      const def = assembleDefinition({ artifact: 'presentation', title: t.topic, subject: t.topic, tone: 'Friendly', context, pages } as any);
      const pub = await API.post('/api/tools', { definition: def, visibility: 'unlisted', aiGenerated: true });
      const one = await API.get(`/api/tools?slug=${encodeURIComponent(pub.slug)}`);
      if (one?.tool) { appState.activeTool = one.tool; setBuilding(null); app.nav('tool'); return; }
      setBuilding(null); app.nav('tools');
    } catch {
      // Fall back to the seeded builder so the topic is never a dead end.
      appState.builderSeed = { artifact: 'presentation', subject: t.topic, title: t.topic, context };
      setBuilding(null); app.nav('toolbuilder');
    }
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
        actions={<button className="btn small green" disabled={building !== null} onClick={() => build(t, i)}>{building === i ? '⏳ Building…' : '✨ Make a lesson →'}</button>} />
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
