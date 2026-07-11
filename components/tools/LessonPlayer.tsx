'use client';
/* A lesson tool is a general-purpose lesson generator. Its page is a HUB:
 *  - a create form (topic + level) that generates & saves an "activity"
 *  - a feed of past activities (the tool's history), shown in random order,
 *    each replayable by anyone
 *  - one always-present AI "mock example" activity with a refresh button
 * Picking an activity plays a scored slide deck for that exact config.
 * (Saving a run report to My Stats is deferred until data points are final.) */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { defaultsFor } from '@/lib/tool-schema';
import { ToolFields } from '@/components/tools/ToolFields';
import { RichText } from '@/components/tools/RichText';

type Slide = { title: string; content: string; translation?: string; question: { prompt: string; options: any[] }; fallback?: boolean };
type Cfg = { level?: string; topic?: string };

function shuffle<T>(a: T[]): T[] { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function LessonPlayer({ def, slug }: { def: any; slug: string }) {
  const lesson = def?.lesson || {};
  const total = Math.max(3, Math.min(15, parseInt(lesson.totalSlides, 10) || 5));
  const settings = Array.isArray(def?.settings) ? def.settings : [];
  const levelField = settings.find((f: any) => f.id === 'level');
  const levels: string[] = levelField?.options?.length ? levelField.options : ['Beginner', 'A1', 'A2', 'B1', 'B2', 'C1'];

  const [phase, setPhase] = useState<'hub' | 'play' | 'done'>('hub');
  const [form, setForm] = useState<Record<string, any>>(() => defaultsFor(settings));
  const [activities, setActivities] = useState<any[]>([]);
  const [example, setExample] = useState<any>(null);
  const [exBusy, setExBusy] = useState(false);

  // play state
  const [cfg, setCfg] = useState<Cfg>({});
  const [slideNum, setSlideNum] = useState(0);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [seenTitles, setSeenTitles] = useState<string[]>([]);

  const loadActivities = async () => {
    try { const r = await API.get(`/api/tools/entries?slug=${encodeURIComponent(slug)}`); setActivities(shuffle(Array.isArray(r?.entries) ? r.entries : [])); } catch { /* ignore */ }
  };
  const refreshExample = async () => {
    setExBusy(true);
    try { const r = await API.post('/api/tools/lesson/suggest', { lesson, levels, avoid: example?.topic || '' }); setExample(r); } catch { /* ignore */ }
    setExBusy(false);
  };
  useEffect(() => { loadActivities(); refreshExample(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  const fetchSlide = async (n: number, prior: string[], useCfg: Cfg) => {
    setBusy(true); setErr(''); setPicked(null);
    try {
      const r = await API.post('/api/tools/lesson/slide', { lesson, values: useCfg, slideNumber: n, priorSummary: prior.slice(-6).join('; ') });
      setSlide(r); setSlideNum(n);
    } catch (e: any) { setErr(e?.message || 'Could not load the slide.'); }
    setBusy(false);
  };

  const play = (c: Cfg) => { setCfg(c); setCorrectCount(0); setSeenTitles([]); setPhase('play'); fetchSlide(1, [], c); };

  const createAndPlay = async () => {
    const c: Cfg = { level: form.level || levels[0], topic: form.topic || '' };
    try { await API.post('/api/tools/entries', { slug, data: c }); } catch { /* ignore */ }
    loadActivities();
    play(c);
  };

  const pick = (i: number) => { if (picked !== null) return; setPicked(i); if (slide?.question?.options?.[i]?.correct) setCorrectCount(x => x + 1); };
  const next = () => {
    const prior = slide?.title ? [...seenTitles, slide.title] : seenTitles;
    setSeenTitles(prior);
    if (slideNum >= total) { setPhase('done'); return; }
    fetchSlide(slideNum + 1, prior, cfg);
  };

  const label = (c: Cfg) => [lesson.subject, c.level, c.topic].filter(Boolean).join(' · ');

  // ---------------- HUB ----------------
  if (phase === 'hub') {
    return (
      <div>
        <div className="card alt" style={{ padding: '14px 16px' }}>
          <h4 style={{ margin: '0 0 8px' }}>Create a {lesson.subject || 'lesson'} activity</h4>
          {settings.length > 0 && <ToolFields fields={settings} values={form} onChange={(id, v) => setForm(s => ({ ...s, [id]: v }))} />}
          <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <button className="btn green" onClick={createAndPlay}>✨ Generate &amp; play →</button>
          </div>
        </div>

        {/* Always-present AI mock example, refreshable. */}
        <div className="card" style={{ padding: '12px 14px', marginTop: 14, borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>✦ AI EXAMPLE</span>
            <button className="btn small ghost" onClick={refreshExample} disabled={exBusy}>{exBusy ? '…' : '🔄 Refresh'}</button>
          </div>
          {example ? (
            <div style={{ marginTop: 6 }}>
              <strong>{label({ level: example.level, topic: example.topic })}</strong>
              {example.why && <p style={{ margin: '4px 0', fontSize: 13, opacity: 0.8 }}>{example.why}</p>}
              <button className="btn small green" onClick={() => play({ level: example.level, topic: example.topic })}>▶ Play</button>
            </div>
          ) : <p style={{ fontSize: 13, opacity: 0.6, margin: '6px 0 0' }}>Loading a suggestion…</p>}
        </div>

        {/* Feed of generated activities (history), random order. */}
        <h4 style={{ margin: '18px 0 8px' }}>Activities feed</h4>
        {activities.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: 14 }}>No activities yet — generate the first one above.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {activities.map((e: any) => (
              <div key={e.id} className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{label(e.data || {})}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>@{e.username || 'anon'}</div>
                </div>
                <button className="btn small green" onClick={() => play(e.data || {})}>▶ Play</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------------- DONE ----------------
  if (phase === 'done') {
    const pct = Math.round((correctCount / total) * 100);
    return (
      <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Lesson complete 🎉</h2>
        <p style={{ fontSize: 14, opacity: 0.7 }}>{label(cfg)}</p>
        <p style={{ fontSize: 20 }}>You scored <b>{correctCount}/{total}</b> ({pct}%)</p>
        <div className="slide-actions" style={{ justifyContent: 'center', gap: 8 }}>
          <button className="btn green" onClick={() => play(cfg)}>↻ Replay</button>
          <button className="btn" onClick={() => { setPhase('hub'); loadActivities(); }}>← Back to lessons</button>
        </div>
      </div>
    );
  }

  // ---------------- PLAY ----------------
  const answered = picked !== null;
  const opts = slide?.question?.options || [];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn small ghost" onClick={() => { setPhase('hub'); loadActivities(); }}>← Lessons</button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>{label(cfg)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Slide {slideNum} / {total}</span>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Score: {correctCount}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden', border: '1.5px solid var(--ink)', marginBottom: 12 }}>
        <div style={{ width: `${(slideNum / total) * 100}%`, height: '100%', background: 'var(--accent,#5c80bc)' }} />
      </div>

      {busy && !slide && <p style={{ opacity: 0.7 }}>Generating slide…</p>}
      {err && <p style={{ color: 'var(--danger,#e4572e)' }}>{err} <button className="btn small" onClick={() => fetchSlide(slideNum || 1, seenTitles, cfg)}>Retry</button></p>}

      {slide && (
        <div className="card" style={{ padding: '16px 18px' }}>
          {slide.fallback && <p style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.7 }}>Demo slide (no AI connected).</p>}
          <h3 style={{ marginTop: 0 }}>{slide.title}</h3>
          <p style={{ fontSize: 16, lineHeight: 1.6 }}><RichText text={slide.content} translateTo={lesson.translateTo || 'English'} /></p>
          <p style={{ fontWeight: 600, marginTop: 14 }}>{slide.question?.prompt}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {opts.map((o: any, i: number) => {
              const isPicked = picked === i;
              const bg = !answered ? undefined : o.correct ? 'rgba(127,176,105,0.25)' : (isPicked ? 'rgba(228,87,46,0.2)' : undefined);
              return (
                <button key={i} className="btn" onClick={() => pick(i)} disabled={answered} style={{ textAlign: 'left', background: bg }}>
                  {o.correct && answered ? '✓ ' : (isPicked && !o.correct ? '✗ ' : '')}{o.text}
                </button>
              );
            })}
          </div>
          {answered && (
            <div style={{ marginTop: 12 }}>
              {opts[picked!]?.explanation && <p style={{ fontSize: 14, opacity: 0.85 }}>{opts[picked!].explanation}</p>}
              <button className="btn green" disabled={busy} onClick={next}>{slideNum >= total ? 'Finish →' : 'Next slide →'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
