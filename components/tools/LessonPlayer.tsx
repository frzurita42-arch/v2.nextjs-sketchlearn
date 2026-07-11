'use client';
/* A lesson tool is a general-purpose lesson generator. Its page is a HUB
 * (create form + activity feed + refreshable AI example). Playing an activity
 * runs a scored slide deck — ONE question per slide — that can mix multiple-
 * choice (2/4 options), fill-in-the-blank, typed short-answer, hand-written
 * worked answers on a paper pad (AI-graded), single-character handwriting
 * (AI-graded) and code/text answers (AI-graded). A single, clear navigation bar
 * (Back · Check with AI · Next · Finish) drives the whole deck, with each button
 * enabled only when it applies and showing a spinner while it works. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { defaultsFor } from '@/lib/tool-schema';
import { ToolFields } from '@/components/tools/ToolFields';
import { RichText } from '@/components/tools/RichText';
import { DrawField } from '@/components/tools/MediaFields';
import { AudioButton } from '@/components/ui/AudioButton';
import { AnnotationPad, compositePages } from '@/components/tools/AnnotationPad';
import { CanvasConversation } from '@/components/tools/CanvasConversation';
import { renderMath, renderInlineMath } from '@/components/ui/shared';

// Inline text that typesets any $...$ LaTeX segments (math/science prompts).
function MathText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderInlineMath(String(text || '')) }} />;
}

type Q = { kind: string; prompt: string; options?: any[]; answer?: string; accept?: string[]; explanation?: string; target?: string; language?: string; starter?: string };
type Slide = { title: string; content: string; translation?: string; support?: any; questions: Q[]; fallback?: boolean };
type Cfg = Record<string, any>;
// Per-slide result recorded once the slide's question reaches a terminal state.
type Res = { answered: boolean; correct: boolean; checked?: boolean; feedback?: string; score?: number | null; detail: any };

function shuffle<T>(a: T[]): T[] { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// A small inline spinner shown on a button while it is loading.
function Spinner() {
  return <span aria-hidden style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'sl-spin 0.7s linear infinite', verticalAlign: '-1px', marginRight: 6 }} />;
}

function Support({ s }: { s: any }) {
  if (!s) return null;
  if (s.type === 'image' && s.url) return <img src={s.url} alt={s.caption || ''} style={{ width: '100%', maxWidth: 360, borderRadius: 8, border: '2px solid var(--ink)', margin: '8px auto', display: 'block' }} />;
  if (s.type === 'code') return <pre style={{ background: '#2d2a26', color: '#f7f3e9', padding: 12, borderRadius: 8, overflowX: 'auto', overflowY: 'auto', maxHeight: 320, fontSize: 13, margin: '8px 0' }}><code>{s.code}</code></pre>;
  if (s.type === 'table') return (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table className="sketch-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{(s.headers || []).map((h: string, i: number) => <th key={i} style={{ textAlign: 'left', borderBottom: '2px solid var(--ink)', padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>{(s.rows || []).map((r: any[], i: number) => <tr key={i}>{(Array.isArray(r) ? r : []).map((c, j) => <td key={j} style={{ borderBottom: '1px solid rgba(0,0,0,0.15)', padding: 6 }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  if (s.type === 'formula') return (
    <div style={{ margin: '8px 0', padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1.5px solid var(--ink)', borderRadius: 8, textAlign: 'center', overflowX: 'auto' }}>
      <div style={{ fontSize: 18 }} dangerouslySetInnerHTML={{ __html: renderMath(s.latex, true) }} />
      {s.caption && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{s.caption}</div>}
    </div>
  );
  if (s.type === 'wolfram') {
    const steps = Array.isArray(s.steps) ? s.steps : [];
    return (
      <div style={{ margin: '8px 0', padding: '10px 12px', background: 'rgba(0,0,0,0.04)', border: '1.5px solid var(--ink)', borderRadius: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>⚡ WOLFRAM ALPHA</div>
        {s.latex && <div style={{ fontSize: 18, textAlign: 'center', margin: '4px 0', overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: renderMath(s.latex, true) }} />}
        {s.query && <div style={{ fontSize: 12, opacity: 0.7 }}>Query: <code>{s.query}</code></div>}
        {s.result && <div style={{ fontSize: 15, marginTop: 4 }}>= <b>{s.result}</b></div>}
        {/* Step-by-step working / pods — a fixed window you scroll through. */}
        {steps.length > 0 && (
          <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8, borderTop: '1px dashed var(--ink)', paddingTop: 8 }}>
            {steps.map((p: any, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}>
                {p.title && <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>{p.title}</div>}
                <pre style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.4 }}>{p.text}</pre>
              </div>
            ))}
          </div>
        )}
        {s.caption && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{s.caption}</div>}
      </div>
    );
  }
  return null;
}

