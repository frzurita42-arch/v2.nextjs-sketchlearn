'use client';
/* A lesson tool is a general-purpose lesson generator. Its page is a HUB
 * (create form + activity feed + refreshable AI example). Playing an activity
 * runs a scored slide deck whose questions fluctuate between multiple-choice
 * (2 or 4 options), fill-in-the-blank, and typed short-answer (3 tries then
 * reveal), with optional support material (image / code / table / formula) and
 * speaker + translate on the content. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { defaultsFor } from '@/lib/tool-schema';
import { ToolFields } from '@/components/tools/ToolFields';
import { RichText } from '@/components/tools/RichText';
import { DrawField } from '@/components/tools/MediaFields';
import { AudioButton } from '@/components/ui/AudioButton';

type Q = { kind: string; prompt: string; options?: any[]; answer?: string; accept?: string[]; explanation?: string; target?: string };
type Slide = { title: string; content: string; translation?: string; support?: any; questions: Q[]; fallback?: boolean };
type Cfg = Record<string, any>;

function shuffle<T>(a: T[]): T[] { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function Support({ s }: { s: any }) {
  if (!s) return null;
  if (s.type === 'image' && s.url) return <img src={s.url} alt={s.caption || ''} style={{ width: '100%', maxWidth: 360, borderRadius: 8, border: '2px solid var(--ink)', margin: '8px auto', display: 'block' }} />;
  if (s.type === 'code') return <pre style={{ background: '#2d2a26', color: '#f7f3e9', padding: 12, borderRadius: 8, overflowX: 'auto', fontSize: 13 }}><code>{s.code}</code></pre>;
  if (s.type === 'table') return (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table className="sketch-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{(s.headers || []).map((h: string, i: number) => <th key={i} style={{ textAlign: 'left', borderBottom: '2px solid var(--ink)', padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>{(s.rows || []).map((r: any[], i: number) => <tr key={i}>{(Array.isArray(r) ? r : []).map((c, j) => <td key={j} style={{ borderBottom: '1px solid rgba(0,0,0,0.15)', padding: 6 }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (s.type === 'formula') return (
    <div style={{ margin: '8px 0', padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1.5px solid var(--ink)', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16 }}>{s.latex}</div>
      {s.caption && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{s.caption}</div>}
    </div>
  );
  if (s.type === 'wolfram') return (
    <div style={{ margin: '8px 0', padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1.5px solid var(--ink)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>⚡ WOLFRAM ALPHA</div>
      {s.latex && <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, textAlign: 'center', margin: '4px 0' }}>{s.latex}</div>}
      {s.query && <div style={{ fontSize: 12, opacity: 0.7 }}>Query: <code>{s.query}</code></div>}
      {s.result && <div style={{ fontSize: 15, marginTop: 4 }}>= <b>{s.result}</b></div>}
      {s.caption && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{s.caption}</div>}
    </div>
  );
  return null;
}

// One question; calls onDone(correct, detail) once when answered/revealed.
// `detail` (prompt / your answer / correct answer) feeds the end-of-lesson review.
function Question({ q, translateTo, onDone }: { q: Q; translateTo: string; onDone: (correct: boolean, detail?: any) => void }) {
  const [opts] = useState<any[]>(() => q.kind === 'mcq' ? shuffle(q.options || []) : []);
  const [picked, setPicked] = useState<number | null>(null);
  const [val, setVal] = useState('');
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<'open' | 'right' | 'wrong'>('open');

  const finish = (correct: boolean, detail?: any) => { if (state === 'open') { setState(correct ? 'right' : 'wrong'); onDone(correct, detail); } };

  if (q.kind === 'writing') return <WritingQuestion q={q} translateTo={translateTo} onDone={onDone} />;

  if (q.kind === 'mcq') {
    const answered = picked !== null;
    const correctText = (opts.find((o: any) => o.correct) || {}).text || '';
    return (
      <div>
        <p style={{ fontWeight: 600, textAlign: 'center', margin: '0 0 10px' }}>{q.prompt}</p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 460, margin: '0 auto' }}>
          {opts.map((o: any, i: number) => {
            const isP = picked === i;
            const bg = !answered ? undefined : o.correct ? 'rgba(127,176,105,0.25)' : (isP ? 'rgba(228,87,46,0.2)' : undefined);
            return <button key={i} className="btn" style={{ textAlign: 'left', width: '100%', background: bg, borderColor: answered && o.correct ? 'var(--ink)' : undefined }} disabled={answered}
              onClick={() => { setPicked(i); finish(!!o.correct, { prompt: q.prompt, your: o.text, answer: correctText, correct: !!o.correct }); }}>{o.correct && answered ? '✓ ' : (isP && !o.correct ? '✗ ' : '')}{o.text}</button>;
          })}
        </div>
        {answered && opts[picked!]?.explanation && <p style={{ fontSize: 14, opacity: 0.85, marginTop: 10, textAlign: 'center' }}>{opts[picked!].explanation}</p>}
      </div>
    );
  }

  // fill-blank / input — typed answer, 3 tries then reveal
  const accept = (q.accept && q.accept.length ? q.accept : [q.answer || '']).map(s => String(s).toLowerCase());
  const check = () => {
    const ok = accept.includes(val.trim().toLowerCase());
    if (ok) { finish(true, { prompt: q.prompt, your: val, answer: q.answer || '', correct: true }); return; }
    const t = tries + 1; setTries(t);
    if (t >= 3) finish(false, { prompt: q.prompt, your: val || '(no answer)', answer: q.answer || '', correct: false });
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontWeight: 600, margin: '0 0 8px' }}>{q.kind === 'fill-blank' ? '✍️ Fill in the blank' : '⌨️ Your answer'}: {q.prompt}</p>
      <div className="chat-input-row" style={{ maxWidth: 420, margin: '0 auto' }}>
        <input type="text" value={val} disabled={state !== 'open'} placeholder="Type your answer…"
          onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); check(); } }} />
        {state === 'open' && <button className="btn primary" onClick={check}>Check</button>}
      </div>
      {state === 'open' && tries > 0 && <p style={{ fontSize: 13, color: 'var(--danger,#e4572e)' }}>Not quite — {3 - tries} {3 - tries === 1 ? 'try' : 'tries'} left.</p>}
      {state === 'right' && <p style={{ fontSize: 14, color: 'var(--accent,#5c80bc)' }}>✓ Correct!</p>}
      {state === 'wrong' && <p style={{ fontSize: 14 }}>Answer: <b>{q.answer}</b> <RichText text={String(q.answer || '')} translateTo={translateTo} /></p>}
    </div>
  );
}

// Handwriting drill: draw the target character/word, then have the AI check it.
function WritingQuestion({ q, translateTo, onDone }: { q: Q; translateTo: string; onDone: (correct: boolean, detail?: any) => void }) {
  const [drawing, setDrawing] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [meaning, setMeaning] = useState('');
  const [trBusy, setTrBusy] = useState(false);
  const target = String(q.target || '');

  const translate = async () => {
    setTrBusy(true);
    try { const r = await API.post('/api/tools/translate', { text: target, to: translateTo }); setMeaning(r?.translation || ''); } catch { /* ignore */ }
    setTrBusy(false);
  };

  const check = async () => {
    if (!drawing) { alert('Draw the character first.'); return; }
    setBusy(true);
    try {
      const r = await API.post('/api/tools/lesson/check-writing', { target, image: drawing });
      setResult(r);
    } catch { setResult({ correct: true, feedback: 'Saved.', checked: false }); }
    setBusy(false);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontWeight: 600, margin: '0 0 4px' }}>✍️ {q.prompt || 'Write this by hand'}</p>
      {/* The character to copy — big and centered. */}
      <div style={{ fontSize: '4.2rem', lineHeight: 1.1, margin: '2px 0 6px' }}>{target}</div>
      {/* Exactly one way to hear it + one to translate it. */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AudioButton text={target} label="🔊 Hear" small showTextOnFail={false} />
        <button className="btn small ghost" disabled={trBusy} onClick={translate}>{trBusy ? '…' : '🌐 Meaning'}</button>
      </div>
      {meaning && <p style={{ fontSize: 13, opacity: 0.8, marginTop: -4 }}>“{meaning}”</p>}
      {/* The drawing space (DrawField provides its own Clear button). */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DrawField label="Trace / write it here" value={drawing} onChange={setDrawing} />
      </div>
      {!result ? (
        <button className="btn green" style={{ marginTop: 12 }} disabled={busy} onClick={check}>{busy ? 'Checking…' : '✅ Check with AI'}</button>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 15 }}>{result.correct ? '✓ ' : '✗ '}{result.feedback}{typeof result.score === 'number' ? ` (${result.score}/100)` : ''}</p>
          <button className="btn green" onClick={() => onDone(!!result.correct, { prompt: q.prompt || 'Write it', your: '✍️ your drawing', answer: target, correct: !!result.correct })}>Continue →</button>
        </div>
      )}
    </div>
  );
}

