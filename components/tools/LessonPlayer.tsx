'use client';
/* Plays a 'lesson' tool: generates quiz slides one at a time from the tool's
 * lesson config, scores answers, and shows results. Content is read-aloud +
 * translatable (RichText). (Saving a report to My Stats is deferred until the
 * data-point set is finalized.) */
import { useState } from 'react';
import { API } from '@/lib/api';
import { defaultsFor } from '@/lib/tool-schema';
import { ToolFields } from '@/components/tools/ToolFields';
import { RichText } from '@/components/tools/RichText';

type Slide = { title: string; content: string; translation?: string; question: { prompt: string; options: any[] }; fallback?: boolean };

export function LessonPlayer({ def }: { def: any }) {
  const lesson = def?.lesson || {};
  const total = Math.max(3, Math.min(15, parseInt(lesson.totalSlides, 10) || 5));
  const settings = Array.isArray(def?.settings) ? def.settings : [];

  const [phase, setPhase] = useState<'intro' | 'play' | 'done'>('intro');
  const [values, setValues] = useState<Record<string, any>>(() => defaultsFor(settings));
  const [slideNum, setSlideNum] = useState(0);          // 1-based once playing
  const [slide, setSlide] = useState<Slide | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [seenTitles, setSeenTitles] = useState<string[]>([]);

  const fetchSlide = async (n: number, prior: string[]) => {
    setBusy(true); setErr(''); setPicked(null);
    try {
      const r = await API.post('/api/tools/lesson/slide', {
        lesson, values, slideNumber: n, priorSummary: prior.slice(-6).join('; '),
      });
      setSlide(r); setSlideNum(n);
    } catch (e: any) { setErr(e?.message || 'Could not load the slide.'); }
    setBusy(false);
  };

  const start = () => { setCorrectCount(0); setSeenTitles([]); setPhase('play'); fetchSlide(1, []); };

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (slide?.question?.options?.[i]?.correct) setCorrectCount(c => c + 1);
  };

  const next = () => {
    const prior = slide?.title ? [...seenTitles, slide.title] : seenTitles;
    setSeenTitles(prior);
    if (slideNum >= total) { setPhase('done'); return; }
    fetchSlide(slideNum + 1, prior);
  };

  if (phase === 'intro') {
    return (
      <div className="card alt" style={{ padding: '16px 18px' }}>
        <p style={{ marginTop: 0 }}>
          A {lesson.subject || 'lesson'}{lesson.language ? ` (${lesson.language})` : ''} — {total} interactive slides, scored as you go.
        </p>
        {settings.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <ToolFields fields={settings} values={values} onChange={(id, v) => setValues(s => ({ ...s, [id]: v }))} />
          </div>
        )}
        <button className="btn green" onClick={start}>▶ Start lesson</button>
      </div>
    );
  }

  if (phase === 'done') {
    const pct = Math.round((correctCount / total) * 100);
    return (
      <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Lesson complete 🎉</h2>
        <p style={{ fontSize: 20 }}>You scored <b>{correctCount}/{total}</b> ({pct}%)</p>
        <button className="btn green" onClick={() => { setPhase('intro'); setSlide(null); setSlideNum(0); }}>↻ Play again</button>
      </div>
    );
  }

  // phase === 'play'
  const answered = picked !== null;
  const opts = slide?.question?.options || [];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Slide {slideNum} / {total}</span>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Score: {correctCount}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden', border: '1.5px solid var(--ink)', marginBottom: 12 }}>
        <div style={{ width: `${(slideNum / total) * 100}%`, height: '100%', background: 'var(--accent,#5c80bc)' }} />
      </div>

      {busy && !slide && <p style={{ opacity: 0.7 }}>Generating slide…</p>}
      {err && <p style={{ color: 'var(--danger,#e4572e)' }}>{err} <button className="btn small" onClick={() => fetchSlide(slideNum || 1, seenTitles)}>Retry</button></p>}

      {slide && (
        <div className="card" style={{ padding: '16px 18px' }}>
          {slide.fallback && <p style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.7 }}>Demo slide (no AI connected).</p>}
          <h3 style={{ marginTop: 0 }}>{slide.title}</h3>
          <p style={{ fontSize: 16, lineHeight: 1.6 }}><RichText text={slide.content} translateTo={lesson.translateTo || 'English'} /></p>

          <p style={{ fontWeight: 600, marginTop: 14 }}>{slide.question?.prompt}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {opts.map((o: any, i: number) => {
              const isPicked = picked === i;
              const showState = answered && (o.correct || isPicked);
              const bg = !answered ? undefined : o.correct ? 'rgba(127,176,105,0.25)' : (isPicked ? 'rgba(228,87,46,0.2)' : undefined);
              return (
                <button key={i} className="btn" onClick={() => pick(i)} disabled={answered}
                  style={{ textAlign: 'left', background: bg, borderColor: showState ? 'var(--ink)' : undefined }}>
                  {o.correct && answered ? '✓ ' : (isPicked && !o.correct ? '✗ ' : '')}{o.text}
                </button>
              );
            })}
          </div>

          {answered && (
            <div style={{ marginTop: 12 }}>
              {opts[picked!]?.explanation && <p style={{ fontSize: 14, opacity: 0.85 }}>{opts[picked!].explanation}</p>}
              <button className="btn green" disabled={busy} onClick={next}>{slideNum >= total ? 'See results →' : 'Next slide →'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