// ---- Self-resolving questions (mcq / fill-blank / input) — no AI check. ----
// Report the outcome via onDone(correct, detail).
function ChoiceQuestion({ q, translateTo, onDone }: { q: Q; translateTo: string; onDone: (correct: boolean, detail: any) => void }) {
  const [opts] = useState<any[]>(() => q.kind === 'mcq' ? shuffle(q.options || []) : []);
  const [picked, setPicked] = useState<number | null>(null);
  const [val, setVal] = useState('');
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<'open' | 'right' | 'wrong'>('open');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const finish = (correct: boolean, detail: any) => { if (state === 'open') { setState(correct ? 'right' : 'wrong'); onDone(correct, detail); } };

  if (q.kind === 'mcq') {
    const answered = picked !== null;
    const correctText = (opts.find((o: any) => o.correct) || {}).text || '';
    return (
      <div>
        <p style={{ fontWeight: 600, textAlign: 'center', margin: '0 0 10px' }}><MathText text={q.prompt} /></p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 460, margin: '0 auto' }}>
          {opts.map((o: any, i: number) => {
            const isP = picked === i;
            const bg = !answered ? undefined : o.correct ? 'rgba(127,176,105,0.25)' : (isP ? 'rgba(228,87,46,0.2)' : undefined);
            return <button key={i} className="btn" style={{ textAlign: 'left', width: '100%', background: bg, borderColor: answered && o.correct ? 'var(--ink)' : undefined }} disabled={answered}
              onClick={() => { setPicked(i); finish(!!o.correct, { prompt: q.prompt, your: o.text, answer: correctText, correct: !!o.correct }); }}>{o.correct && answered ? '✓ ' : (isP && !o.correct ? '✗ ' : '')}<MathText text={o.text} /></button>;
          })}
        </div>
        {answered && opts[picked!]?.explanation && <p style={{ fontSize: 14, opacity: 0.85, marginTop: 10, textAlign: 'center' }}>{opts[picked!].explanation}</p>}
      </div>
    );
  }
  // fill-blank / input — typed answer. Exact match is instant; otherwise the AI
  // judges whether the free-text answer is valid (accepts the learner's own
  // wording / paraphrases), then we move on. 3 tries before revealing.
  const accept = (q.accept && q.accept.length ? q.accept : [q.answer || '']).map(s => String(s).toLowerCase());
  const check = async () => {
    if (aiBusy) return;
    const v = val.trim();
    if (accept.includes(v.toLowerCase())) { finish(true, { prompt: q.prompt, your: v, answer: q.answer || '', correct: true }); return; }
    // Ask the AI whether this free-text answer is acceptable.
    if (v && q.answer) {
      setAiBusy(true); setAiNote('');
      try {
        const r = await API.post('/api/tools/lesson/check-code', { prompt: q.prompt, answer: q.answer, code: v }, { retries: 1 });
        setAiBusy(false);
        // Only trust a REAL AI grade (checked). Without AI, fall through to tries.
        if (r?.checked && r?.correct) { finish(true, { prompt: q.prompt, your: v, answer: q.answer || '', correct: true, feedback: r.feedback }); return; }
        if (r?.checked && r?.feedback) setAiNote(r.feedback);
      } catch { setAiBusy(false); }
    }
    const t = tries + 1; setTries(t);
    if (t >= 3) finish(false, { prompt: q.prompt, your: v || '(no answer)', answer: q.answer || '', correct: false });
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontWeight: 600, margin: '0 0 8px' }}>{q.kind === 'fill-blank' ? '✍️ Fill in the blank' : '⌨️ Your answer'}: <MathText text={q.prompt} /></p>
      <div className="chat-input-row" style={{ maxWidth: 420, margin: '0 auto' }}>
        <input type="text" value={val} disabled={state !== 'open' || aiBusy} placeholder="Type or speak (🎤) your answer…"
          onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); check(); } }} />
        {state === 'open' && <button className="btn primary" disabled={aiBusy} onClick={check}>{aiBusy ? <><Spinner />Checking…</> : 'Check'}</button>}
      </div>
      {state === 'open' && aiNote && <p style={{ fontSize: 13, opacity: 0.85 }}>{aiNote}</p>}
      {state === 'open' && tries > 0 && <p style={{ fontSize: 13, color: 'var(--danger,#e4572e)' }}>Not quite — {3 - tries} {3 - tries === 1 ? 'try' : 'tries'} left.</p>}
      {state === 'right' && <p style={{ fontSize: 14, color: 'var(--accent,#5c80bc)' }}>✓ Correct!</p>}
      {state === 'wrong' && <p style={{ fontSize: 14 }}>Answer: <b>{q.answer}</b> <RichText text={String(q.answer || '')} translateTo={translateTo} /></p>}
    </div>
  );
}