export function LessonPlayer({ def, slug }: { def: any; slug: string }) {
  const lesson = def?.lesson || {};
  const settings = Array.isArray(def?.settings) ? def.settings : [];
  const levelField = settings.find((f: any) => f.id === 'level' || f.id === 'difficulty');
  const levels: string[] = levelField?.options?.length ? levelField.options : ['Beginner', 'A1', 'A2', 'B1', 'B2', 'C1'];

  const [phase, setPhase] = useState<'hub' | 'play' | 'done'>('hub');
  const [form, setForm] = useState<Cfg>(() => defaultsFor(settings));
  const [activities, setActivities] = useState<any[]>([]);
  const [example, setExample] = useState<any>(null);
  const [exBusy, setExBusy] = useState(false);

  const [cfg, setCfg] = useState<Cfg>({});
  const total = () => Math.max(3, Math.min(15, parseInt(cfg.slides, 10) || parseInt(lesson.totalSlides, 10) || 5));
  const [slideNum, setSlideNum] = useState(0);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [qDone, setQDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [review, setReview] = useState<any[]>([]);
  const [showReview, setShowReview] = useState(false);
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

  const fetchSlide = async (nSlide: number, prior: string[], useCfg: Cfg) => {
    setBusy(true); setErr(''); setQIndex(0); setQDone(false);
    try {
      const r = await API.post('/api/tools/lesson/slide', { lesson, values: useCfg, slideNumber: nSlide, priorSummary: prior.slice(-6).join('; ') });
      setSlide(r); setSlideNum(nSlide);
    } catch (e: any) { setErr(e?.message || 'Could not load the slide.'); }
    setBusy(false);
  };

  const play = (c: Cfg) => { setCfg(c); setScore(0); setAnswered(0); setReview([]); setShowReview(false); setSeenTitles([]); setPhase('play'); fetchSlide(1, [], c); };

  const createAndPlay = async () => {
    const c: Cfg = { ...form, level: form.level || form.difficulty || levels[0], topic: form.topic || '' };
    try { await API.post('/api/tools/entries', { slug, data: c }); } catch { /* ignore */ }
    loadActivities();
    play(c);
  };

  const onQuestionDone = (correct: boolean, detail?: any) => {
    setQDone(true); setAnswered(x => x + 1); if (correct) setScore(s => s + 1);
    if (detail) setReview(r => [...r, detail]);
  };
  const advance = () => {
    const qs = slide?.questions || [];
    if (qIndex < qs.length - 1) { setQIndex(qIndex + 1); setQDone(false); return; }
    const prior = slide?.title ? [...seenTitles, slide.title] : seenTitles;
    setSeenTitles(prior);
    if (slideNum >= total()) { setPhase('done'); return; }
    fetchSlide(slideNum + 1, prior, cfg);
  };

  const label = (c: Cfg) => [lesson.subject, c.level || c.difficulty, c.topic].filter(Boolean).join(' · ');

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

        <div className="card" style={{ padding: '12px 14px', marginTop: 14, borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>✦ AI EXAMPLE</span>
            <button className="btn small ghost" onClick={refreshExample} disabled={exBusy}>{exBusy ? '…' : '🔄 Refresh'}</button>
          </div>
          {example ? (
            <div style={{ marginTop: 6 }}>
              <strong>{label({ level: example.level, topic: example.topic })}</strong>
              {example.why && <p style={{ margin: '4px 0', fontSize: 13, opacity: 0.8 }}>{example.why}</p>}
              <button className="btn small green" onClick={() => play({ ...form, level: example.level, topic: example.topic })}>▶ Play</button>
            </div>
          ) : <p style={{ fontSize: 13, opacity: 0.6, margin: '6px 0 0' }}>Loading a suggestion…</p>}
        </div>

        <h4 style={{ margin: '18px 0 8px' }}>Activities feed</h4>
        {activities.length === 0 ? <p style={{ opacity: 0.6, fontSize: 14 }}>No activities yet — generate the first one above.</p> : (
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
    const pct = answered ? Math.round((score / answered) * 100) : 0;
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Lesson complete 🎉</h2>
          <p style={{ fontSize: 14, opacity: 0.7 }}>{label(cfg)}</p>
          <p style={{ fontSize: 20 }}>You scored <b>{score}/{answered}</b> ({pct}%)</p>
          <button className="btn small ghost" onClick={() => setShowReview(v => !v)}>{showReview ? 'Hide review' : '🔎 Review your answers'}</button>
        </div>
        {showReview && (
          <div className="card alt" style={{ padding: '14px 16px', marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px' }}>Your answers</h4>
            {review.length === 0 ? <p style={{ opacity: 0.6, fontSize: 13 }}>No questions recorded.</p> : review.map((r, i) => (
              <div key={i} style={{ borderTop: i ? '1px dashed var(--ink)' : 'none', padding: '8px 0' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{i + 1}. {r.prompt}</div>
                <div style={{ fontSize: 13 }}>{r.correct ? '✓' : '✗'} Your answer: <b>{r.your}</b></div>
                {!r.correct && r.answer && <div style={{ fontSize: 13, color: 'var(--accent,#5c80bc)' }}>Correct: <b>{r.answer}</b></div>}
              </div>
            ))}
          </div>
        )}
        <div className="slide-actions" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button className="btn green" onClick={() => play(cfg)}>↻ Replay</button>
          <button className="btn" onClick={() => { setPhase('hub'); loadActivities(); }}>← Back to lessons</button>
        </div>
      </div>
    );
  }

  // ---------------- PLAY ----------------
  const qs = slide?.questions || [];
  const tot = total();
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn small ghost" onClick={() => { setPhase('hub'); loadActivities(); }}>← Lessons</button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>{label(cfg)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Slide {slideNum} / {tot}{qs.length > 1 ? ` · Q${qIndex + 1}/${qs.length}` : ''}</span>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Score: {score}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden', border: '1.5px solid var(--ink)', marginBottom: 12 }}>
        <div style={{ width: `${(slideNum / tot) * 100}%`, height: '100%', background: 'var(--accent,#5c80bc)' }} />
      </div>

      {busy && !slide && <p style={{ opacity: 0.7 }}>Generating slide…</p>}
      {err && <p style={{ color: 'var(--danger,#e4572e)' }}>{err} <button className="btn small" onClick={() => fetchSlide(slideNum || 1, seenTitles, cfg)}>Retry</button></p>}

      {slide && (() => {
        const isWritingSlide = qs.length > 0 && qs.every((q: any) => q.kind === 'writing');
        return (
        <div className="card" style={{ padding: '16px 18px', maxWidth: 560, margin: '0 auto' }}>
          {slide.fallback && <p style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.7, textAlign: 'center' }}>Demo slide (no AI connected).</p>}
          <h3 style={{ marginTop: 0, textAlign: 'center' }}>{slide.title}</h3>
          {/* Writing drills speak/translate the target themselves — keep the intro plain. */}
          {slide.content && (isWritingSlide
            ? <p style={{ fontSize: 15, lineHeight: 1.6, textAlign: 'center', opacity: 0.9 }}>{slide.content}</p>
            : <p style={{ fontSize: 16, lineHeight: 1.6 }}><RichText text={slide.content} translateTo={lesson.translateTo || 'English'} /></p>)}
          <Support s={slide.support} />

          <div style={{ marginTop: 14, borderTop: '2px dashed var(--ink)', paddingTop: 14 }}>
            {/* key remounts the question so its per-question state resets */}
            <Question key={`${slideNum}-${qIndex}`} q={qs[qIndex]} translateTo={lesson.translateTo || 'English'} onDone={onQuestionDone} />
            {qDone && (
              <div style={{ textAlign: 'center' }}>
                <button className="btn green" style={{ marginTop: 14 }} disabled={busy} onClick={advance}>
                  {qIndex < qs.length - 1 ? 'Next question →' : (slideNum >= tot ? 'Finish →' : 'Next slide →')}
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
