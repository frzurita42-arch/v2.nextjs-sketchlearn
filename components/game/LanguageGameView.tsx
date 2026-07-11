'use client';
/* Language lesson player. Unlike the branching GameView, a language lesson is a
 * fixed sequence of self-contained activity slides (grammar always first, the rest
 * shuffled), each with its own interaction. Slides are generated with a one-ahead
 * prefetch so advancing is instant. Results are saved like a normal game. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState, LANG_LEVELS } from '@/lib/app-state';
import { shuffled } from '@/lib/util';
import { useApp } from '@/components/AppContext';
import { Loading } from '@/components/ui/Loading';
import { AudioButton } from '@/components/ui/AudioButton';
import { MicButton } from '@/components/ui/MicButton';
import { langCode } from '@/lib/lang-codes';
import { DrawField } from '@/components/tools/MediaFields';

const MAX_SLIDES = 12;

type SlideResult = { correct: number; total: number; answers: any[] };

// Rough CEFR vocabulary sizes, used to estimate how many words the learner likely
// knows from their performance at the attempted level.
const VOCAB_AT_LEVEL: Record<string, number> = { Zero: 50, Beginner: 150, A1: 500, A2: 1000, B1: 2000, B2: 4000, C1: 8000, C2: 16000 };

function estimateProficiency(level: string, correct: number, total: number) {
  const base = VOCAB_AT_LEVEL[level] ?? 500;
  const pct = total ? correct / total : 0.5;
  // 50% score ≈ solidly at level; 100% ≈ 1.5× (ready to move up); 0% ≈ half.
  const estimatedWords = Math.max(0, Math.round(base * (0.5 + pct)));
  const idx = Math.max(0, LANG_LEVELS.indexOf(level));
  let suggested = level;
  if (pct >= 0.85 && idx < LANG_LEVELS.length - 1) suggested = LANG_LEVELS[idx + 1];
  else if (pct < 0.4 && idx > 0) suggested = LANG_LEVELS[idx - 1];
  return { level, estimatedWords, suggestedLevel: suggested, scorePct: Math.round(pct * 100) };
}

function buildPlan(counts: any): string[] {
  const n = (k: string) => Math.max(0, Number(counts?.[k] || 0));
  const grammar = Array(n('grammar')).fill('grammar');
  const rest = [
    ...Array(n('reading')).fill('reading'),
    ...Array(n('vocabulary')).fill('vocabulary'),
    ...Array(n('listening')).fill('listening'),
    ...Array(n('spelling')).fill('spelling'),
    ...Array(n('writing')).fill('writing'),
  ];
  const plan = [...grammar, ...shuffled(rest)].slice(0, MAX_SLIDES);
  return plan.length ? plan : ['reading'];
}

export function LanguageGameView() {
  const app = useApp();
  const g = useRef<any>(null);
  const [ui, setUi] = useState<'loading' | 'slide' | 'results' | 'error'>('loading');
  const [cur, setCur] = useState<any>(null);
  const [loadingMsg, setLoadingMsg] = useState('Preparing your lesson…');
  const [err, setErr] = useState('');
  const [results, setResults] = useState<any>(null);
  const started = useRef(false);

  const genSlide = useCallback((idx: number) => {
    const gg = g.current;
    return API.post('/api/ai/language/slide', {
      gameId: gg.id, type: gg.plan[idx], language: gg.language, level: gg.level,
      topic: gg.topic, grammarTopic: gg.grammarTopic,
      slideNumber: idx + 1, totalSlides: gg.plan.length,
      priorSummary: gg.total ? `${gg.correct}/${gg.total} correct so far` : '',
    });
  }, []);

  const prefetch = useCallback((idx: number) => {
    const gg = g.current;
    if (idx >= gg.plan.length || gg.prefetch[idx]) return;
    gg.prefetch[idx] = genSlide(idx).catch(() => null);
  }, [genSlide]);

  const show = useCallback((slide: any) => {
    window.scrollTo(0, 0);
    setCur(slide);
    setUi('slide');
    prefetch(g.current.idx + 1);
  }, [prefetch]);

  const finish = useCallback(async () => {
    const gg = g.current;
    const durationSec = Math.floor((Date.now() - gg.startTime) / 1000);
    setUi('loading'); setLoadingMsg('Grading your lesson…');
    let rec: any = {};
    try {
      rec = await Promise.race([
        API.post('/api/ai/recommend', { topic: gg.topic, concept: gg.grammarTopic || gg.language, level: gg.level, correct: gg.correct, total: gg.total, durationSec, slides: gg.answers }),
        new Promise((res) => setTimeout(() => res({}), 20000)),
      ]) as any;
    } catch { rec = {}; }
    if (!Array.isArray(rec.areaCompetency) || !rec.areaCompetency.length) {
      rec.areaCompetency = [{ area: `${gg.language} (${gg.level})`, score: gg.total ? Math.round((gg.correct / gg.total) * 100) : 50 }];
    }
    // Language proficiency ranking: estimated known vocabulary + suggested level.
    rec.languageProficiency = { language: gg.language, ...estimateProficiency(gg.level, gg.correct, gg.total) };
    let saveNote = '';
    try {
      await API.post('/api/games', {
        topic: `${gg.language} — ${gg.topic}`, concept: gg.grammarTopic || `${gg.language} lesson`, level: gg.level,
        settings: { activityType: 'language', counts: gg.counts },
        slides: gg.answers, correct: gg.correct, total: gg.total, durationSec,
        recommendations: rec, questionSummary: gg.answers.map((x: any) => x.question).filter(Boolean).join(', '),
        answerSummary: gg.answers.map((x: any) => x.chosen).filter(Boolean).join(', '), aiNotes: rec?.aiNotes || [],
      });
    } catch (e: any) { saveNote = `Could not save this run: ${e.message}`; }
    appState.game = null;
    setResults({ language: gg.language, level: gg.level, topic: gg.topic, correct: gg.correct, total: gg.total, rec, saveNote, stickies: gg.stickies });
    setUi('results');
  }, []);

  const advance = useCallback(async (res: SlideResult) => {
    const gg = g.current;
    gg.correct += res.correct; gg.total += res.total;
    for (const ans of res.answers) gg.answers.push(ans);
    if (cur?.sticky?.note) gg.stickies.push(cur.sticky);
    gg.idx += 1;
    if (gg.idx >= gg.plan.length) { finish(); return; }
    let next = gg.prefetch[gg.idx];
    if (!next) { setUi('loading'); setLoadingMsg('Turning the page…'); next = genSlide(gg.idx); gg.prefetch[gg.idx] = next; }
    else { setUi('loading'); setLoadingMsg('Turning the page…'); }
    try { const slide = await next; if (!slide) throw new Error('no slide'); show(slide); }
    catch (e: any) { setErr(e.message || 'Could not build the next slide.'); setUi('error'); }
  }, [cur, finish, genSlide, show]);

  const start = useCallback(async () => {
    const ll = appState.languageLesson;
    if (!ll) { app.nav('home'); return; }
    g.current = {
      id: crypto.randomUUID(), language: ll.language, level: ll.level, topic: ll.topic,
      grammarTopic: ll.grammarTopic, counts: ll.counts, plan: buildPlan(ll.counts),
      idx: 0, prefetch: {}, answers: [], correct: 0, total: 0, stickies: [], startTime: Date.now(),
    };
    setUi('loading'); setLoadingMsg('Preparing your first slide…');
    try { const slide = await genSlide(0); show(slide); }
    catch (e: any) { setErr(e.message || 'Could not start the lesson.'); setUi('error'); }
  }, [app, genSlide, show]);

  useEffect(() => { if (started.current) return; started.current = true; start(); }, [start]);

  if (ui === 'loading') return <Loading text={loadingMsg} />;
  if (ui === 'error') return (
    <div className="card">
      <p>😖 {err}</p>
      <div className="slide-actions">
        <button className="btn" onClick={() => { appState.game = null; app.nav('home'); }}>Quit</button>
        <button className="btn primary" onClick={() => { started.current = false; setUi('loading'); start(); }}>Try again</button>
      </div>
    </div>
  );
  if (ui === 'results' && results) return <LangResults r={results} onHome={() => app.nav('home')} onStats={() => app.nav('stats')} />;
  if (ui === 'slide' && cur) {
    const gg = g.current;
    const header = <SlideHeader idx={gg.idx} total={gg.plan.length} type={cur.type} />;
    const lang = langCode(gg.language);
    if (cur.type === 'grammar') return <>{header}<GrammarSlide slide={cur} onDone={advance} /></>;
    if (cur.type === 'vocabulary') return <>{header}<VocabSlide slide={cur} onDone={advance} lang={lang} /></>;
    if (cur.type === 'listening') return <>{header}<ListeningSlide slide={cur} onDone={advance} /></>;
    if (cur.type === 'spelling') return <>{header}<SpellingSlide slide={cur} onDone={advance} lang={lang} /></>;
    if (cur.type === 'writing') return <>{header}<WritingSlide slide={cur} onDone={advance} /></>;
    return <>{header}<ReadingSlide slide={cur} onDone={advance} /></>;
  }
  return <Loading text={loadingMsg} />;
}

function SlideHeader({ idx, total, type }: { idx: number; total: number; type: string }) {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <div style={{ maxWidth: 760, margin: '0 auto 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2 style={{ margin: 0, fontSize: '1.6rem' }}>{label}</h2>
      <span style={{ opacity: 0.7 }}>Slide {idx + 1} / {total}</span>
    </div>
  );
}

function Sticky({ sticky }: { sticky: any }) {
  if (!sticky?.note) return null;
  const bg: any = { yellow: '#fff8da', pink: '#ffe0ea', blue: '#e2ecff', green: '#e4f6e0', orange: '#ffe9d1' };
  return (
    <div style={{ background: bg[sticky.color] || bg.yellow, border: '2px dashed var(--ink)', borderRadius: 10, padding: '8px 12px', margin: '10px 0', transform: 'rotate(-0.6deg)' }}>
      {sticky.title && <b style={{ display: 'block' }}>{sticky.title}</b>}
      <span style={{ fontSize: '.95rem' }}>{sticky.note}</span>
    </div>
  );
}

function OptionButton({ opt, chosen, revealed, onClick }: any) {
  const cls = revealed ? (opt.correct ? 'btn green' : (chosen ? 'btn' : 'btn ghost')) : 'btn';
  return (
    <button className={cls} style={{ textAlign: 'left', width: '100%', marginBottom: 8, opacity: revealed && !opt.correct && !chosen ? 0.6 : 1 }}
      disabled={revealed} onClick={onClick}>{opt.text}{revealed && opt.correct ? ' ✓' : (revealed && chosen ? ' ✗' : '')}</button>
  );
}

// ---- Grammar: 4 questions, 2 options each, in-slide Next ----
function GrammarSlide({ slide, onDone }: any) {
  const [qi, setQi] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const acc = useRef<{ correct: number; answers: any[] }>({ correct: 0, answers: [] });
  const q = slide.questions[qi];
  const [opts] = useState<any[]>(() => shuffled(q.options.map((o: any, i: number) => ({ ...o, _i: i }))));
  const pick = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    const opt = opts[i];
    if (opt.correct) acc.current.correct += 1;
    acc.current.answers.push({ question: q.prompt, chosen: opt.text, correct: !!opt.correct, misconception: opt.correct ? '' : (opt.explanation || '') });
  };
  const next = () => {
    if (qi + 1 < slide.questions.length) { setQi(qi + 1); setChosen(null); }
    else onDone({ correct: acc.current.correct, total: slide.questions.length, answers: acc.current.answers });
  };
  return (
    <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
      <Sticky sticky={slide.sticky} />
      <p style={{ opacity: 0.7, fontSize: '.9rem' }}>Question {qi + 1} of {slide.questions.length}</p>
      <p style={{ fontWeight: 600 }}>{q.prompt}</p>
      {opts.map((o: any, i: number) => <OptionButton key={i} opt={o} chosen={chosen === i} revealed={chosen !== null} onClick={() => pick(i)} />)}
      {chosen !== null && (
        <>
          {opts[chosen].explanation && <p style={{ marginTop: 6, fontSize: '.95rem' }}>{opts[chosen].explanation}</p>}
          <div className="slide-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={next}>{qi + 1 < slide.questions.length ? 'Next question →' : 'Continue →'}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Reading: passage + support + 1 MCQ ----
function ReadingSlide({ slide, onDone }: any) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [opts] = useState<any[]>(() => shuffled((slide.quiz?.options || []).map((o: any, i: number) => ({ ...o, _i: i }))));
  const pick = (i: number) => { if (chosen === null) setChosen(i); };
  const done = () => onDone({ correct: chosen !== null && opts[chosen].correct ? 1 : 0, total: 1, answers: [{ question: slide.quiz?.question, chosen: chosen !== null ? opts[chosen].text : '', correct: chosen !== null && !!opts[chosen].correct, misconception: '' }] });
  return (
    <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
      {slide.title && <h3 style={{ marginTop: 0 }}>{slide.title}</h3>}
      <p style={{ whiteSpace: 'pre-wrap' }}>{slide.passage}</p>
      <Support support={slide.support} />
      <Sticky sticky={slide.sticky} />
      <p style={{ fontWeight: 600, marginTop: 10 }}>{slide.quiz?.question}</p>
      {opts.map((o: any, i: number) => <OptionButton key={i} opt={o} chosen={chosen === i} revealed={chosen !== null} onClick={() => pick(i)} />)}
      {chosen !== null && (
        <>
          {opts[chosen].explanation && <p style={{ marginTop: 6, fontSize: '.95rem' }}>{opts[chosen].explanation}</p>}
          <div className="slide-actions" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={done}>Continue →</button></div>
        </>
      )}
    </div>
  );
}

function Support({ support }: { support: any }) {
  if (!support) return null;
  if (support.type === 'image' && support.url) return <img src={support.url} alt={support.caption || ''} style={{ maxWidth: '100%', borderRadius: 10, border: '2px solid var(--ink)', margin: '10px 0' }} />;
  if (support.type === 'code') return <pre style={{ background: '#2d2a26', color: '#f7f3e9', padding: 12, borderRadius: 10, overflowX: 'auto', margin: '10px 0' }}><code>{support.content}</code></pre>;
  if (support.type === 'table' && Array.isArray(support.rows)) return (
    <div style={{ overflowX: 'auto', margin: '10px 0' }}><table className="sketch"><tbody>
      <tr>{(support.headers || []).map((h: string, i: number) => <th key={i}>{h}</th>)}</tr>
      {support.rows.map((r: any[], i: number) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
    </tbody></table>{support.caption && <p style={{ opacity: 0.7, fontSize: '.85rem' }}>{support.caption}</p>}</div>
  );
  return null;
}

// ---- Vocabulary: 4 items (2 MCQ + 2 typed, 3 tries) ----
function VocabSlide({ slide, onDone, lang }: any) {
  const [ii, setII] = useState(0);
  const acc = useRef<{ correct: number; answers: any[] }>({ correct: 0, answers: [] });
  const item = slide.items[ii];
  const advance = (rec: { correct: boolean; chosen: string }) => {
    if (rec.correct) acc.current.correct += 1;
    acc.current.answers.push({ question: item.question, chosen: rec.chosen, correct: rec.correct, misconception: '' });
    if (ii + 1 < slide.items.length) setII(ii + 1);
    else onDone({ correct: acc.current.correct, total: slide.items.length, answers: acc.current.answers });
  };
  return (
    <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
      {ii === 0 && <Sticky sticky={slide.sticky} />}
      <p style={{ opacity: 0.7, fontSize: '.9rem' }}>Item {ii + 1} of {slide.items.length}</p>
      {item.image && <img src={item.image} alt="" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '2px solid var(--ink)', display: 'block', margin: '0 auto 10px' }} />}
      {item.kind === 'input'
        ? <VocabInput key={ii} item={item} onDone={advance} lang={lang} />
        : <VocabMcq key={ii} item={item} onDone={advance} />}
    </div>
  );
}

function VocabMcq({ item, onDone }: any) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [opts] = useState<any[]>(() => shuffled((item.options || []).map((o: any, i: number) => ({ ...o, _i: i }))));
  return (
    <>
      <p style={{ fontWeight: 600 }}>{item.question}</p>
      {opts.map((o: any, i: number) => <OptionButton key={i} opt={o} chosen={chosen === i} revealed={chosen !== null} onClick={() => chosen === null && setChosen(i)} />)}
      {chosen !== null && (
        <div className="slide-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={() => onDone({ correct: !!opts[chosen].correct, chosen: opts[chosen].text })}>Next →</button>
        </div>
      )}
    </>
  );
}

// Typed answer with up to 3 tries; reveals the answer only on the 3rd miss.
function VocabInput({ item, onDone, lang }: any) {
  const [val, setVal] = useState('');
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [solved, setSolved] = useState<null | boolean>(null);
  const accept: string[] = Array.isArray(item.accept) && item.accept.length ? item.accept : [String(item.answer || '').toLowerCase()];
  const submit = () => {
    const guess = val.trim().toLowerCase();
    if (!guess) return;
    if (accept.includes(guess)) { setSolved(true); setFeedback('✓ Correct!'); return; }
    const t = tries + 1; setTries(t);
    if (t >= 3) { setSolved(false); setFeedback(`Not quite. The answer is "${item.answer}".`); }
    else setFeedback(`Not quite — try again (${3 - t} left).`);
  };
  return (
    <>
      <p style={{ fontWeight: 600 }}>{item.question}</p>
      {solved === null ? (
        <div className="slide-actions" style={{ gap: 8 }}>
          <input type="text" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} placeholder="Type or speak your answer…" style={{ flex: 1 }} />
          <MicButton lang={lang} onText={(t: string) => setVal(t)} />
          <button className="btn primary" onClick={submit}>Check</button>
        </div>
      ) : null}
      {feedback && <p style={{ marginTop: 8, color: solved === false ? 'var(--red)' : undefined }}>{feedback}</p>}
      {solved !== null && (
        <div className="slide-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={() => onDone({ correct: solved === true, chosen: val.trim() })}>Next →</button>
        </div>
      )}
    </>
  );
}

// ---- Listening: audio + 2 questions (4 options) ----
function ListeningSlide({ slide, onDone }: any) {
  const [qi, setQi] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const acc = useRef<{ correct: number; answers: any[] }>({ correct: 0, answers: [] });
  const q = slide.questions[qi];
  const [opts, setOpts] = useState<any[]>(() => shuffled(q.options.map((o: any, i: number) => ({ ...o, _i: i }))));
  const pick = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    if (opts[i].correct) acc.current.correct += 1;
    acc.current.answers.push({ question: q.prompt, chosen: opts[i].text, correct: !!opts[i].correct, misconception: '' });
  };
  const next = () => {
    if (qi + 1 < slide.questions.length) {
      const nq = slide.questions[qi + 1];
      setQi(qi + 1); setChosen(null); setOpts(shuffled(nq.options.map((o: any, i: number) => ({ ...o, _i: i }))));
    } else onDone({ correct: acc.current.correct, total: slide.questions.length, answers: acc.current.answers });
  };
  return (
    <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
      <Sticky sticky={slide.sticky} />
      <p style={{ fontWeight: 600 }}>Listen and answer</p>
      <AudioButton text={slide.audioText || slide.transcript} label="🔊 Play audio" />
      <p style={{ opacity: 0.7, fontSize: '.9rem' }}>Question {qi + 1} of {slide.questions.length}</p>
      <p style={{ fontWeight: 600 }}>{q.prompt}</p>
      {opts.map((o: any, i: number) => <OptionButton key={i} opt={o} chosen={chosen === i} revealed={chosen !== null} onClick={() => pick(i)} />)}
      {chosen !== null && (
        <>
          {opts[chosen].explanation && <p style={{ marginTop: 6, fontSize: '.95rem' }}>{opts[chosen].explanation}</p>}
          <div className="slide-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={next}>{qi + 1 < slide.questions.length ? 'Next question →' : 'Continue →'}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Spelling: 4 audios, type the word (3 tries) ----
function SpellingSlide({ slide, onDone, lang }: any) {
  const [ii, setII] = useState(0);
  const acc = useRef<{ correct: number; answers: any[] }>({ correct: 0, answers: [] });
  const item = slide.items[ii];
  const advance = (rec: { correct: boolean; chosen: string }) => {
    if (rec.correct) acc.current.correct += 1;
    acc.current.answers.push({ question: `Spell: ${item.usage || item.answer}`, chosen: rec.chosen, correct: rec.correct, misconception: '' });
    if (ii + 1 < slide.items.length) setII(ii + 1);
    else onDone({ correct: acc.current.correct, total: slide.items.length, answers: acc.current.answers });
  };
  return (
    <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
      {ii === 0 && <Sticky sticky={slide.sticky} />}
      <p style={{ opacity: 0.7, fontSize: '.9rem' }}>Word {ii + 1} of {slide.items.length}</p>
      <p style={{ fontWeight: 600 }}>Listen, then type the word you hear.</p>
      <AudioButton key={ii} text={item.audioText} label="🔊 Play word" />
      {item.usage && <p style={{ opacity: 0.75, fontSize: '.9rem' }}>Hint (meaning): {item.usage}</p>}
      <SpellInput key={`in-${ii}`} item={item} onDone={advance} lang={lang} />
    </div>
  );
}

function SpellInput({ item, onDone, lang }: any) {
  const [val, setVal] = useState('');
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [solved, setSolved] = useState<null | boolean>(null);
  const accept: string[] = Array.isArray(item.accept) && item.accept.length ? item.accept : [String(item.answer || '').toLowerCase()];
  const submit = () => {
    const guess = val.trim().toLowerCase();
    if (!guess) return;
    if (accept.includes(guess)) { setSolved(true); setFeedback('✓ Correct!'); return; }
    const t = tries + 1; setTries(t);
    if (t >= 3) { setSolved(false); setFeedback(`Not quite. The word is “${item.answer}”.`); }
    else setFeedback(`Not quite — try again (${3 - t} left).`);
  };
  return (
    <>
      {solved === null && (
        <div className="slide-actions" style={{ gap: 8 }}>
          <input type="text" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} placeholder="Type or speak the word…" style={{ flex: 1 }} />
          <MicButton lang={lang} onText={(t: string) => setVal(t)} />
          <button className="btn primary" onClick={submit}>Check</button>
        </div>
      )}
      {feedback && <p style={{ marginTop: 8, color: solved === false ? 'var(--red)' : undefined }}>{feedback}</p>}
      {solved !== null && (
        <div className="slide-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={() => onDone({ correct: solved === true, chosen: val.trim() })}>Next →</button>
        </div>
      )}
    </>
  );
}

// ---- Writing: trace/write a character or word on a canvas, self-check ----
function WritingSlide({ slide, onDone }: any) {
  const [drawing, setDrawing] = useState('');
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
      <Sticky sticky={slide.sticky} />
      <p style={{ fontWeight: 600 }}>✍️ Write it by hand — trace the character/word below.</p>
      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        <div style={{ fontSize: '3.4rem', lineHeight: 1.1 }}>{slide.target}</div>
        {slide.romanization && <div style={{ opacity: 0.75 }}>{slide.romanization}</div>}
        {slide.meaning && <div style={{ opacity: 0.9 }}>“{slide.meaning}”</div>}
        <div style={{ marginTop: 6 }}><AudioButton text={slide.audioText || slide.target} label="🔊 Hear it" small /></div>
      </div>
      {slide.tip && <p style={{ opacity: 0.75, fontSize: '.9rem' }}>✏️ {slide.tip}</p>}
      <DrawField label="Trace it here (then check your work)" value={drawing} onChange={setDrawing} />
      <div className="slide-actions" style={{ justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <button className="btn ghost" onClick={() => setRevealed(r => !r)}>{revealed ? 'Hide model' : 'Show model'}</button>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => onDone({ correct: 0, total: 1, answers: [{ question: `Write “${slide.target}”`, chosen: 'needs practice', correct: false, misconception: '' }] })}>Need more practice</button>
          <button className="btn primary" onClick={() => onDone({ correct: 1, total: 1, answers: [{ question: `Write “${slide.target}”`, chosen: 'wrote it', correct: true, misconception: '' }] })}>I wrote it ✓</button>
        </span>
      </div>
      {revealed && <div style={{ textAlign: 'center', fontSize: '4rem', marginTop: 8, opacity: 0.85 }}>{slide.target}</div>}
    </div>
  );
}

function LangResults({ r, onHome, onStats }: any) {
  const pct = r.total ? Math.round((r.correct / r.total) * 100) : 0;
  return (
    <div className="card" style={{ maxWidth: 760, margin: '0 auto' }}>
      <h2>🏁 {r.language} · {r.topic} — results</h2>
      <div className="stat-row">
        <div className="stat-tile"><div className="big">{r.correct}/{r.total}</div>correct</div>
        <div className="stat-tile"><div className="big">{pct}%</div>score</div>
        <div className="stat-tile"><div className="big">{r.level}</div>level</div>
      </div>
      {r.rec?.languageProficiency && (
        <p style={{ marginTop: 10 }}><b>Estimated vocabulary:</b> ~{r.rec.languageProficiency.estimatedWords} {r.language} words · at level <b>{r.rec.languageProficiency.level}</b>{r.rec.languageProficiency.suggestedLevel !== r.rec.languageProficiency.level ? <> → try <b>{r.rec.languageProficiency.suggestedLevel}</b> next</> : ''}</p>
      )}
      {Array.isArray(r.rec?.areaCompetency) && r.rec.areaCompetency.length > 0 && (
        <p style={{ marginTop: 6 }}><b>Competency:</b> {r.rec.areaCompetency.map((c: any) => `${c.area}: ${c.score}/100`).join(' · ')}</p>
      )}
      {Array.isArray(r.rec?.aiNotes) && r.rec.aiNotes.length > 0 && (
        <div style={{ marginTop: 8 }}><b>Coach notes:</b><ul style={{ paddingLeft: 22 }}>{r.rec.aiNotes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></div>
      )}
      {r.saveNote && <p className="form-error">{r.saveNote}</p>}
      <div className="slide-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
        <button className="btn" onClick={onHome}>Home</button>
        <button className="btn primary" onClick={onStats}>My stats →</button>
      </div>
    </div>
  );
}