// ---- AI-checked collectors: they gather an answer and report it up via
// onAnswer({ kind, ready, ... }). The player's nav "Check with AI" grades it. ----

function WritingCollector({ q, translateTo, onAnswer }: { q: Q; translateTo: string; onAnswer: (p: any) => void }) {
  const [drawing, setDrawing] = useState('');
  const [meaning, setMeaning] = useState('');
  const [trBusy, setTrBusy] = useState(false);
  const target = String(q.target || '');
  useEffect(() => { onAnswer({ kind: 'writing', prompt: q.prompt || 'Write it', target, image: drawing, ready: !!drawing }); /* eslint-disable-next-line */ }, [drawing]);

  const translate = async () => {
    setTrBusy(true);
    try { const r = await API.post('/api/tools/translate', { text: target, to: translateTo }); setMeaning(r?.translation || ''); } catch { /* ignore */ }
    setTrBusy(false);
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontWeight: 600, margin: '0 0 4px' }}>✍️ {q.prompt || 'Write this by hand'}</p>
      <div style={{ fontSize: '4.2rem', lineHeight: 1.1, margin: '2px 0 6px' }}>{target}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        <AudioButton text={target} label="🔊 Hear" small showTextOnFail={false} />
        <button className="btn small ghost" disabled={trBusy} onClick={translate}>{trBusy ? '…' : '🌐 Meaning'}</button>
      </div>
      {meaning && <p style={{ fontSize: 13, opacity: 0.8, marginTop: -4 }}>“{meaning}”</p>}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DrawField label="Trace / write it here" value={drawing} onChange={setDrawing} />
      </div>
    </div>
  );
}

