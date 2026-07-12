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
import { renderMath, renderInlineMath, renderMathProse } from '@/components/ui/shared';

// Subject categories every generation is filed under (feed filter + create form).
const GEN_CATEGORIES = ['Science', 'Technology', 'Mathematics', 'Language Learning', 'History & Geography', 'Arts & Music', 'Productivity', 'Games & Fun', 'Health & Wellbeing', 'Business & Finance'];

// Inline text that typesets any $...$ LaTeX segments (math/science prompts).
function MathText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderInlineMath(String(text || '')) }} />;
}

type Q = { kind: string; prompt: string; options?: any[]; answer?: string; accept?: string[]; explanation?: string; target?: string; language?: string; starter?: string };
// `support` is a single pre-built block (fallback/legacy). `supportPlan` lists
// the support TYPES to fetch one-by-one via /api/tools/lesson/support; each is
// streamed in with its own spinner and cached on `_supports`.
type Slide = { title: string; content: string; translation?: string; support?: any; supportPlan?: string[]; _supports?: any[]; questions: Q[]; fallback?: boolean };
type Cfg = Record<string, any>;
// A slide can hold several questions shown stacked at once; we store each
// answered question's detail keyed by its index and mark the slide `done` once
// every question has been answered.
type SlideRes = { answers: Record<number, any>; done: boolean };

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

// A dashed placeholder shown while one support material is being generated.
function SupportSkeleton({ type }: { type: string }) {
  const label = ({ image: 'illustration', code: 'code snippet', table: 'table', formula: 'formula', wolfram: 'step-by-step solution' } as Record<string, string>)[type] || 'material';
  return (
    <div style={{ margin: '8px 0', padding: '14px 16px', border: '1.5px dashed var(--ink)', borderRadius: 8, textAlign: 'center', opacity: 0.7, fontSize: 13 }}>
      <Spinner />Sketching {label}…
    </div>
  );
}

