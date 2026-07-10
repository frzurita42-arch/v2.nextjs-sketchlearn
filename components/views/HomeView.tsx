'use client';
/* Home view: the activity feed. "Start a Learning path" always renders first,
 * ABOVE the "Refresh feed" button; the other three activity cards render below
 * the button in a shuffled order. Warms the topic/suggestion caches.
 * Ported from public/js/views/home.js. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState, PRESET_TOPICS } from '@/lib/app-state';
import { shuffled, withTimeout } from '@/lib/util';
import { useApp } from '@/components/AppContext';
import { LearningPath } from '@/components/activities/LearningPath';
import { SuggestedTopic, refreshSuggestedTopic } from '@/components/activities/SuggestedTopic';
import { TimeTravel } from '@/components/activities/TimeTravel';
import { StructuredExplanations } from '@/components/activities/StructuredExplanations';
import { LanguageLearning } from '@/components/activities/LanguageLearning';

const SECTIONS = [LearningPath, SuggestedTopic, TimeTravel, StructuredExplanations, LanguageLearning];

export function HomeView() {
  const app = useApp();
  // Seed the chip pool once for this home mount (matches legacy viewHome()).
  useState(() => { appState.homeTopics = shuffled(PRESET_TOPICS); return null; });
  // Learning Path renders first (above the refresh button); these three shuffle below it.
  const [order, setOrder] = useState<number[]>(() => shuffled([1, 2, 3, 4]));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await withTimeout(API.post('/api/ai/topics', {
          count: 12, avoid: [appState.topic].filter(Boolean), refresh: false, triggerTopic: appState.topic || '',
        }), 15000, 'Home topics timed out.');
        if (!cancelled && r && Array.isArray(r.topics)) {
          const fromCache = r.topics.map((t: any) => t.name).filter(Boolean);
          if (fromCache.length) { appState.homeTopics = fromCache.slice(0, 12); app.rerender(); }
        }
      } catch { /* silent */ }
    })();
    refreshSuggestedTopic(app, { silent: true, forceRefresh: false });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <h1 className="view-title">What do you want to <span className="scribble-underline">learn</span> today?</h1>
      <p className="view-sub">Pick a subject, or write your own.</p>
      <LearningPath />
      <div className="slide-actions" style={{ justifyContent: 'center', margin: '10px 0 10px', borderTop: '3px dashed var(--ink)', paddingTop: 14 }}>
        <button className="btn small" id="refresh-home-feed" onClick={() => setOrder(shuffled([1, 2, 3, 4]))}>↻ Refresh feed</button>
      </div>
      {order.map(i => {
        const Section = SECTIONS[i];
        return <Section key={i} />;
      })}
    </>
  );
}