function AnnotationCollector({ q, onAnswer }: { q: Q; onAnswer: (p: any) => void }) {
  const getPagesRef = useRef<null | (() => string[])>(null);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const emit = (rdy: boolean, txt: string) => onAnswer({ kind: 'annotation', prompt: q.prompt || 'Worked answer', answer: q.answer || '', getPages: getPagesRef.current, text: txt, ready: rdy || !!txt.trim() });
  useEffect(() => { emit(ready, text); /* eslint-disable-next-line */ }, [ready, text]);

  // Open every page in a print window (learner can Save-as-PDF / print).
  const download = () => {
    const pages = (getPagesRef.current ? getPagesRef.current() : []).filter(Boolean);
    if (!pages.length) { alert('Nothing written yet.'); return; }
    printPages(q.prompt || 'My work', pages);
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontWeight: 600, margin: '0 0 10px' }}>📝 <MathText text={q.prompt || 'Work out the full answer on the pad:'} /></p>
      <AnnotationPad onReady={(fn) => { getPagesRef.current = fn; emit(ready, text); }} onChange={() => setReady(true)} />
      {/* Optional: type the answer instead of / alongside drawing. The keyboard's
          mic 🎤 dictates into this box, so answers can be spoken too. */}
      <div style={{ maxWidth: 520, margin: '10px auto 0' }}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="…or type your answer here (use your keyboard's 🎤 to speak it)"
          style={{ width: '100%', minHeight: 54, resize: 'vertical', fontSize: 14, padding: 8, borderRadius: 8, border: '1.5px solid var(--ink)', boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="btn small ghost" onClick={download}>📄 Download pages (PDF)</button>
      </div>
    </div>
  );
}

function CodeCollector({ q, onAnswer }: { q: Q; onAnswer: (p: any) => void }) {
  const [code, setCode] = useState(String(q.starter || ''));
  useEffect(() => { onAnswer({ kind: 'code', prompt: q.prompt || '', answer: q.answer || '', code, language: q.language || '', ready: code.trim().length > 0 }); /* eslint-disable-next-line */ }, [code]);
  return (
    <div>
      <p style={{ fontWeight: 600, textAlign: 'center', margin: '0 0 8px' }}>⌨️ <MathText text={q.prompt || 'Write your answer'} /></p>
      <textarea value={code} onChange={e => setCode(e.target.value)} spellCheck={false}
        placeholder={q.language ? `Write your ${q.language} here…` : 'Write your working / answer here… (you can include proofs with comments)'}
        style={{ width: '100%', minHeight: 200, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 14, lineHeight: 1.5, padding: 12, borderRadius: 8, border: '2px solid var(--ink)', background: '#2d2a26', color: '#f7f3e9', boxSizing: 'border-box' }} />
      {q.language && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Language: {q.language}</div>}
    </div>
  );
}

// Print/download a set of page images (Save-as-PDF from the print dialog).
function printPages(title: string, pages: string[]) {
  const w = window.open('', '_blank'); if (!w) return;
  const imgs = pages.map((p, i) => `<figure><img src="${p}"/><figcaption>Page ${i + 1} / ${pages.length}</figcaption></figure>`).join('');
  w.document.write(`<!doctype html><title>${String(title).replace(/</g, '&lt;')}</title><style>body{font-family:Georgia,serif;margin:24px;text-align:center}h1{font-size:18px}figure{margin:0 0 24px;page-break-after:always}img{width:100%;max-width:640px;border:1px solid #ccc}figcaption{font-size:12px;color:#666;margin-top:4px}@media print{h1{display:none}}</style><h1>${String(title).replace(/</g, '&lt;')}</h1>${imgs}<script>onload=()=>setTimeout(print,300)</script>`);
  w.document.close();
}