// Streams a slide's support materials in, one request per planned type, each
// rendering into its own spinner placeholder. Loaded materials are cached on the
// slide object so navigating back/forward doesn't refetch them.
function SupportsLoader({ slide, ctx }: { slide: Slide; ctx: any }) {
  const plan: string[] = Array.isArray(slide.supportPlan) ? slide.supportPlan : [];
  const [items, setItems] = useState<any[]>(() => (slide._supports ? slide._supports.slice() : plan.map(() => undefined)));

  useEffect(() => {
    if (!plan.length) return;
    const sl = slide as any;
    if (!sl._supports || sl._supports.length !== plan.length) sl._supports = plan.map(() => undefined);
    // Cache the in-flight request per index so each support is fetched exactly
    // once, even across remounts (e.g. React StrictMode double-invoking effects).
    if (!sl._supportP || sl._supportP.length !== plan.length) sl._supportP = plan.map(() => undefined);
    setItems(sl._supports.slice());
    let alive = true;
    const sync = () => { if (alive) setItems(sl._supports.slice()); };
    plan.forEach((type, i) => {
      if (sl._supports[i] !== undefined) return; // already loaded (or failed)
      if (!sl._supportP[i]) {
        sl._supportP[i] = API.post('/api/tools/lesson/support', { lesson: ctx.lesson, values: ctx.values, type, content: slide.content, title: slide.title })
          .then((r: any) => { sl._supports[i] = r?.support || null; })
          .catch(() => { sl._supports[i] = null; });
      }
      sl._supportP[i].then(sync); // this mount re-renders when the request resolves
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  // Fallback / legacy: a single pre-built support and no plan.
  if (!plan.length) return <Support s={slide.support} />;
  return (
    <>
      {plan.map((type, i) => {
        const it = items[i];
        if (it === undefined) return <SupportSkeleton key={i} type={type} />;
        if (!it) return null; // failed or empty — drop the card
        return <Support key={i} s={it} />;
      })}
    </>
  );
}

// Decorations placed on a slide from the Studio: links & personalized messages.
function ytId(url: string): string { const m = String(url || '').match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ''; }
function safeHref(u: string): string { return /^https?:\/\//i.test(String(u || '')) ? String(u) : '#'; }
function Decorations({ items }: { items: any[] }) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', margin: '2px 0 12px' }}>
      {items.map((d: any, i: number) => {
        if (d.kind === 'coffee') return <a key={i} className="btn small" href={safeHref(d.link)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>☕ {d.message || 'Buy me a coffee'}</a>;
        if (d.kind === 'banner') return <div key={i} style={{ width: '100%', textAlign: 'center', padding: '8px 12px', background: 'var(--accent,#5c80bc)', color: '#fff', borderRadius: 8, fontWeight: 700 }}>{d.message}</div>;
        if (d.kind === 'note') return <div key={i} style={{ background: '#fdf6b2', border: '1.5px solid var(--ink)', borderRadius: 4, padding: '8px 12px', transform: 'rotate(-1.5deg)', fontSize: 14, boxShadow: '2px 2px 0 rgba(0,0,0,0.15)' }}>🗒️ {d.message}</div>;
        if (d.kind === 'hint') return <button key={i} className="btn small ghost" onClick={() => setRevealed(r => ({ ...r, [i]: !r[i] }))}>✏️ {revealed[i] ? (d.message || 'No hint') : 'Hint'}</button>;
        if (d.kind === 'tv') { const id = ytId(d.link); return id ? <iframe key={i} width="100%" height={200} src={`https://www.youtube.com/embed/${id}`} title="video" style={{ border: '2px solid var(--ink)', borderRadius: 8, maxWidth: 380 }} allowFullScreen /> : null; }
        return null;
      })}
    </div>
  );
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
              onClick={() => { setPicked(i); finish(!!o.correct, { prompt: q.prompt, your: o.text, answer: correctText, correct: !!o.correct, feedback: o.explanation || '' }); }}>{o.correct && answered ? '✓ ' : (isP && !o.correct ? '✗ ' : '')}<MathText text={o.text} /></button>;
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

// The annotation activity: a full sketch pad (pen/colours/text/pages, sized
// large / medium / adaptive) that does DOUBLE duty — press "Talk with AI" to have
// the tutor read your page and reply right here, or "Grade answer" to submit it
// for scoring. Once graded, it reports the verdict up via onDone.
function AnnotationQuestion({ q, subject, size, onDone }: { q: Q; subject: string; size?: 'large' | 'medium' | 'adaptive'; onDone: (correct: boolean, detail: any) => void }) {
  const getPagesRef = useRef<null | (() => string[])>(null);
  const [text, setText] = useState('');
  const [talkBusy, setTalkBusy] = useState(false);
  const [gradeBusy, setGradeBusy] = useState(false);
  const [chat, setChat] = useState<{ role: 'assistant' | 'learner'; text: string }[]>([]);

  const collect = async () => {
    const pages = (getPagesRef.current ? getPagesRef.current() : []).filter(Boolean);
    const image = await compositePages(pages);
    return { pages, image };
  };

  // Talk: the AI reads the page + typed note and replies inline (does NOT submit).
  const talk = async () => {
    if (talkBusy) return;
    setTalkBusy(true);
    const msg = text.trim() || '📝 (please read my written page)';
    const history = [...chat, { role: 'learner' as const, text: msg }];
    setChat(history);
    try {
      const { pages, image } = await collect();
      const r = await API.post('/api/tools/lesson/canvas-chat', {
        subject: `${subject}${q.prompt ? ` — ${q.prompt}` : ''}`,
        history: history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: m.text })),
        image, note: text.trim(), pageCount: pages.length,
      });
      setChat([...history, { role: 'assistant', text: r?.reply || '…' }]);
    } catch { setChat(c => [...c, { role: 'assistant', text: '(Could not reach the tutor this time.)' }]); }
    setTalkBusy(false);
  };

  // Grade: submit the page (+ typed answer) to be scored against the activity.
  const grade = async () => {
    if (gradeBusy) return;
    setGradeBusy(true);
    try {
      const { pages, image } = await collect();
      const r = await API.post('/api/tools/lesson/check-annotation', { prompt: q.prompt, answer: q.answer, image, text: text.trim() });
      onDone(!!r.correct, { prompt: q.prompt, your: text.trim() || '📝 your written pages', answer: q.answer || '', correct: !!r.correct, image: image || undefined, pages, feedback: r.feedback });
    } catch { onDone(true, { prompt: q.prompt, your: '(saved)', answer: '', correct: true, feedback: 'Saved.' }); }
    setGradeBusy(false);
  };

  const download = async () => {
    const pages = (getPagesRef.current ? getPagesRef.current() : []).filter(Boolean);
    if (!pages.length) { alert('Nothing written yet.'); return; }
    printPages(q.prompt || 'My work', pages);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontWeight: 600, margin: '0 0 10px' }}>📝 <MathText text={q.prompt || 'Work it out on the pad — ask the AI, or submit for grading:'} /></p>
      <AnnotationPad padSize={size} onReady={(fn) => { getPagesRef.current = fn; }} />
      {/* Type a question / answer too — the keyboard's 🎤 lets you speak it. */}
      <div style={{ maxWidth: 520, margin: '10px auto 0' }}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="…or type a question for the AI / your answer here (🎤 to speak)"
          style={{ width: '100%', minHeight: 54, resize: 'vertical', fontSize: 14, padding: 8, borderRadius: 8, border: '1.5px solid var(--ink)', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        <button className="btn small blue" disabled={talkBusy} onClick={talk}>{talkBusy ? <><Spinner />Reading…</> : '💬 Talk with AI'}</button>
        <button className="btn small green" disabled={gradeBusy} onClick={grade}>{gradeBusy ? <><Spinner />Grading…</> : '✅ Grade answer'}</button>
        <button className="btn small ghost" onClick={download}>📄 Download (PDF)</button>
      </div>
      {chat.length > 0 && (
        <div style={{ maxWidth: 560, margin: '12px auto 0', textAlign: 'left', display: 'grid', gap: 6 }}>
          {chat.map((m, i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: m.role === 'assistant' ? 'rgba(92,128,188,0.14)' : 'rgba(0,0,0,0.05)', fontSize: 14 }}>
              <b>{m.role === 'assistant' ? '🤖 AI' : '🧑 You'}:</b> {m.role === 'assistant' ? <AIReply text={m.text} /> : m.text}
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}><b>Talk with AI</b> reads your page and replies here; <b>Grade answer</b> submits it for scoring.</p>
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

// A styled code box (dark, monospace) — the same look used for code support.
function CodeBox({ code, label }: { code: string; label?: string }) {
  return (
    <div style={{ margin: '6px 0' }}>
      {label && <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 700, textAlign: 'left' }}>{label}</div>}
      <pre style={{ textAlign: 'left', background: '#2d2a26', color: '#f7f3e9', padding: 12, borderRadius: 8, overflowX: 'auto', overflowY: 'auto', maxHeight: 320, fontSize: 13, margin: '2px 0', whiteSpace: 'pre' }}><code>{code}</code></pre>
    </div>
  );
}

// Render an AI reply: any ```fenced``` code / working shows in a code box, the
// rest as prose (with inline $…$ math). So answers with code or step-by-step
// working display in a real code space instead of a plain chat line.
function AIReply({ text }: { text: string }) {
  const s = String(text || '');
  const parts: { code: boolean; body: string }[] = [];
  const re = /```[\w-]*\n?([\s\S]*?)```/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ code: false, body: s.slice(last, m.index) });
    parts.push({ code: true, body: m[1].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ code: false, body: s.slice(last) });
  if (!parts.length) parts.push({ code: false, body: s });
  return (
    <>
      {parts.map((p, i) => p.code
        ? <CodeBox key={i} code={p.body} />
        : (p.body.trim() ? <span key={i} dangerouslySetInnerHTML={{ __html: renderMathProse(p.body) }} /> : null))}
    </>
  );
}

// One answered question's summary row.
function ReviewRow({ d }: { d: any }) {
  return (
    <div>
      {d.prompt && <p style={{ fontWeight: 600, margin: '0 0 4px' }}><MathText text={d.prompt} /></p>}
      <div style={{ fontSize: 14, margin: '2px 0' }}>{d.correct ? '✓ ' : '✗ '}<AIReply text={d.feedback || (d.correct ? 'Correct.' : 'Reviewed.')} /></div>
      {/* The AI's model/corrected solution, shown in a code box. */}
      {d.fix && <CodeBox code={d.fix} label="Model answer" />}
      {d.image && <img src={d.image} alt="your work" style={{ width: '100%', maxWidth: 300, border: '2px solid var(--ink)', borderRadius: 8, margin: '6px auto', display: 'block' }} />}
      {d.code && <CodeBox code={d.code} label="Your answer" />}
      {!d.image && !d.code && d.your && <p style={{ fontSize: 13 }}>Your answer: <b>{d.your}</b></p>}
      {!d.correct && d.answer && <p style={{ fontSize: 13, color: 'var(--accent,#5c80bc)' }}>Expected: <b>{d.answer}</b></p>}
      {Array.isArray(d.pages) && d.pages.length > 0 && <button className="btn small ghost" style={{ marginTop: 4 }} onClick={() => printPages(d.prompt || 'My work', d.pages)}>📄 Download pages (PDF)</button>}
    </div>
  );
}

// Wraps an AI-checked collector (writing / code) with its OWN "Check with AI"
// button, so several can sit stacked on one slide and each be graded
// independently. (Annotation has its own richer component.)
function AIQuestionCard({ q, translateTo, onDone }: { q: Q; translateTo: string; onDone: (correct: boolean, detail: any) => void }) {
  const [payload, setPayload] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (busy || !payload?.ready) return;
    setBusy(true);
    try {
      let r: any, detail: any;
      if (q.kind === 'code') {
        r = await API.post('/api/tools/lesson/check-code', { prompt: payload.prompt, answer: payload.answer, code: payload.code, language: payload.language });
        detail = { prompt: payload.prompt, your: payload.code, answer: payload.answer || '', correct: !!r.correct, code: payload.code, feedback: r.feedback, fix: r.fix || '' };
      } else {
        r = await API.post('/api/tools/lesson/check-writing', { target: payload.target, image: payload.image });
        detail = { prompt: payload.prompt, your: '✍️ your drawing', answer: payload.target || '', correct: !!r.correct, image: payload.image, feedback: r.feedback };
      }
      onDone(!!r.correct, detail);
    } catch {
      onDone(true, { prompt: q.prompt, your: '(saved)', answer: '', correct: true, feedback: 'Saved.' });
    }
    setBusy(false);
  };
  return (
    <div>
      {q.kind === 'writing' ? <WritingCollector q={q} translateTo={translateTo} onAnswer={setPayload} />
        : <CodeCollector q={q} onAnswer={setPayload} />}
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button className="btn green" disabled={busy || !payload?.ready} onClick={check}>{busy ? <><Spinner />Checking…</> : '✅ Check with AI'}</button>
      </div>
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
  const [topicIdeas, setTopicIdeas] = useState<string[]>([]);   // 5 suggested topics for the create form
  const [topicsBusy, setTopicsBusy] = useState(false);
  const [exHint, setExHint] = useState('');                     // steer the AI example
  // Activities-feed controls.
  const [feedTab, setFeedTab] = useState<'all' | 'mine' | 'fav'>('all');
  const [feedCat, setFeedCat] = useState('all');
  const [feedUser, setFeedUser] = useState('');
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setFavs(JSON.parse(localStorage.getItem('sl_gen_favs') || '{}')); } catch { /* ignore */ } }, []);
  const toggleFav = (id: string) => setFavs(f => { const n = { ...f }; if (n[id]) delete n[id]; else n[id] = true; try { localStorage.setItem('sl_gen_favs', JSON.stringify(n)); } catch { /* ignore */ } return n; });

  const [cfg, setCfg] = useState<Cfg>({});
  const total = () => Math.max(1, Math.min(75, parseInt(cfg.slides, 10) || parseInt(lesson.totalSlides, 10) || 5));
  const [slides, setSlides] = useState<(Slide | null)[]>([]);   // cached by 0-based index
  const [cur, setCur] = useState(0);
  const [results, setResults] = useState<Record<number, SlideRes>>({});
  const [genBusy, setGenBusy] = useState(false);                // fetching a slide
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
    try { const r = await API.post('/api/tools/lesson/suggest', { lesson, levels, avoid: example?.topic || '', hint: exHint.trim() }); setExample(r); } catch { /* ignore */ }
    setExBusy(false);
  };
  // Fetch 5 suggested topics for this course (the create form's topic dropdown).
  const loadTopics = async () => {
    setTopicsBusy(true);
    try {
      const r = await API.post('/api/tools/lesson/suggest', { lesson, levels, count: 5 });
      const ideas = Array.isArray(r?.topics) ? r.topics.map(String).filter(Boolean) : [];
      setTopicIdeas(ideas);
      if (ideas.length) setForm(s => (s.topic ? s : { ...s, topic: ideas[0] }));   // default to the first idea
    } catch { /* ignore */ }
    setTopicsBusy(false);
  };
  useEffect(() => { loadActivities(); refreshExample(); loadTopics(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

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
    setCfg(c); setSlides([]); setResults({}); setCur(0); setShowReview(false); setErr(''); setPhase('play');
    fetchInto(0, c, []);
  };

  const defaultCat = () => lesson.subjectKind === 'math' ? 'Mathematics' : lesson.subjectKind === 'programming' ? 'Technology' : lesson.subjectKind === 'language' ? 'Language Learning' : 'Science';
  const createAndPlay = async () => {
    const c: Cfg = { ...form, level: form.level || form.difficulty || levels[0], topic: form.topic || '', category: form.category || defaultCat() };
    try { await API.post('/api/tools/entries', { slug, data: c }); } catch { /* ignore */ }
    loadActivities();
    play(c);
  };

  // Record one answered question (by index) on the current slide; mark the slide
  // `done` once every question has been answered.
  const recordQ = (qi: number, correct: boolean, detail: any) => {
    const qs = slidesRef.current[cur]?.questions?.length || 0;
    setResults(r => {
      const prev = r[cur] || { answers: {}, done: false };
      const answers = { ...prev.answers, [qi]: { ...detail, correct } };
      return { ...r, [cur]: { answers, done: Object.keys(answers).length >= qs } };
    });
  };

  const goBack = () => { if (cur > 0) { setCur(cur - 1); prefetch(cur); } };
  const goToSlide = async (nxt: number) => {
    if (nxt >= total()) return;
    // Usually prefetched -> instant. Otherwise wait for the in-flight prefetch.
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
    // Turn the free-text "topic" field into a dropdown of 5 suggested topics
    // (still editable — every dropdown has the ✎ pencil for a custom value).
    const formFields = [
      ...settings.map((f: any) => (f.id === 'topic' && topicIdeas.length ? { ...f, type: 'select-or-custom', options: topicIdeas } : f)),
      { id: 'category', label: 'Category', type: 'select-or-custom', options: GEN_CATEGORIES },
    ];
    const me = API.user?.username;
    const feed = activities.filter((e: any) => {
      if (feedTab === 'mine' && e.username !== me) return false;
      if (feedTab === 'fav' && !favs[e.id]) return false;
      if (feedCat !== 'all' && (e.data?.category || '') !== feedCat) return false;
      if (feedUser.trim() && !String(e.username || '').toLowerCase().includes(feedUser.trim().toLowerCase())) return false;
      return true;
    });
    const dashRule = { borderTop: '2px dashed var(--ink)', opacity: 0.45, margin: '14px 0' } as const;
    return (
      <div>
        <div className="card alt" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h4 style={{ margin: '0 0 8px' }}>Create a {lesson.subject || 'lesson'} activity</h4>
            <button className="btn small ghost" onClick={loadTopics} disabled={topicsBusy} title="Fresh suggested topics">{topicsBusy ? '…' : '🔄 New topics'}</button>
          </div>
          {settings.length > 0 && <ToolFields fields={formFields} values={form} onChange={(id, v) => setForm(s => ({ ...s, [id]: v }))} />}
          <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <button className="btn green" onClick={createAndPlay}>✨ Generate &amp; play →</button>
          </div>
        </div>

        {/* ┄ divider: settings ┄ AI example ┄ */}
        <div style={dashRule} />

        <div className="card" style={{ padding: '12px 14px', borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>✦ AI EXAMPLE</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={exHint} onChange={e => setExHint(e.target.value)} placeholder="Suggest about… (optional)" onKeyDown={e => { if (e.key === 'Enter') refreshExample(); }}
                style={{ fontSize: 12, width: 160, padding: '4px 7px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
              <button className="btn small ghost" onClick={refreshExample} disabled={exBusy}>{exBusy ? '…' : '🔄 Suggest'}</button>
            </div>
          </div>
          {example ? (
            <div style={{ marginTop: 6 }}>
              <strong>{label({ level: example.level, topic: example.topic })}</strong>
              {example.why && <p style={{ margin: '4px 0', fontSize: 13, opacity: 0.8 }}>{example.why}</p>}
              <button className="btn small green" onClick={() => play({ ...form, level: example.level, topic: example.topic })}>▶ Play</button>
            </div>
          ) : <p style={{ fontSize: 13, opacity: 0.6, margin: '6px 0 0' }}>Loading a suggestion…</p>}
        </div>

        {/* ┄ divider: AI example ┄ activities feed ┄ */}
        <div style={dashRule} />

        <h4 style={{ margin: '0 0 8px' }}>Activities feed</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'mine', 'fav'] as const).map(t => (
              <button key={t} className={`btn small ${feedTab === t ? 'blue' : 'ghost'}`} onClick={() => setFeedTab(t)}>{t === 'all' ? 'All' : t === 'mine' ? 'Mine' : '★ Favorites'}</button>
            ))}
          </div>
          <select value={feedCat} onChange={e => setFeedCat(e.target.value)} style={{ fontSize: 12, padding: '3px 6px' }}>
            <option value="all">All categories</option>
            {GEN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={feedUser} onChange={e => setFeedUser(e.target.value)} placeholder="🔍 by user" style={{ fontSize: 12, width: 120, padding: '4px 7px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
        </div>
        {feed.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: 14 }}>{activities.length === 0 ? 'No activities yet — generate the first one above.' : 'No activities match these filters.'}</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {feed.map((e: any) => (
              <div key={e.id} className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{label(e.data || {})}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>@{e.username || 'anon'}{e.data?.category ? ` · ${e.data.category}` : ''}{e.createdAt ? ` · ${new Date(e.createdAt).toLocaleString()}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn small ghost" title={favs[e.id] ? 'Unfavorite' : 'Favorite'} onClick={() => toggleFav(e.id)}>{favs[e.id] ? '★' : '☆'}</button>
                  <button className="btn small green" onClick={() => play(e.data || {})}>▶ Play</button>
                </div>
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
    const allDetails = list.flatMap(r => Object.keys(r.answers).map(Number).sort((a, b) => a - b).map(k => r.answers[k]));
    const answeredCount = allDetails.length;
    const scoreCount = allDetails.filter(d => d.correct).length;
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
            {allDetails.length === 0 ? <p style={{ opacity: 0.6, fontSize: 13 }}>No questions recorded.</p> : allDetails.map((d, i) => (
              <div key={i} style={{ borderTop: i ? '1px dashed var(--ink)' : 'none', padding: '10px 0' }}>
                <div style={{ fontSize: 12, opacity: 0.5 }}>{i + 1}.</div>
                <ReviewRow d={d} />
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
  const tot = total();
  const curSlide = slides[cur];
  const qList = curSlide?.questions || [];
  const res = results[cur];
  const answeredCount = res ? Object.keys(res.answers).length : 0;
  // Every question is shown at once (a scrollable "feed"); the slide is complete
  // when they're all answered (a slide with no questions is complete on arrival).
  const allAnswered = qList.length === 0 || answeredCount >= qList.length;
  const isLast = cur >= tot - 1;
  const canBack = cur > 0 && !genBusy;
  const canNext = allAnswered && !isLast && !genBusy;
  const canFinish = allAnswered && isLast && !genBusy;
  const padSize = (Array.isArray(lesson.pages) && lesson.pages[cur]?.padSize) || 'large';
  const hasAnnotation = qList.some((q: Q) => q.kind === 'annotation');
  const scoreSoFar = Object.values(results).reduce((a, r) => a + Object.values(r.answers).filter((x: any) => x.correct).length, 0);

  return (
    <div>
      <style>{'@keyframes sl-spin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn small ghost" onClick={() => { setPhase('hub'); loadActivities(); }}>← Lessons</button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>{label(cfg)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Slide {cur + 1} / {tot}{qList.length > 1 ? ` · ${answeredCount}/${qList.length} answered` : ''}</span>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Score: {scoreSoFar}</span>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden', border: '1.5px solid var(--ink)', marginBottom: 12 }}>
        <div style={{ width: `${((cur + 1) / tot) * 100}%`, height: '100%', background: 'var(--accent,#5c80bc)' }} />
      </div>

      {genBusy && !curSlide && <p style={{ opacity: 0.7, textAlign: 'center' }}><Spinner />Generating slide…</p>}
      {err && !curSlide && <p style={{ color: 'var(--danger,#e4572e)' }}>{err} <button className="btn small" onClick={() => fetchInto(cur, cfg, slides.filter(Boolean).map(s => (s as Slide).title))}>Retry</button></p>}

      {curSlide && (
        <div className="card" style={{ padding: '16px 18px', maxWidth: hasAnnotation ? 900 : 640, margin: '0 auto' }}>
          {curSlide.fallback && <p style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.7, textAlign: 'center' }}>Demo slide (no AI connected).</p>}
          <h3 style={{ marginTop: 0, textAlign: 'center' }}>{curSlide.title}</h3>
          {Array.isArray(lesson.pages) && lesson.pages[cur]?.decorations?.length ? <Decorations items={lesson.pages[cur].decorations} /> : null}
          {/* Reading passage (its own "paper"). */}
          {curSlide.content && <p style={{ fontSize: 16, lineHeight: 1.6 }}><RichText text={curSlide.content} translateTo={lesson.translateTo || 'English'} /></p>}
          {/* Support materials — each streams into its own card below. */}
          <SupportsLoader slide={curSlide} ctx={{ lesson, values: cfg }} />

          {/* Every question, stacked as its own "paper"; scroll down to reach them. */}
          {qList.map((q: Q, i: number) => {
            const ans = res?.answers?.[i];
            return (
              <div key={`${cur}-${i}`} style={{ marginTop: 14, borderTop: '2px dashed var(--ink)', paddingTop: 14 }}>
                {qList.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, marginBottom: 6 }}>Question {i + 1} / {qList.length}</div>}
                {ans ? <ReviewRow d={ans} />
                  : q.kind === 'annotation'
                    ? <AnnotationQuestion q={q} subject={lesson.subject || ''} size={padSize} onDone={(c, d) => recordQ(i, c, d)} />
                    : ['writing', 'code'].includes(q.kind)
                      ? <AIQuestionCard q={q} translateTo={lesson.translateTo || 'English'} onDone={(c, d) => recordQ(i, c, d)} />
                      : <ChoiceQuestion q={q} translateTo={lesson.translateTo || 'English'} onDone={(c, d) => recordQ(i, c, d)} />}
              </div>
            );
          })}

          {/* The single, clear navigation bar — one place, always the same order. */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16, borderTop: '1.5px solid rgba(0,0,0,0.12)', paddingTop: 14 }}>
            <button className="btn" disabled={!canBack} onClick={goBack}>← Back</button>
            <button className="btn blue" disabled={!canNext} onClick={() => goToSlide(cur + 1)}>{genBusy && curSlide ? <><Spinner />Loading…</> : 'Next →'}</button>
            <button className="btn green" disabled={!canFinish} onClick={() => setPhase('done')}>🏁 Finish</button>
          </div>
          {!allAnswered && <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 6 }}>Answer {qList.length > 1 ? 'every question' : 'the question'} above to unlock {isLast ? 'Finish' : 'Next'}.</p>}
        </div>
      )}
    </div>
  );
}
