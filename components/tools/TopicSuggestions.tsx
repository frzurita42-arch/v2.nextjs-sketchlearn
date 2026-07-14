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

type Topic = { topic: string; emoji: string; blurb: string };

// A friendly pool for the local ✎/🎨 emoji controls (no persistence — these are
// ephemeral preset cards).
const EMOJI_POOL = ['📘', '🧠', '🔬', '📐', '🧪', '🌍', '🎨', '🎵', '💡', '⚙️', '📊', '🧭', '🚀', '🌱', '🔎', '📝', '🎯', '🏛️', '⚗️', '🧮', '🌡️', '🔭', '📚', '✏️'];
const randEmoji = (not?: string) => { let e = not; for (let i = 0; i < 8 && (!e || e === not); i++) e = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]; return e || '💡'; };

export function TopicSuggestions({ repoSlug, repoTitle }: { repoSlug: string; repoTitle?: string }) {
  const app = useApp();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [unit, setUnit] = useState('');            // '' = whole repository
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (focusUnit: string) => {
    setBusy(true);
    try {
      const r: any = await API.post('/api/tools/repo/topics', { slug: repoSlug, unit: focusUnit });
      setTopics(Array.isArray(r?.topics) ? r.topics : []);
      if (Array.isArray(r?.units)) setUnits(r.units);
    } catch { setTopics([]); }
    finally { setBusy(false); }
  }, [repoSlug]);

  useEffect(() => { load(''); }, [load]);

  const setEmoji = (i: number, emoji: string) => setTopics((ts) => ts.map((t, j) => (j === i ? { ...t, emoji } : t)));

  // Open the presentation builder seeded with this topic (+ a framing hint so the
  // AI-suggested lesson fits what the repository is about).
  const build = (t: Topic) => {
    const where = repoTitle ? `Part of the "${repoTitle}" repository${unit ? `, unit "${unit}"` : ''}. ` : '';
    appState.builderSeed = {
      artifact: 'presentation', subject: t.topic, title: t.topic,
      context: `${where}Make an engaging presentation lesson about "${t.topic}" that helps someone understand it.`,
    };
    app.nav('toolbuilder');
  };

  const onSelectUnit = (u: string) => { setUnit(u); load(u); };

  const card = (t: Topic, i: number) => {
    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
    const overlay = (
      <span style={{ position: 'absolute', top: 6, right: 8, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <button title="Pick a custom emoji" style={overlayIcon} onClick={stop(() => { const v = window.prompt('Type an emoji for this topic:', t.emoji); if (v && v.trim()) setEmoji(i, v.trim().slice(0, 4)); })}>✎</button>
        <button title="Shuffle the emoji" style={overlayIcon} onClick={stop(() => setEmoji(i, randEmoji(t.emoji)))}>🎨</button>
      </span>
    );
    return (
      <CardShell view="grid"
        title={t.topic}
        subtitle={t.blurb}
        badge="TOPIC"
        iconNode={<span aria-hidden>{t.emoji || '💡'}</span>}
        overlay={overlay}
        onOpen={() => build(t)}
        actions={<button className="btn small green" onClick={() => build(t)}>✨ Make a lesson →</button>} />
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
      <button className="btn small" disabled={busy} onClick={() => load(unit)} title="Fresh AI topic picks">{busy ? '…' : '✨ Recommend 10'}</button>
    </span>
  );

  return (
    <Carousel title="🎓 Learn any of these — AI topic picks" onRefresh={() => load(unit)} refreshing={busy} cardWidth={230} cardHeight={360}
      showCollapse
      banner={<span>Ten topics drawn from {unit ? <b>{unit}</b> : 'this repository'}. Tap one to open the presentation builder with an AI-suggested lesson — edit it or generate as-is. Pick a unit or hit <b>✨ Recommend 10</b> for a fresh set.</span>}
      headerExtra={headerExtra}
      empty={busy ? 'Finding topics…' : 'No topic picks yet.'}>
      {topics.map((t, i) => <div key={`${t.topic}-${i}`} style={{ height: '100%' }}>{card(t, i)}</div>)}
    </Carousel>
  );
}