// Read-only summary of an already-answered slide (for Back navigation + report).
function ReviewCard({ res }: { res: Res }) {
  const d = res.detail || {};
  return (
    <div style={{ textAlign: 'center' }}>
      {d.prompt && <p style={{ fontWeight: 600, margin: '0 0 8px' }}>{d.prompt}</p>}
      <p style={{ fontSize: 15 }}>{res.correct ? '✓ ' : '✗ '}{res.feedback || (res.correct ? 'Correct.' : 'Reviewed.')}{typeof res.score === 'number' ? ` (${res.score}/100)` : ''}</p>
      {d.image && <img src={d.image} alt="your work" style={{ width: '100%', maxWidth: 320, border: '2px solid var(--ink)', borderRadius: 8, margin: '8px auto', display: 'block' }} />}
      {d.code && <pre style={{ textAlign: 'left', background: '#2d2a26', color: '#f7f3e9', padding: 12, borderRadius: 8, overflowX: 'auto', overflowY: 'auto', maxHeight: 300, fontSize: 13 }}><code>{d.code}</code></pre>}
      {!d.image && !d.code && d.your && <p style={{ fontSize: 13 }}>Your answer: <b>{d.your}</b></p>}
      {!res.correct && d.answer && <p style={{ fontSize: 13, color: 'var(--accent,#5c80bc)' }}>Expected: <b>{d.answer}</b></p>}
      {Array.isArray(d.pages) && d.pages.length > 0 && <button className="btn small ghost" style={{ marginTop: 6 }} onClick={() => printPages(d.prompt || 'My work', d.pages)}>📄 Download pages (PDF)</button>}
    </div>
  );
}

export function LessonPlayer({ def, slug }: { def: any; slug: string }) {
  const lesson = def?.lesson || {};
  // Conversation / journal modes are a growing canvas thread, not a slide deck.
  if (lesson.mode === 'conversation' || lesson.mode === 'journal') {
    return <CanvasConversation def={def} slug={slug} />;
  }
  const settings = Array.isArray(def?.settings) ? def.settings : [];
  const levelField = settings.find((f: any) => f.id === 'level' || f.id === 'difficulty');
  const levels: string[] = levelField?.options?.length ? levelField.options : ['Beginner', 'A1', 'A2', 'B1', 'B2', 'C1'];

  const [phase, setPhase] = useState<'hub' | 'play' | 'done'>('hub');
  const [form, setForm] = useState<Cfg>(() => defaultsFor(settings));
  const [activities, setActivities] = useState<any[]>([]);
  const [example, setExample] = useState<any>(null);
  const [exBusy, setExBusy] = useState(false);

  const [cfg, setCfg] = useState<Cfg>({});
  const total = () => Math.max(1, Math.min(15, parseInt(cfg.slides, 10) || parseInt(lesson.totalSlides, 10) || 5));
  const [slides, setSlides] = useState<(Slide | null)[]>([]);   // cached by 0-based index
  const [cur, setCur] = useState(0);
  const [results, setResults] = useState<Record<number, Res>>({});
  const [pending, setPending] = useState<any>(null);            // current AI answer payload
  const [genBusy, setGenBusy] = useState(false);                // fetching a slide
  const [checking, setChecking] = useState(false);              // AI grading in progress
  const [err, setErr] = useState('');
  const [showReview, setShowReview] = useState(false);
  // Refs let the background prefetch read the latest state without stale closures.
  const slidesRef = useRef<(Slide | null)[]>([]);
  const cfgRef = useRef<Cfg>({});
  const prefetching = useRef<Record<number, Promise<void> | undefined>>({});
  useEffect(() => { slidesRef.current = slides; }, [slides]);

  // Quietly load slide `idx` in the BACKGROUND (no spinner), so Next is instant
  // for EVERY answer type — including AI-checked ones that don't block on it.
  const prefetch = (idx: number): Promise<void> | undefined => {
    if (idx < 0 || idx >= total() || slidesRef.current[idx] || prefetching.current[idx]) return prefetching.current[idx];
    const p = (async () => {
      try {
        const prior = slidesRef.current.filter(Boolean).map((s) => (s as Slide).title);
        const r = await API.post('/api/tools/lesson/slide', { lesson, values: cfgRef.current, slideNumber: idx + 1, priorSummary: prior.slice(-6).join('; ') });
        setSlides((sc) => { if (sc[idx]) return sc; const n = [...sc]; n[idx] = r; return n; });
      } catch { /* goNext will fetch on demand if this failed */ }
      finally { delete prefetching.current[idx]; }
    })();
    prefetching.current[idx] = p;
    return p;
  };

  const loadActivities = async () => {
    try { const r = await API.get(`/api/tools/entries?slug=${encodeURIComponent(slug)}`); setActivities(shuffle(Array.isArray(r?.entries) ? r.entries : [])); } catch { /* ignore */ }
  };
  const refreshExample = async () => {
    setExBusy(true);
    try { const r = await API.post('/api/tools/lesson/suggest', { lesson, levels, avoid: example?.topic || '' }); setExample(r); } catch { /* ignore */ }
    setExBusy(false);
  };
  useEffect(() => { loadActivities(); refreshExample(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  // Fetch slide `idx` (0-based) into the cache. Returns true on success.
  const fetchInto = async (idx: number, useCfg: Cfg, prior: string[]): Promise<boolean> => {
    cfgRef.current = useCfg;
    setGenBusy(true); setErr('');
    try {
      const r = await API.post('/api/tools/lesson/slide', { lesson, values: useCfg, slideNumber: idx + 1, priorSummary: prior.slice(-6).join('; ') });
      setSlides(sc => { const n = [...sc]; n[idx] = r; slidesRef.current = n; return n; });
      setGenBusy(false);
      prefetch(idx + 1);               // start loading the NEXT slide in the background
      return true;
    } catch (e: any) { setErr(e?.message || 'Could not load the slide.'); setGenBusy(false); return false; }
  };

  const play = (c: Cfg) => {
    cfgRef.current = c; slidesRef.current = []; prefetching.current = {};
    setCfg(c); setSlides([]); setResults({}); setCur(0); setPending(null); setShowReview(false); setErr(''); setPhase('play');
    fetchInto(0, c, []);
  };

  const createAndPlay = async () => {
    const c: Cfg = { ...form, level: form.level || form.difficulty || levels[0], topic: form.topic || '' };
    try { await API.post('/api/tools/entries', { slug, data: c }); } catch { /* ignore */ }
    loadActivities();
    play(c);
  };

  const record = (idx: number, res: Res) => setResults(r => ({ ...r, [idx]: res }));

  // mcq / fill-blank / input resolve themselves here.
  const onChoiceDone = (correct: boolean, detail: any) => record(cur, { answered: true, correct, checked: true, detail });

  // The nav "Check with AI" grades the current AI answer payload.
  const checkCurrent = async () => {
    const p = pending; if (!p) return;
    setChecking(true);
    try {
      let r: any, detail: any;
      if (p.kind === 'annotation') {
        const pages = (p.getPages ? p.getPages() : []).filter(Boolean);
        const image = await compositePages(pages);
        r = await API.post('/api/tools/lesson/check-annotation', { prompt: p.prompt, answer: p.answer, image, text: p.text || '' });
        detail = { prompt: p.prompt, your: p.text ? p.text : '📝 your written pages', answer: p.answer || '', correct: !!r.correct, image: image || undefined, pages, feedback: r.feedback };
      } else if (p.kind === 'code') {
        r = await API.post('/api/tools/lesson/check-code', { prompt: p.prompt, answer: p.answer, code: p.code, language: p.language });
        detail = { prompt: p.prompt, your: p.code, answer: p.answer || '', correct: !!r.correct, code: p.code, feedback: r.feedback };
      } else {
        r = await API.post('/api/tools/lesson/check-writing', { target: p.target, image: p.image });
        detail = { prompt: p.prompt, your: '✍️ your drawing', answer: p.target || '', correct: !!r.correct, image: p.image, feedback: r.feedback };
      }
      record(cur, { answered: true, correct: !!r.correct, checked: r.checked, feedback: r.feedback, score: r.score, detail });
      setPending(null);
    } catch {
      record(cur, { answered: true, correct: true, checked: false, feedback: 'Saved.', detail: { prompt: p.prompt, your: '(saved)', answer: '', correct: true } });
      setPending(null);
    }
    setChecking(false);
  };

  const goBack = () => { if (cur > 0) { setPending(null); setCur(cur - 1); prefetch(cur); } };
  const goNext = async () => {
    const nxt = cur + 1;
    if (nxt >= total()) return;
    setPending(null);
    // Usually the next slide was already prefetched -> instant. Otherwise wait for
    // an in-flight prefetch (or start one) with a spinner.
    if (slidesRef.current[nxt]) { setCur(nxt); prefetch(nxt + 1); return; }
    setGenBusy(true); setErr('');
    await (prefetching.current[nxt] || prefetch(nxt));
    setGenBusy(false);
    if (slidesRef.current[nxt]) { setCur(nxt); prefetch(nxt + 1); }
    else setErr('Could not load the next slide. Tap Next to retry.');
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
    const list = Object.keys(results).map(k => Number(k)).sort((a, b) => a - b).map(k => results[k]);
    const answeredCount = list.filter(r => r.answered).length;
    const scoreCount = list.filter(r => r.correct).length;
    const pct = answeredCount ? Math.round((scoreCount / answeredCount) * 100) : 0;
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Lesson complete 🎉</h2>
          <p style={{ fontSize: 14, opacity: 0.7 }}>{label(cfg)}</p>
          <p style={{ fontSize: 20 }}>You scored <b>{scoreCount}/{answeredCount}</b> ({pct}%)</p>
          <button className="btn small ghost" onClick={() => setShowReview(v => !v)}>{showReview ? 'Hide review' : '🔎 Review your answers'}</button>
        </div>
        {showReview && (
          <div className="card alt" style={{ padding: '14px 16px', marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px' }}>Your answers</h4>
            {list.length === 0 ? <p style={{ opacity: 0.6, fontSize: 13 }}>No questions recorded.</p> : list.map((res, i) => {
              const r = res.detail || {};
              return (
                <div key={i} style={{ borderTop: i ? '1px dashed var(--ink)' : 'none', padding: '10px 0' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{i + 1}. {r.prompt}</div>
                  <div style={{ fontSize: 13 }}>{res.correct ? '✓' : '✗'} {res.feedback || ''}</div>
                  {r.image && <img src={r.image} alt="your work" style={{ width: '100%', maxWidth: 260, border: '2px solid var(--ink)', borderRadius: 8, margin: '6px 0', display: 'block' }} />}
                  {r.code && <pre style={{ background: '#2d2a26', color: '#f7f3e9', padding: 10, borderRadius: 8, overflowX: 'auto', overflowY: 'auto', maxHeight: 260, fontSize: 12 }}><code>{r.code}</code></pre>}
                  {!r.image && !r.code && r.your && <div style={{ fontSize: 13 }}>Your answer: <b>{r.your}</b></div>}
                  {!res.correct && r.answer && <div style={{ fontSize: 13, color: 'var(--accent,#5c80bc)' }}>Expected: <b>{r.answer}</b></div>}
                  {Array.isArray(r.pages) && r.pages.length > 0 && <button className="btn small ghost" style={{ marginTop: 4 }} onClick={() => printPages(r.prompt || 'My work', r.pages)}>📄 Download pages (PDF)</button>}
                </div>
              );
            })}
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
  const tot = total();
  const curSlide = slides[cur];
  const curQ = curSlide?.questions?.[0];
  const isAI = !!curQ && ['writing', 'annotation', 'code'].includes(curQ.kind);
  const res = results[cur];
  const answered = !!res?.answered;
  const isLast = cur >= tot - 1;
  const anyBusy = genBusy || checking;
  const canBack = cur > 0 && !anyBusy;
  const canCheck = isAI && !answered && !!(pending && pending.ready) && !anyBusy;
  const canNext = answered && !isLast && !anyBusy;
  const canFinish = answered && isLast && !anyBusy;
  const isAnnotation = curQ?.kind === 'annotation';
  const isWritingSlide = !!curQ && ['writing', 'annotation'].includes(curQ.kind);
  const scoreSoFar = Object.values(results).filter(r => r.correct).length;

  return (
    <div>
      <style>{'@keyframes sl-spin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn small ghost" onClick={() => { setPhase('hub'); loadActivities(); }}>← Lessons</button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>{label(cfg)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Slide {cur + 1} / {tot}</span>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Score: {scoreSoFar}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden', border: '1.5px solid var(--ink)', marginBottom: 12 }}>
        <div style={{ width: `${((cur + 1) / tot) * 100}%`, height: '100%', background: 'var(--accent,#5c80bc)' }} />
      </div>

      {genBusy && !curSlide && <p style={{ opacity: 0.7, textAlign: 'center' }}><Spinner />Generating slide…</p>}
      {err && !curSlide && <p style={{ color: 'var(--danger,#e4572e)' }}>{err} <button className="btn small" onClick={() => fetchInto(cur, cfg, slides.filter(Boolean).map(s => (s as Slide).title))}>Retry</button></p>}

      {curSlide && (
        <div className="card" style={{ padding: '16px 18px', maxWidth: isAnnotation ? 900 : 560, margin: '0 auto' }}>
          {curSlide.fallback && <p style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.7, textAlign: 'center' }}>Demo slide (no AI connected).</p>}
          <h3 style={{ marginTop: 0, textAlign: 'center' }}>{curSlide.title}</h3>
          {curSlide.content && (isWritingSlide
            ? <p style={{ fontSize: 15, lineHeight: 1.6, textAlign: 'center', opacity: 0.9 }}>{curSlide.content}</p>
            : <p style={{ fontSize: 16, lineHeight: 1.6 }}><RichText text={curSlide.content} translateTo={lesson.translateTo || 'English'} /></p>)}
          <Support s={curSlide.support} />

          <div style={{ marginTop: 14, borderTop: '2px dashed var(--ink)', paddingTop: 14 }}>
            {answered ? <ReviewCard res={res!} />
              : curQ ? (
                curQ.kind === 'writing' ? <WritingCollector key={cur} q={curQ} onAnswer={setPending} translateTo={lesson.translateTo || 'English'} />
                  : curQ.kind === 'annotation' ? <AnnotationCollector key={cur} q={curQ} onAnswer={setPending} />
                    : curQ.kind === 'code' ? <CodeCollector key={cur} q={curQ} onAnswer={setPending} />
                      : <ChoiceQuestion key={cur} q={curQ} translateTo={lesson.translateTo || 'English'} onDone={onChoiceDone} />
              ) : <p style={{ opacity: 0.6, textAlign: 'center' }}>No question on this slide.</p>}
          </div>

          {/* The single, clear navigation bar — one place, always the same order. */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16, borderTop: '1.5px solid rgba(0,0,0,0.12)', paddingTop: 14 }}>
            <button className="btn" disabled={!canBack} onClick={goBack}>← Back</button>
            {isAI && <button className="btn green" disabled={!canCheck} onClick={checkCurrent}>{checking ? <><Spinner />Checking…</> : '✅ Check with AI'}</button>}
            <button className="btn blue" disabled={!canNext} onClick={goNext}>{genBusy && curSlide ? <><Spinner />Loading…</> : 'Next →'}</button>
            <button className="btn green" disabled={!canFinish} onClick={() => setPhase('done')}>🏁 Finish</button>
          </div>
          {!answered && isAI && <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 6 }}>Write your answer, then press <b>Check with AI</b>.</p>}
          {!answered && !isAI && curQ && <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 6 }}>Answer the question to unlock {isLast ? 'Finish' : 'Next'}.</p>}
        </div>
      )}
    </div>
  );
}
