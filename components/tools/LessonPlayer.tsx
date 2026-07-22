'use client';
/* A lesson tool is a general-purpose lesson generator. Its page is a HUB
 * (create form + activity feed + refreshable AI example). Playing an activity
 * runs a scored slide deck — ONE question per slide — that can mix multiple-
 * choice (2/4 options), fill-in-the-blank, typed short-answer, hand-written
 * worked answers on a paper pad (AI-graded), single-character handwriting
 * (AI-graded) and code/text answers (AI-graded). A single, clear navigation bar
 * (Back · Check with AI · Next · Finish) drives the whole deck, with each button
 * enabled only when it applies and showing a spinner while it works. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useCardSize, useImgSize, cardImageProps, galleryLayout } from '@/lib/card-size';
import { useApp } from '@/components/AppContext';

// Reconstruct the Studio's editable page stack from a tool's saved lesson.pages,
// so "Edit layout & activities" opens the SAME builder used to create slide tools,
// pre-loaded with this tool's real layout. Order per slide: reading → support →
// evaluation → per-slide note. Maps our stored activity/support flags back to the
// Studio component catalog ids.
const ACT_TO_ID: Record<string, string> = { mcq: 'mcq4', mcq4: 'mcq4', mcq2: 'mcq2', 'fill-blank': 'fill-blank', input: 'input', annotation: 'annotation', code: 'code', writing: 'writing' };
const SUP_TO_ID: Record<string, string> = { images: 'image', tables: 'table', formulas: 'latex', code: 'codeblock', audio: 'audio', geogebra: 'geogebra' };
const mkUid = () => Math.random().toString(36).slice(2, 8);
function lessonPageToStudio(pg: any): any {
  const comps: any[] = [];
  if (pg?.reading !== false) comps.push({ id: 'reading', uid: mkUid() });   // teaching text — always
  const sup = pg?.support || {};
  ['images', 'tables', 'formulas', 'code', 'audio', 'geogebra'].forEach((k) => { if (sup[k]) comps.push({ id: SUP_TO_ID[k], uid: mkUid() }); });   // support before evaluation
  (Array.isArray(pg?.activityTypes) ? pg.activityTypes : []).forEach((a: string) => { const id = ACT_TO_ID[a]; if (id) comps.push({ id, uid: mkUid() }); });
  if (pg?.style) comps.push({ id: 'note', uid: mkUid(), instr: String(pg.style).slice(0, 2000) });
  return { layouts: [{ template: 'auto', components: comps }], length: pg?.paragraphLength || 'medium', paragraphs: pg?.paragraphsPerSlide || 1 };
}
function lessonToStudioPages(lesson: any): any[] {
  if (Array.isArray(lesson?.pages) && lesson.pages.length) return lesson.pages.map(lessonPageToStudio);
  // No per-slide pages yet (e.g. built from the coach chat): synthesise one row per
  // slide from the lesson-wide activity/support settings so the builder isn't empty.
  const count = Math.max(1, Math.min(30, parseInt(lesson?.totalSlides, 10) || 5));
  const base = { reading: true, activityTypes: lesson?.activityTypes, support: lesson?.support, paragraphsPerSlide: lesson?.paragraphsPerSlide, paragraphLength: lesson?.paragraphLength };
  return Array.from({ length: count }, () => lessonPageToStudio(base));
}
import { defaultsFor, MAX_SLIDES } from '@/lib/tool-schema';
import { ToolFields, FIELD_CONTROL_STYLE } from '@/components/tools/ToolFields';
import { CodeEditor } from '@/components/tools/CodeEditor';
import { StepWizard, type WizardStep } from '@/components/ui/StepWizard';
import { WizardGridTemplate } from '@/components/ui/WizardGridTemplate';
import { RichText } from '@/components/tools/RichText';
import { DrawField } from '@/components/tools/MediaFields';
import { AudioButton } from '@/components/ui/AudioButton';
import { AnnotationPad, compositePages } from '@/components/tools/AnnotationPad';
import { CanvasConversation } from '@/components/tools/CanvasConversation';
import { renderMath, renderInlineMath, renderMathProse } from '@/components/ui/shared';
import { buildLessonZip } from '@/lib/lesson-export';
import { matchAnswer, answerHint } from '@/lib/answer-match';
import { defaultEmojiFor, randomEmoji } from '@/lib/emoji-thumb';
import { isRenderableImage } from '@/lib/img';
import { IMAGE_STYLES } from '@/lib/image-styles';
import { estimateLessonTokens } from '@/lib/cost-estimate';
import { LESSON_THEMES } from '@/lib/lesson-themes';
import { TTS_VOICES } from '@/lib/tts';
import { type FilterKey } from '@/components/ui/Collection';
import { CardShell, iconBtn, overlayIcon, delIcon } from '@/components/ui/CardShell';
import { SharePanel } from '@/components/tools/SharePanel';
import { GalleryFilterRow, GalleryPager } from '@/components/ui/GalleryChrome';
import { GallerySkeleton } from '@/components/ui/GallerySkeleton';
import { PagedTable, type Cell } from '@/components/ui/PagedTable';
import { PromptInspector } from '@/components/ui/PromptInspector';
import { CommentSection } from '@/components/social/CommentSection';

// Subject categories every generation is filed under (feed filter + create form).
const GEN_CATEGORIES = ['Science', 'Technology', 'Mathematics', 'Language Learning', 'History & Geography', 'Arts & Music', 'Productivity', 'Games & Fun', 'Health & Wellbeing', 'Business & Finance'];
// The academic difficulty scale, from extra-easy (Zero) up to doctoral. Lower
// levels stay to a few words / short sentences; higher levels get DEEPER and more
// TECHNICAL, not just longer. Used for the level setting when generating a tool
// and by the per-slide level gear that re-explains the slide text on the fly.
const TEXT_LEVELS = [
  'Zero', 'Lower Beginner', 'Beginner', 'Upper Beginner',
  'Lower Intermediate', 'Intermediate', 'Upper Intermediate',
  'Lower Advanced (Undergrad)', 'Advanced (Graduate)', 'Upper Advanced (PhD level)',
];
// Paragraph DENSITY presets — how MUCH text to show, independent of the level
// (which sets vocabulary/comprehension difficulty). "" = follow the level default.
const PARA_DENSITIES = ['Low', 'Low-Medium', 'Medium', 'Medium-High', 'High'];
// Preset slide counts offered in the (editable) dropdown for the "slides" field.
const SLIDE_COUNTS = ['3', '4', '5', '6', '8', '10', '12', '15'];
// Map any legacy CEFR level a tool was saved with onto the new academic scale, so
// the Difficulty dropdown always shows a current option instead of stale "A1".
const LEGACY_LEVEL_MAP: Record<string, string> = {
  A1: 'Upper Beginner', A2: 'Lower Intermediate', B1: 'Intermediate',
  B2: 'Upper Intermediate', C1: 'Lower Advanced (Undergrad)', C2: 'Advanced (Graduate)',
};

// Inline text that typesets any $...$ LaTeX segments (math/science prompts).
function MathText({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderInlineMath(String(text || '')) }} />;
}

type Q = { kind: string; prompt: string; options?: any[]; answer?: string; accept?: string[]; explanation?: string; target?: string; language?: string; starter?: string };
// `support` is a single pre-built block (fallback/legacy). `supportPlan` lists
// the support TYPES to fetch one-by-one via /api/tools/lesson/support; each is
// streamed in with its own spinner and cached on `_supports`.
type Slide = { title: string; content: string; translation?: string; support?: any; supportPlan?: string[]; _supports?: any[]; questions: Q[]; fallback?: boolean; provider?: string };
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

// A little ✏️ that "writes" — glides across leaving a growing underline — shown
// while a slide or its image is being generated, so loading feels like the lesson
// is being hand-written. `em`-based, so it scales with the surrounding font size.
function WritingPencil({ size, block }: { size?: number; block?: boolean }) {
  return (
    <span className="sl-pencil" aria-hidden style={{ ...(size ? { fontSize: size } : {}), ...(block ? { marginRight: 0 } : {}) }}>
      <span className="sl-pencil__line" />
      <span className="sl-pencil__tip">✏️</span>
    </span>
  );
}

// An interactive GeoGebra graph. Loads GeoGebra's deployggb.js once, then injects
// an applet and runs the AI-provided commands (functions, points, circles…).
function GeoGebra({ commands, caption }: { commands: string[]; caption?: string }) {
  const holderId = useRef('ggb-' + Math.random().toString(36).slice(2));
  useEffect(() => {
    let cancelled = false;
    const boot = () => {
      const W = window as any;
      if (cancelled || !W.GGBApplet || !document.getElementById(holderId.current)) return;
      const applet = new W.GGBApplet({
        appName: 'graphing', width: 600, height: 380, showToolBar: false, showAlgebraInput: false, showMenuBar: false, showResetIcon: true,
        appletOnLoad: (api: any) => { (Array.isArray(commands) ? commands : []).forEach((c) => { try { api.evalCommand(String(c)); } catch { /* skip bad command */ } }); },
      }, true);
      applet.inject(holderId.current);
    };
    const W = window as any;
    if (W.GGBApplet) { boot(); return () => { cancelled = true; }; }
    let sc = document.getElementById('deployggb') as HTMLScriptElement | null;
    if (!sc) { sc = document.createElement('script'); sc.id = 'deployggb'; sc.src = 'https://www.geogebra.org/apps/deployggb.js'; sc.onload = boot; document.body.appendChild(sc); }
    else sc.addEventListener('load', boot);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ margin: '8px 0', border: '1.5px solid var(--ink)', borderRadius: 8, overflow: 'hidden', maxWidth: 600 }}>
      <div id={holderId.current} style={{ width: '100%', minHeight: 300 }} />
      {caption && <div style={{ fontSize: 12, opacity: 0.7, padding: '4px 8px' }}>📐 {caption}</div>}
    </div>
  );
}

// Friendly name for the image backend that produced a slide's picture, shown in
// small text under it so you can tell which model ran (and spot a fallback).
const IMAGE_MODEL_LABELS: Record<string, string> = {
  openai: 'OpenAI · gpt-image-1', grok: 'xAI Grok', replicate: 'Replicate · Flux',
  leonardo: 'Leonardo', gemini: 'Google Gemini · Nano Banana', pollinations: 'Pollinations · free',
  placeholder: 'placeholder sketch (no AI image model available)',
};
const imageModelLabel = (by?: string) => (by ? (IMAGE_MODEL_LABELS[by] || by) : '');

function Support({ s }: { s: any }) {
  if (!s) return null;
  if (s.type === 'geogebra' && Array.isArray(s.commands)) return <GeoGebra commands={s.commands} caption={s.caption} />;
  if (s.type === 'image' && s.url) return (
    <figure style={{ margin: '8px auto', maxWidth: 360 }}>
      <img src={s.url} alt={s.caption || ''} style={{ width: '100%', borderRadius: 8, border: '2px solid var(--ink)', display: 'block' }} />
      {(s.caption || s.by) && (
        <figcaption style={{ fontSize: 11, opacity: 0.6, marginTop: 3, textAlign: 'center', lineHeight: 1.3 }}>
          {s.caption && <span>{s.caption}</span>}
          {s.caption && s.by && <br />}
          {s.by && <span title="The image model that generated this picture">🖼 {imageModelLabel(s.by)}</span>}
        </figcaption>
      )}
    </figure>
  );
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
  const label = ({ image: 'illustration', code: 'code snippet', table: 'table', formula: 'formula', wolfram: 'step-by-step solution', geogebra: 'interactive graph' } as Record<string, string>)[type] || 'material';
  return (
    <div style={{ margin: '8px 0', padding: '14px 16px', border: '1.5px dashed var(--ink)', borderRadius: 8, textAlign: 'center', opacity: 0.7, fontSize: 13 }}>
      <div style={{ lineHeight: 1 }}><WritingPencil size={36} block /></div>
      <p style={{ margin: '8px 0 0' }}>Sketching {label}…</p>
    </div>
  );
}

// One support request. Images get a WATCHDOG: the default backend order tries
// Nano Banana (Gemini) first, which sometimes hangs — so if the image hasn't
// come back within IMG_SWITCH_MS (or comes back failed sooner), we fire a second
// request that forces a fast, keyless provider (Pollinations) and take whichever
// returns a usable image first. That way a slow/hung image model never leaves the
// slide spinning on the pencil. Non-image materials are quick text generations
// and just resolve normally. A hard cap guarantees the promise always settles.
const IMG_SWITCH_MS = 18000;
const IMG_HARD_CAP_MS = 45000;
function loadSupport(type: string, ctx: any, slide: Slide): Promise<any> {
  const body: any = { lesson: ctx.lesson, values: ctx.values, type, content: slide.content, title: slide.title, imageStyle: ctx.imageStyle || '', imageProvider: ctx.imageProvider || '' };
  const post = (extra?: any) => API.post('/api/tools/lesson/support', { ...body, ...extra }).then((r: any) => r?.support || null).catch(() => null);
  const first = post();
  if (type !== 'image') return first;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: any) => { if (!done) { done = true; resolve(v); } };
    let retryStarted = false;
    const startRetry = () => {
      if (retryStarted) return; retryStarted = true;
      // Force the free, keyless Pollinations backend so we don't wait on the same
      // slow model again. Whichever request yields a usable image first wins.
      post({ imageProvider: 'pollinations' }).then((v) => { if (v) finish(v); });
    };
    first.then((v) => { if (v) finish(v); else startRetry(); }); // fast success wins; fast failure -> switch now
    setTimeout(startRetry, IMG_SWITCH_MS);                        // first too slow -> switch provider
    setTimeout(() => finish(null), IMG_HARD_CAP_MS);             // give up gracefully so the spinner never hangs
  });
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
        sl._supportP[i] = loadSupport(type, ctx, slide)
          .then((support: any) => { sl._supports[i] = support ?? null; })
          .catch(() => { sl._supports[i] = null; });
      }
      sl._supportP[i].then(sync); // this mount re-renders when the request resolves
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, ctx.nonce]);

  // Fallback / legacy: a single pre-built support and no plan.
  if (!plan.length) return <Support s={slide.support} />;
  // Each support is its own "section", separated by a dotted rule so it's clear
  // where one piece of material ends and the next begins.
  let shown = -1;
  return (
    <>
      {plan.map((type, i) => {
        const it = items[i];
        const body = it === undefined ? <SupportSkeleton type={type} /> : (it ? <Support s={it} /> : null);
        if (body === null) return null;
        shown += 1;
        return <div key={i} style={shown > 0 ? { borderTop: '1.5px dashed var(--ink)', paddingTop: 12, marginTop: 4 } : undefined}>{body}</div>;
      })}
    </>
  );
}

// Decorations placed on a slide from the Studio: links & personalized messages.
function ytId(url: string): string { const m = String(url || '').match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ''; }
function safeHref(u: string): string { return /^https?:\/\//i.test(String(u || '')) ? String(u) : '#'; }
// A Studio "Button" decoration: shows results, asks the AI about the lesson, or
// runs a custom action / opens a link. Self-contained (owns its own ask panel).
function ButtonDeco({ d, subject, topic, onFinish }: { d: any; subject: string; topic: string; onFinish?: () => void }) {
  const action = String(d.action || 'ask');
  const label = d.message || (action === 'results' ? 'Show my results' : action === 'ask' ? 'Ask the AI' : 'Go');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [ans, setAns] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true); setAns('');
    try {
      const r = await API.post('/api/tools/lesson/ask', { question, subject, topic });
      setAns(r?.answer || r?.error || 'No answer.');
    } catch (e: any) { setAns(e?.message || 'Could not ask right now.'); }
    finally { setBusy(false); }
  };
  if (action === 'results') return <button className="btn small blue" onClick={() => onFinish?.()}>📊 {label}</button>;
  if (action === 'action') {
    if (safeHref(d.link) !== '#') return <a className="btn small" href={safeHref(d.link)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>🔗 {label}</a>;
    return <button className="btn small" onClick={() => alert(label)}>🔳 {label}</button>;
  }
  // action === 'ask'
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', maxWidth: 420 }}>
      <button className="btn small" onClick={() => { setOpen(o => !o); if (!open && d.message && !q) setQ(d.message); }}>💬 {label}</button>
      {open && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'flex', gap: 6 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask the AI about this lesson…" onKeyDown={e => { if (e.key === 'Enter') ask(q); }}
              style={{ flex: 1, fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--ink)' }} />
            <button className="btn small green" disabled={busy} onClick={() => ask(q)}>{busy ? '…' : 'Ask'}</button>
          </span>
          {ans && <span style={{ fontSize: 13, background: 'rgba(0,0,0,0.04)', border: '1.5px solid var(--ink)', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{ans}</span>}
        </span>
      )}
    </span>
  );
}

function Decorations({ items, subject = '', topic = '', onFinish }: { items: any[]; subject?: string; topic?: string; onFinish?: () => void }) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', margin: '2px 0 12px' }}>
      {items.map((d: any, i: number) => {
        if (d.kind === 'button') return <ButtonDeco key={i} d={d} subject={subject} topic={topic} onFinish={onFinish} />;
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
function ChoiceQuestion({ q, translateTo, subject, onDone, recorded, voiceId, speakable }: { q: Q; translateTo: string; subject: string; onDone: (correct: boolean, detail: any) => void; recorded?: any; voiceId?: string; speakable?: boolean }) {
  const [opts] = useState<any[]>(() => q.kind === 'mcq' ? shuffle(q.options || []) : []);
  const [picked, setPicked] = useState<number | null>(null);
  const [val, setVal] = useState('');
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<'open' | 'right' | 'wrong'>('open');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const finish = (correct: boolean, detail: any) => { if (state === 'open') { setState(correct ? 'right' : 'wrong'); onDone(correct, detail); } };

  if (q.kind === 'mcq') {
    // Answered either just now (picked) or on a revisit (recorded.your). Keep the
    // options on screen: chosen-wrong in red, the correct one in green, with a
    // short explanation below — never collapse to a bare "wrong" line.
    const yourText = recorded ? String(recorded.your ?? '') : (picked !== null ? opts[picked!]?.text : '');
    const answered = picked !== null || !!recorded;
    const correctText = (opts.find((o: any) => o.correct) || {}).text || '';
    const explain = (opts.find((o: any) => o.text === yourText)?.explanation) || recorded?.feedback || opts[picked!]?.explanation || '';
    return (
      <div>
        <p style={{ fontWeight: 600, textAlign: 'center', margin: '0 0 10px' }}><MathText text={q.prompt} /></p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 460, margin: '0 auto' }}>
          {opts.map((o: any, i: number) => {
            const isP = picked === i || (recorded && o.text === yourText);
            // After answering, disabled buttons are dimmed (opacity .5) — so we make
            // the CORRECT answer (vivid green) and the CHOSEN-WRONG answer (vivid red)
            // fully opaque with a bold border + readable text so they clearly stand
            // out, while every OTHER option stays greyed/muted.
            const hl: React.CSSProperties = !answered ? {}
              : o.correct ? { background: '#5fa044', color: '#fff', borderColor: '#356b23', borderWidth: 3, opacity: 1, fontWeight: 700 }
              : isP ? { background: '#e4572e', color: '#fff', borderColor: '#a5331a', borderWidth: 3, opacity: 1, fontWeight: 700 }
              : { background: 'rgba(45,42,38,0.06)', opacity: 0.45 };
            return <button key={i} className="btn" style={{ textAlign: 'left', width: '100%', ...hl }} disabled={answered}
              onClick={() => { setPicked(i); finish(!!o.correct, { prompt: q.prompt, your: o.text, answer: correctText, correct: !!o.correct, feedback: o.explanation || '' }); }}>{o.correct && answered ? '✓ ' : (isP && !o.correct ? '✗ ' : '')}<MathText text={o.text} /></button>;
          })}
        </div>
        {answered && explain && <p style={{ fontSize: 14, opacity: 0.85, marginTop: 10, textAlign: 'center' }}>{explain}</p>}
        {!answered && <GuidePanel subject={subject} prompt={q.prompt} kind="mcq" getAttempt={() => ''} />}
      </div>
    );
  }
  // fill-blank / input — typed answer. A close-enough answer (accents, typos,
  // paraphrase, partial phrase) is accepted instantly; otherwise the AI judges
  // it (also leniently), then we move on. 3 tries with hints before revealing.
  const accept = [String(q.answer || ''), ...(q.accept || [])].filter(Boolean);
  const check = async () => {
    if (aiBusy) return;
    const v = val.trim();
    const m = matchAnswer(v, accept, 'vocab');
    if (m.accept) {
      finish(true, { prompt: q.prompt, your: v, answer: q.answer || '', correct: true, feedback: m.close ? `Accepted — a fuller answer is “${q.answer}”.` : '' });
      return;
    }
    // Ask the AI whether this free-text answer is acceptable (lenient grading).
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
    else if (!aiNote) setAiNote(`Hint: ${answerHint(String(q.answer || ''), t)}`);
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
      {state === 'wrong' && <p style={{ fontSize: 14 }}>Answer: <b>{q.answer}</b> <RichText text={String(q.answer || '')} translateTo={translateTo} voiceId={voiceId} speakable={speakable} /></p>}
      {state === 'open' && <GuidePanel subject={subject} prompt={q.prompt} kind={q.kind} getAttempt={() => val} />}
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

// A reusable "ask the AI for a hint" panel: guiding replies (code + $$math$$
// rendered), never the direct answer. Used by code / multiple-choice / input.
function GuidePanel({ subject, prompt, kind, getAttempt }: { subject: string; prompt: string; kind: string; getAttempt: () => string }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<{ role: 'assistant' | 'learner'; text: string }[]>([]);
  const ask = async () => {
    if (busy) return;
    setBusy(true);
    const msg = note.trim() || '(a hint for the next step, please)';
    const history = [...chat, { role: 'learner' as const, text: msg }];
    setChat(history); setNote('');
    try {
      const r = await API.post('/api/tools/lesson/guide', { subject, prompt, attempt: getAttempt(), note: note.trim(), kind, history: history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: m.text })) });
      setChat([...history, { role: 'assistant', text: r?.reply || '…' }]);
    } catch { setChat(c => [...c, { role: 'assistant', text: '(Could not reach the tutor this time.)' }]); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 380, margin: '0 auto', justifyContent: 'center' }}>
        <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Ask the AI for a hint…" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ask(); } }}
          style={{ flex: 1, minWidth: 0, fontSize: '0.95rem', padding: '7px 12px' }} />
        <button className="btn small blue" style={{ flex: '0 0 auto' }} disabled={busy} onClick={ask}>{busy ? <><Spinner />…</> : '💬 Ask'}</button>
      </div>
      {chat.length > 0 && (
        <div style={{ maxWidth: 560, margin: '10px auto 0', textAlign: 'left', display: 'grid', gap: 6 }}>
          {chat.map((m, i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: m.role === 'assistant' ? 'rgba(92,128,188,0.14)' : 'rgba(0,0,0,0.05)', fontSize: 14 }}>
              <b>{m.role === 'assistant' ? '🤖 AI' : '🧑 You'}:</b> {m.role === 'assistant' ? <AIReply text={m.text} /> : m.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The code / worked-answer activity: write code (or working), ASK the AI for
// guidance (hints + snippets, never the full answer), and SUBMIT to be graded.
function CodeQuestion({ q, subject, onDone }: { q: Q; subject: string; onDone: (correct: boolean, detail: any) => void }) {
  const [code, setCode] = useState(String(q.starter || ''));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    try {
      const r = await API.post('/api/tools/lesson/check-code', { prompt: q.prompt, answer: q.answer, code, language: q.language });
      onDone(!!r.correct, { prompt: q.prompt, your: code, answer: q.answer || '', correct: !!r.correct, code, feedback: r.feedback, fix: r.fix || '' });
    } catch { onDone(true, { prompt: q.prompt, your: code, answer: '', correct: true, feedback: 'Saved.', code }); }
    setBusy(false);
  };
  return (
    <div>
      <p style={{ fontWeight: 600, textAlign: 'center', margin: '0 0 8px' }}>⌨️ <MathText text={q.prompt || 'Write your answer'} /></p>
      <CodeEditor value={code} onChange={setCode}
        placeholder={q.language ? `Write your ${q.language} here…` : 'Write your working / answer here… (you can include proofs with comments)'} />
      {q.language && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Language: {q.language}</div>}
      <GuidePanel subject={subject} prompt={q.prompt || ''} kind="code" getAttempt={() => code} />
      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <button className="btn green" disabled={busy || !code.trim()} onClick={submit}>{busy ? <><Spinner />Submitting…</> : '✅ Submit answer'}</button>
      </div>
      <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 6 }}><b>Ask</b> for hints (guiding, not the answer); <b>Submit</b> when you&apos;re sure.</p>
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

// The handwriting activity: draw a character, then have the AI check it.
function WritingQuestion({ q, translateTo, onDone }: { q: Q; translateTo: string; onDone: (correct: boolean, detail: any) => void }) {
  const [payload, setPayload] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (busy || !payload?.ready) return;
    setBusy(true);
    try {
      const r: any = await API.post('/api/tools/lesson/check-writing', { target: payload.target, image: payload.image });
      onDone(!!r.correct, { prompt: payload.prompt, your: '✍️ your drawing', answer: payload.target || '', correct: !!r.correct, image: payload.image, feedback: r.feedback });
    } catch {
      onDone(true, { prompt: q.prompt, your: '(saved)', answer: '', correct: true, feedback: 'Saved.' });
    }
    setBusy(false);
  };
  return (
    <div>
      <WritingCollector q={q} translateTo={translateTo} onAnswer={setPayload} />
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <button className="btn green" disabled={busy || !payload?.ready} onClick={check}>{busy ? <><Spinner />Checking…</> : '✅ Check with AI'}</button>
      </div>
    </div>
  );
}

// Static answer-key for a saved question (shown in the "original deck" history
// view): the prompt, the correct answer / marked options, and any explanation.
function AnswerKey({ q }: { q: Q }) {
  const opts = Array.isArray(q.options) ? q.options : [];
  const correct = String(q.answer ?? '');
  return (
    <div>
      {q.prompt && <p style={{ fontWeight: 600, margin: '0 0 6px' }}><MathText text={q.prompt} /></p>}
      {opts.length > 0 ? (
        <div style={{ display: 'grid', gap: 4 }}>
          {opts.map((o: any, i: number) => {
            const val = String(typeof o === 'object' ? (o.text ?? o.label ?? o.value ?? '') : o);
            const isRight = val === correct || (o && typeof o === 'object' && (o.correct === true));
            return (
              <div key={i} style={{ fontSize: 14, padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--ink)', background: isRight ? 'rgba(127,176,105,0.25)' : 'transparent' }}>
                {isRight ? '✓ ' : ''}<MathText text={val} />
              </div>
            );
          })}
        </div>
      ) : correct ? (
        <p style={{ fontSize: 14, margin: 0 }}>Answer: <b><MathText text={correct} /></b></p>
      ) : (
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>(Open-ended — no fixed answer.)</p>
      )}
      {q.explanation && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}><AIReply text={q.explanation} /></p>}
    </div>
  );
}

// A recommendation card for when THIS tool's history is empty: pick a random
// playable lesson from the rest of the platform and offer to open it. `nonce`
// reshuffles the pick so it's different each time.
function ElsewhereRecCard({ excludeSlug, nonce }: { excludeSlug?: string; nonce: number }) {
  const app = useApp();
  const [tool, setTool] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    API.get('/api/tools').then((r: any) => {
      const list = (Array.isArray(r?.tools) ? r.tools : []).filter((t: any) => t?.slug && t.slug !== excludeSlug && (t.archetype === 'lesson' || t.hasSavedDeck));
      if (alive && list.length) setTool(list[Math.floor(Math.random() * list.length)]);
      else if (alive) setTool(null);
    }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [excludeSlug, nonce]);
  if (!tool) return null;
  const open = async () => {
    try { const r = await API.get(`/api/tools?slug=${encodeURIComponent(tool.slug)}`); appState.activeTool = r?.tool || tool; } catch { appState.activeTool = tool; }
    app.nav('tool');
  };
  return (
    <div className="card" style={{ width: 260, minHeight: 300, display: 'flex', flexDirection: 'column', padding: 18 }}>
      <div style={{ fontSize: 11, opacity: 0.55, fontWeight: 700 }}>TRY ANOTHER LESSON</div>
      <h4 style={{ margin: '6px 0' }}>{tool.title}</h4>
      <p style={{ fontSize: 13, opacity: 0.8, flex: 1 }}>{String(tool.description || '').slice(0, 130)}</p>
      <button className="btn small green" onClick={open}>Open →</button>
    </div>
  );
}

export function LessonPlayer({ def, slug, canEdit = false, onImmersiveChange }: { def: any; slug: string; canEdit?: boolean; onImmersiveChange?: (immersive: boolean) => void }) {
  const lesson = def?.lesson || {};
  // Conversation / journal modes are a growing canvas thread, not a slide deck.
  if (lesson.mode === 'conversation' || lesson.mode === 'journal') {
    return <CanvasConversation def={def} slug={slug} />;
  }
  const settings = Array.isArray(def?.settings) ? def.settings : [];
  const levelField = settings.find((f: any) => f.id === 'level' || f.id === 'difficulty');
  const levels: string[] = levelField?.options?.length ? levelField.options : TEXT_LEVELS;

  const app = useApp();
  // Use the same global/per-page card settings source as Slides cards.
  const setupCardSize = useCardSize('slides');
  const setupImgMode = useImgSize('slides');
  const galleryCardSize = useCardSize('presrun');
  const galleryImgMode = useImgSize('presrun');
  const galleryCfg = galleryLayout(galleryCardSize);
  const [historyQ, setHistoryQ] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'fav'>('all');
  const [historyPage, setHistoryPage] = useState(1);
  // Only moderators and admins may PLAY / generate a presentation. A normal user
  // (or a guest / an admin previewing as a user) can only VIEW the saved history.
  const eff = app.eff();
  const canPlay = !!(eff.isAdmin || eff.isModerator);
  // A ▶ Play press is offered to everyone but gated by who they are:
  //   • signed-out visitor → prompted to sign in
  //   • signed-in normal user (no play credits) → sent to the dashboard to buy
  //     credits (request a coupon — see the WhatsApp note there)
  //   • moderator / admin → actually plays
  const gatedPlay = (run: () => void) => {
    if (!app.user) { app.requireLogin(); return; }
    if (!canPlay) { app.nav('dashboard'); return; }
    run();
  };
  const [phase, setPhase] = useState<'hub' | 'play' | 'done' | 'history'>('hub');
  // "Immersive" = actually inside a run (a slide, results, or the saved deck) — as
  // opposed to the hub (create form + gallery). The parent tool page hides its
  // title / author / share / comments / "more like this" chrome while immersive,
  // so the presentation reads like a focused player.
  const immersive = phase !== 'hub';
  useEffect(() => { onImmersiveChange?.(immersive); }, [immersive, onImmersiveChange]);
  const [form, setForm] = useState<Cfg>(() => {
    // Defaults: tone & category default to "Any (AI picks)" so the AI chooses
    // them unless the author overrides; tooltips default OFF.
    const d: any = defaultsFor(settings);
    // Gemini is the default TEXT API (falls back to auto if it isn't configured).
    return { ...d, tone: 'Any (AI picks)', category: 'Any (AI picks)', tooltips: false, textProvider: 'gemini' };
  });
  // Upgrade a legacy CEFR default (A1…C2) to the new academic scale so the
  // Difficulty dropdown always presents a current option.
  useEffect(() => {
    const lk = form.level ? 'level' : (form.difficulty ? 'difficulty' : '');
    if (lk && LEGACY_LEVEL_MAP[(form as any)[lk]]) setForm(s => ({ ...s, [lk]: LEGACY_LEVEL_MAP[(s as any)[lk]] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Viewing options (owner/admin-configured): 'both' | 'history' | 'replica'.
  const viewMode: 'both' | 'history' | 'replica' = ['both', 'history', 'replica'].includes(lesson.viewMode) ? lesson.viewMode : 'replica';
  const [savedDeck, setSavedDeck] = useState<any>(lesson.savedDeck || null);
  const hasSaved = !!(savedDeck?.slides?.length);
  const [wizardKey, setWizardKey] = useState(0);   // bump to reset the settings wizard to step 1
  const [wizardStep, setWizardStep] = useState(0);
  // Measured width of the create-card wizard, so the fields re-paginate into a
  // denser grid on a wide (full-width) card and fewer-per-page on a narrow one.
  // Callback ref (not a mount-only effect): the create card can render a beat
  // AFTER LessonPlayer mounts, so a one-shot effect may run before the wizard div
  // exists and never measure it — leaving wizardW at 0. A callback ref re-attaches
  // the observer whenever the node actually mounts, so the width is always read.
  const wizardRoRef = useRef<ResizeObserver | null>(null);
  const [wizardW, setWizardW] = useState(0);
  const wizardRef = useCallback((el: HTMLDivElement | null) => {
    wizardRoRef.current?.disconnect();
    if (!el) return;
    setWizardW(el.offsetWidth);
    const ro = new ResizeObserver((entries) => { for (const e of entries) setWizardW(e.contentRect.width); });
    ro.observe(el);
    wizardRoRef.current = ro;
  }, []);
  useEffect(() => { setWizardStep(0); }, [wizardKey]);
  const [deckMsg, setDeckMsg] = useState('');
  const offlineOn = lesson.offlineExport !== false;   // owner/admin can turn it off
  const [zipBusy, setZipBusy] = useState(false);
  // Save the current run's generated slides (with images + answers) as the
  // original deck so the results persist and are reachable via the tool's link /
  // the "OP results" button. `resultsArg` is the finisher's own score/answers.
  const savedRun = useRef(false);   // guard: auto-save a finished run only once
  const playedEntryId = useRef<string | null>(null);   // the history card, created only on finish
  const savedRunEntry = useRef(false);                 // guard: create the gallery card once per finished run
  const saveDeck = async (resultsArg?: Record<number, any>, silent = false) => {
    const gen = slidesRef.current.filter(Boolean);
    if (!gen.length) { if (!silent) setDeckMsg('Play through the deck first, then save.'); return; }
    if (!silent) setDeckMsg('Saving…');
    try {
      const r = await API.post('/api/tools/lesson/save-deck', { slug, config: cfgRef.current, slides: gen, results: resultsArg });
      if (r?.ok) {
        const deck: any = { config: cfgRef.current, slides: gen, savedBy: API.user?.username, savedAt: new Date().toISOString() };
        if (resultsArg) deck.results = resultsArg;
        setSavedDeck(deck); if (def?.lesson) def.lesson.savedDeck = deck;
        if (!silent) setDeckMsg(`Saved ✓ (${r.slideCount} slides)`);
      } else if (!silent) setDeckMsg(r?.error || 'Could not save.');
    } catch (e: any) { if (!silent) setDeckMsg(e?.message || 'Could not save.'); }
  };
  const [activities, setActivities] = useState<any[]>([]);
  const [example, setExample] = useState<any>(null);
  const [exBusy, setExBusy] = useState(false);
  const [topicIdeas, setTopicIdeas] = useState<string[]>([]);   // 5 suggested topics for the create form
  const [topicsBusy, setTopicsBusy] = useState(false);
  const [exHint, setExHint] = useState('');                     // steer the AI example
  // The donation cup is per-tool: its Bitcoin wallet and its 👁 collapse state are
  // editable by the tool's owner (OP) or an admin. When collapsed, regular users
  // just see the example centered; a manager sees a small "show" control.
  const isAdmin = API.user?.role === 'admin';
  const canManageDonation = canEdit || isAdmin;   // owner (canEdit) or admin

  // ── Study-path repo association ─────────────────────────────────────────────
  // A repository "adopts" a slide tool by pointing its studyToolSlug at that tool's
  // slug (set in the repo's own settings). Here we surface the SAME link from the
  // slide-tool side: find the repo that points at THIS tool (to offer an "open repo"
  // button) and let the owner/admin pick/change which repo it belongs to.
  const [repoList, setRepoList] = useState<any[]>([]);
  const loadRepoLinks = useCallback(() => {
    API.get('/api/tools?archetype=repo&limit=200').then((r: any) => setRepoList(Array.isArray(r?.tools) ? r.tools : [])).catch(() => { /* ignore */ });
  }, []);
  useEffect(() => { loadRepoLinks(); }, [loadRepoLinks]);
  const linkedRepo = repoList.find((t: any) => String(t?.definition?.repo?.studyToolSlug || '') === slug) || null;
  const editableRepos = repoList.filter((t: any) => eff.isAdmin || t.owner === app.user?.username);
  const openRepo = async (repoSlug: string) => {
    if (!repoSlug) return;
    try { const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(repoSlug)}`); appState.activeTool = r?.tool || { slug: repoSlug }; }
    catch { appState.activeTool = { slug: repoSlug }; }
    app.nav('tool');
  };
  // Point a repo's studyToolSlug at this tool (or clear it). Reuses the guarded
  // /api/tools/repo save with the repo's FULL body so nothing else is lost, and
  // unlinks whichever repo previously pointed here so the association stays 1:1.
  const [linking, setLinking] = useState(false);
  const setRepoStudyTool = async (repoSlug: string, value: string) => {
    const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(repoSlug)}`);
    const repo = r?.tool?.definition?.repo;
    if (!repo) throw new Error('Could not load that repository.');
    await API.post('/api/tools/repo', { slug: repoSlug, repo: { ...repo, studyToolSlug: value } });
  };
  const linkStudyRepo = async (repoSlug: string) => {
    setLinking(true);
    try {
      const prev = linkedRepo?.slug || '';
      if (prev && prev !== repoSlug) await setRepoStudyTool(prev, '');   // unlink the old repo
      if (repoSlug) await setRepoStudyTool(repoSlug, slug);              // link the chosen one
      loadRepoLinks();
    } catch (e: any) { alert(e?.message || 'Could not update the repo link.'); }
    setLinking(false);
  };

  const [donation, setDonation] = useState<{ address: string; collapsed: boolean }>({ address: '', collapsed: false });
  useEffect(() => { API.get(`/api/tools/donation?slug=${encodeURIComponent(slug)}`).then((r: any) => setDonation({ address: r?.address || '', collapsed: !!r?.collapsed })).catch(() => { /* ignore */ }); }, [slug]);
  const donateCollapsed = donation.collapsed;
  const toggleDonate = async () => {
    const next = !donateCollapsed;
    setDonation(d => ({ ...d, collapsed: next }));
    try { await API.put('/api/tools/donation', { slug, collapsed: next }); } catch { /* ignore */ }
  };
  const saveDonateAddress = async (address: string) => {
    setDonation(d => ({ ...d, address }));
    try { await API.put('/api/tools/donation', { slug, address }); } catch { /* ignore */ }
  };
  // Activities-feed controls.
  // Per-run favorites, keyed by the signed-in user so a new account / a guest
  // doesn't inherit whoever used this browser last.
  const favKey = () => { const u = app.user?.username; return u ? `sl_gen_favs:${u}` : null; };
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  useEffect(() => { const k = favKey(); if (!k) { setFavs({}); return; } try { setFavs(JSON.parse(localStorage.getItem(k) || '{}')); } catch { setFavs({}); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [app.user?.username]);
  const toggleFav = (id: string) => setFavs(f => { const n = { ...f }; if (n[id]) delete n[id]; else n[id] = true; const k = favKey(); if (k) try { localStorage.setItem(k, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const isGuest = !app.user;
  // A rotating recommendation for the empty-history state; the nonce reshuffles it.
  const [recNonce, setRecNonce] = useState(0);

  const fmtDateTime = (v: any) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };
  const supportTokens = (support: any) => {
    const out: string[] = [];
    if (support?.images) out.push('img');
    if (support?.tables) out.push('table');
    if (support?.formulas) out.push('formula');
    if (support?.code) out.push('code');
    if (support?.audio) out.push('audio');
    if (support?.geogebra) out.push('graph');
    return out;
  };
  const activityToken = (kind: string) => {
    const k = String(kind || '').trim().toLowerCase();
    if (k === 'mcq') return 'mcq4';
    if (k === 'fill-blank') return 'fill-blank';
    if (k === 'input') return 'write-answer';
    if (k === 'writing') return 'handwriting';
    if (k === 'annotation') return 'annotation';
    if (k === 'code') return 'code-box';
    return k || 'mcq4';
  };
  const slideComboHint = () => {
    const pages = Array.isArray(lesson?.pages) ? lesson.pages : [];
    const lessonSupport = lesson?.support || {};
    const lessonActivities = Array.isArray(lesson?.activityTypes) ? lesson.activityTypes : [];
    const slots = pages.length ? pages.slice(0, 12) : [{}];
    return slots.map((p: any, i: number) => {
      const readingOn = p?.reading !== false;
      const paraCount = Math.max(1, Math.min(4, parseInt(p?.paragraphsPerSlide, 10) || parseInt(lesson?.paragraphsPerSlide, 10) || 1));
      const seq: string[] = [];
      if (readingOn) for (let j = 0; j < paraCount; j += 1) seq.push('text');
      seq.push(...supportTokens({ ...lessonSupport, ...(p?.support || {}) }));
      const acts = (Array.isArray(p?.activityTypes) && p.activityTypes.length ? p.activityTypes : lessonActivities).map(activityToken).filter(Boolean);
      const evalPart = acts.length ? `[${acts.join(' | ')}]` : '[mcq4 | fill-blank | write-answer]';
      return `${i + 1}: ${[...seq, evalPart].join(', ')}`;
    }).join(' ; ');
  };

  // --- Rendition cards: the same AI-changing distortion powers as a tool card. ---
  // Anyone may edit their OWN rendition; the owner/admin may edit any. `data` on
  // each entry carries the distorted title/subtitle/thumbnail.
  const [distBusy, setDistBusy] = useState<Record<string, boolean>>({});
  const canEditEntry = (e: any) => canEdit || e.username === API.user?.username;
  const mergeEntry = (id: string, data: any) => setActivities(list => list.map(e => e.id === id ? { ...e, data: { ...(e.data || {}), ...(data || {}) } } : e));
  const distort = async (e: any, action: string, extra: any = {}) => {
    setDistBusy(b => ({ ...b, [e.id]: true }));
    try {
      const r = await API.post('/api/tools/entries/distort', { slug, entryId: e.id, action, ...extra });
      if (r?.data) mergeEntry(e.id, r.data);
      else if (r?.error) alert(r.error);
    } catch (err: any) { alert(err?.message || 'Could not update.'); }
    finally { setDistBusy(b => { const n = { ...b }; delete n[e.id]; return n; }); }
  };
  // Inline edit modal for a rendition card (replaces window.prompt, which silently
  // fails / is blocked in many browsers). kind 'text' edits title + subtitle;
  // kind 'image' takes a custom AI-image prompt.
  const [cardEdit, setCardEdit] = useState<null | { e: any; kind: 'text' | 'image'; title: string; subtitle: string; prompt: string }>(null);
  const editEntryText = (e: any) => setCardEdit({ e, kind: 'text', title: e.data?.title || label(e.data || {}), subtitle: e.data?.subtitle || '', prompt: '' });
  const promptEntryImage = (e: any) => setCardEdit({ e, kind: 'image', title: '', subtitle: '', prompt: '' });
  const submitCardEdit = async () => {
    if (!cardEdit) return;
    const { e, kind, title, subtitle, prompt } = cardEdit;
    setCardEdit(null);
    if (kind === 'text') await distort(e, 'set', { title: title.trim() || (e.data?.title || label(e.data || {})), subtitle: subtitle.trim() });
    else await distort(e, 'image', { instruction: prompt.trim() });
  };
  const uploadEntryImage = (e: any) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => distort(e, 'set', { image: String(reader.result || '') });
      reader.readAsDataURL(f);
    };
    inp.click();
  };
  // 🎲 Remove the card's AI/uploaded image so it goes back to a random emoji (which
  // re-shuffles on every page load). To show a picture again, use 🎨 / ✎ / 📎.
  const clearEntryImage = (e: any) => { delete randEmojis.current[e.id]; distort(e, 'clearimage'); };
  const deleteRendition = async (e: any) => {
    if (!confirm('Delete this rendition from the history?')) return;
    try {
      const r = await API.call('DELETE', '/api/tools/entries', { slug, entryId: e.id });
      if (r?.ok) setActivities(list => list.filter(x => x.id !== e.id));
      else alert(r?.error || 'Could not delete.');
    } catch (err: any) { alert(err?.message || 'Could not delete.'); }
  };

  const [cfg, setCfg] = useState<Cfg>({});
  const total = () => Math.max(1, Math.min(MAX_SLIDES, parseInt(cfg.slides, 10) || parseInt(lesson.totalSlides, 10) || 5));
  const [slides, setSlides] = useState<(Slide | null)[]>([]);   // cached by 0-based index
  const [cur, setCur] = useState(0);
  // Which slides are FULLY ready to reveal (text + all visuals warmed). Until a
  // slide is ready the player shows the pencil skeleton instead of a half-loaded
  // slide, so the first slide appears complete and later slides (warmed in the
  // background) show instantly on arrival.
  const [slideReady, setSlideReady] = useState<Record<number, boolean>>({});
  const markReady = (idx: number, ready: boolean) => setSlideReady((m) => ({ ...m, [idx]: ready }));
  // The signed-in user's wallet balance (null = unknown / not signed in), used to
  // check a generation is affordable before starting. A gate message is shown by
  // the Generate button when a run would cost more credits than the user has.
  const [balance, setBalance] = useState<number | null>(null);
  const [gateMsg, setGateMsg] = useState('');
  const [results, setResults] = useState<Record<number, SlideRes>>({});
  const [genBusy, setGenBusy] = useState(false);                // fetching a slide
  const [err, setErr] = useState('');
  const [showReview, setShowReview] = useState(false);
  // Per-slide text level (the gear on the slide) + re-leveling spinner.
  const [slideLevel, setSlideLevel] = useState<Record<number, string>>({});
  // Per-slide favorites during a run — the ★ button. Saved with the finished run
  // (data.favorites = the favorited slide indices). A ref mirrors it so the finish
  // handler reads the latest set without a stale closure.
  const [favSlides, setFavSlides] = useState<Record<number, boolean>>({});
  const favSlidesRef = useRef<Record<number, boolean>>({});
  const toggleFavSlide = (i: number) => setFavSlides(prev => { const n = { ...prev }; if (n[i]) delete n[i]; else n[i] = true; favSlidesRef.current = n; return n; });
  const [relevelBusy, setRelevelBusy] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  // 🧩 "change this slide" box: the learner types a change (add/remove a
  // component or question, tweak the content) and Apply regenerates THIS slide.
  const [modOpen, setModOpen] = useState(false);
  const [modText, setModText] = useState('');
  const [modBusy, setModBusy] = useState(false);
  // 🖼 per-slide image art style (overrides the tool's preset) + a nonce that
  // forces the SupportsLoader to re-fetch the images when the style changes.
  const [slideImgStyle, setSlideImgStyle] = useState<Record<number, string>>({});
  const [imgStyleOpen, setImgStyleOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  // The create form's image-style picker is in "custom" mode (a typed style).
  const [customImg, setCustomImg] = useState(false);
  // Whether the create/settings card is EXPANDED. Collapsed (the default) shows
  // only the essentials — topic, level, slides + Play; expanded shows every knob.
  // The choice is remembered across visits (localStorage), shared by all tools.
  // Whether the create-new settings section is expanded on the page. Visible by
  // default; the ⚙️/▾ toggle hides it (persisted) so the page can show just the gallery.
  const [settingsOpen, setSettingsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    try { return localStorage.getItem('sl_lesson_settings_open') !== '0'; } catch { return true; }
  });
  useEffect(() => { try { setSettingsOpen(localStorage.getItem('sl_lesson_settings_open') === '1'); } catch { /* ignore */ } }, []);
  const toggleSettings = () => setSettingsOpen((o) => { const n = !o; try { localStorage.setItem('sl_lesson_settings_open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  // Edit this tool's layout in the SAME Studio used to create slide tools, pre-loaded
  // with the tool's saved per-slide layout (from its studioConfig if present, else
  // reconstructed from lesson.pages). Publishing there updates THIS tool.
  const openLayoutEditor = () => {
    const sc: any = (def as any).studioConfig;
    const pages = sc && Array.isArray(sc.pages) && sc.pages.length ? sc.pages : lessonToStudioPages(lesson);
    appState.builderSeed = {
      artifact: 'presentation',
      title: String(def.title || '').replace(/^(Presentation|Collection) — /, ''),
      subject: (lesson as any).subject || '',
      tone: (lesson as any).tone || (sc?.tone) || '',
      context: (def as any).description || '',
      pages,
      editSlug: slug,
    };
    appState.activeTool = appState.activeTool || { slug, definition: def };
    app.nav('toolbuilder');
  };
  // The study source / AI guidance (lesson.style) is still fed into every slide's
  // generation prompt; it is now edited via the Studio ("✏️ Edit layout &
  // activities"), not an on-page command center.
  // Available image + text backends (from /api/config) + the run's chosen ones.
  const [imageProviders, setImageProviders] = useState<{ id: string; label: string }[]>([]);
  const [textProviders, setTextProviders] = useState<{ id: string; label: string }[]>([]);
  const [providerOpen, setProviderOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [suggestingField, setSuggestingField] = useState<Record<string, boolean>>({});
  useEffect(() => { API.get('/api/config').then((c: any) => { setImageProviders(Array.isArray(c?.imageProviders) ? c.imageProviders : []); setTextProviders(Array.isArray(c?.textProviders) ? c.textProviders : []); }).catch(() => { /* ignore */ }); }, []);
  const [supportNonce, setSupportNonce] = useState(0);
  // A random emoji per rendition card that has no real image, picked ONCE per page
  // load (kept in a ref keyed by entry id) so cards with no picture keep shuffling
  // to a new random emoji on every refresh, but stay stable while you browse.
  const randEmojis = useRef<Record<string, string>>({});
  // Per-slide, per-level cache of re-leveled text/questions (the ⚙ gear). Switching
  // a slide to a level it was already generated at restores it instantly, and
  // switching back to an earlier level returns the exact text saved for it.
  const levelCache = useRef<Record<number, Record<string, { content?: string; translation?: string; questions?: any[] }>>>({});
  // Refs let the background prefetch read the latest state without stale closures.
  const slidesRef = useRef<(Slide | null)[]>([]);
  const cfgRef = useRef<Cfg>({});
  const prefetching = useRef<Record<number, Promise<void> | undefined>>({});
  const startedAt = useRef(0);   // when the current play began, for the end-slide time
  const restoredPlay = useRef(false);   // guards the one-time resume-after-refresh restore
  // Where this lesson came FROM — the origin repo (by stable slug) + unit/lesson —
  // set from the 🎬 study-path seed, surfaced in the admin run record.
  const lessonOriginRef = useRef<{ repoSlug?: string; repoTitle?: string; unitTitle?: string; lessonTitle?: string; lessonIndex?: number; lessonCount?: number } | null>(null);
  // Per-PLAY slide order. The designed deck stores pages in a fixed order, but a
  // presentation shouldn't play identically every time: the FIRST page is always
  // the intro, and the remaining pages are SHUFFLED for each run so a middle- or
  // last-designed slide can appear earlier. Holds display-position → original page
  // index; empty/identity when there are no designed pages to reorder.
  const pageOrderRef = useRef<number[]>([]);
  useEffect(() => { slidesRef.current = slides; }, [slides]);
  // Changing slide silences any audio still playing from the previous slide
  // (belt-and-braces with the AudioButton unmount cleanup) and jumps the view to
  // the top so each newly-shown card starts at the progress bar, not scrolled
  // down where the previous slide's questions were.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('audio').forEach((a) => { try { a.pause(); a.currentTime = 0; } catch { /* ignore */ } });
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    if (phase === 'play') window.scrollTo(0, 0);
  }, [cur]);

  // Warm ALL of a (pre)fetched slide's support materials (image, table, formula,
  // wolfram, …) ahead of time, caching the in-flight requests on the slide the
  // same way SupportsLoader does. Resolves once every piece is loaded, so callers
  // can hold the pencil until the WHOLE slide (text + visuals) is ready to reveal,
  // and the next slide can be fully warmed in the background. Images use the
  // watchdog helper so a slow provider is switched out. Best-effort: never rejects.
  const warmSupports = (sl: any): Promise<void> => {
    try {
      const plan: string[] = Array.isArray(sl?.supportPlan) ? sl.supportPlan : [];
      if (!plan.length) return Promise.resolve();
      if (!sl._supports || sl._supports.length !== plan.length) sl._supports = plan.map(() => undefined);
      if (!sl._supportP || sl._supportP.length !== plan.length) sl._supportP = plan.map(() => undefined);
      const ctx = { lesson, values: cfgRef.current, imageStyle: cfgRef.current.imageStyle || '', imageProvider: cfgRef.current.imageProvider || '' };
      plan.forEach((type, i) => {
        if (sl._supports[i] !== undefined || sl._supportP[i]) return;   // already warmed / loading
        sl._supportP[i] = loadSupport(type, ctx, sl)
          .then((support: any) => { sl._supports[i] = support ?? null; })
          .catch(() => { sl._supports[i] = null; });
      });
      return Promise.all((sl._supportP as any[]).filter(Boolean)).then(() => undefined).catch(() => undefined);
    } catch { return Promise.resolve(); }
  };

  // Build the "what the learner has already seen" digest for the slide being
  // generated (0-based `upto` = the slide index being built; earlier slides are
  // 0..upto-1). It carries each earlier slide's TITLE and a trimmed excerpt of
  // its reading — NOT just the titles — so the generator can see the actual prose
  // already shown and go DEEPER instead of repeating the same sentences/passages.
  const priorDigest = (upto: number): string => {
    const out: string[] = [];
    for (let i = 0; i < upto && i < slidesRef.current.length; i++) {
      const s = slidesRef.current[i] as Slide | null;
      if (!s) continue;
      const title = String(s.title || '').trim();
      const body = String(s.content || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      out.push(`Slide ${i + 1}${title ? ` "${title}"` : ''}: ${body}`);
    }
    return out.slice(-6).join('\n');
  };

  // Roll a fresh play order for THIS run: the intro (page 0) stays first and the
  // rest are Fisher–Yates shuffled. A no-op unless there are 3+ designed pages.
  const shufflePages = () => {
    const pages = Array.isArray(lesson.pages) ? lesson.pages : [];
    const n = pages.length;
    if (n <= 2) { pageOrderRef.current = pages.map((_: any, i: number) => i); return; }
    const rest = pages.map((_: any, i: number) => i).slice(1);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    pageOrderRef.current = [0, ...rest];
  };
  // The lesson to SEND for slide requests, with `pages` reordered to this run's
  // play order so slide N (1-based) maps to the shuffled page. Every non-page field
  // (subject, level, theme, style…) is left untouched. Falls back to the raw lesson
  // when there is nothing to reorder.
  const runLesson = (): any => {
    const pages = Array.isArray(lesson.pages) ? lesson.pages : null;
    const order = pageOrderRef.current;
    if (!pages || order.length !== pages.length) return lesson;
    return { ...lesson, pages: order.map((i) => pages[i]) };
  };

  // Quietly load slide `idx` in the BACKGROUND (no spinner), so Next is instant
  // for EVERY answer type — including AI-checked ones that don't block on it.
  const prefetch = (idx: number): Promise<void> | undefined => {
    if (idx < 0 || idx >= total() || slidesRef.current[idx] || prefetching.current[idx]) return prefetching.current[idx];
    const p = (async () => {
      try {
        const r = await API.post('/api/tools/lesson/slide', { lesson: runLesson(), values: cfgRef.current, slideNumber: idx + 1, priorSummary: priorDigest(idx) });
        // Publish to slidesRef SYNCHRONOUSLY: the ref normally syncs via an effect
        // that only runs after a re-render, which is too late for the Next click
        // that is awaiting this prefetch — that made Next need two clicks.
        if (!slidesRef.current[idx]) { const nr = [...slidesRef.current]; nr[idx] = r; slidesRef.current = nr; }
        setSlides((sc) => { if (sc[idx]) return sc; const n = [...sc]; n[idx] = r; return n; });
        // Fully warm the next slide's visuals in the BACKGROUND while the learner is
        // still on the current slide — image generation is the slow part, so this
        // makes the whole slide (picture + tables + …) appear instantly on arrival.
        // Mark it ready only once everything is warmed.
        warmSupports(r).then(() => markReady(idx, true));
      } catch { /* goNext will fetch on demand if this failed */ }
      finally { delete prefetching.current[idx]; }
    })();
    prefetching.current[idx] = p;
    return p;
  };

  const loadActivities = async () => {
    // Keep the server's newest-first order (do NOT shuffle) so a run the learner
    // just played reliably shows at the top of the gallery / first page, instead
    // of being scattered somewhere in the pagination.
    try { const r = await API.get(`/api/tools/entries?slug=${encodeURIComponent(slug)}`); setActivities(Array.isArray(r?.entries) ? r.entries : []); } catch { /* ignore */ }
  };
  const refreshExample = async () => {
    setExBusy(true);
    try { const r = await API.post('/api/tools/lesson/suggest', { lesson, levels, title: def?.title, avoid: example?.topic || '', hint: exHint.trim() }); setExample(r); } catch { /* ignore */ }
    setExBusy(false);
  };
  // Fetch 5 suggested topics for this course (the create form's topic dropdown).
  // `fresh` = a manual refresh (🎨 / 🔄): avoid the topics currently shown so the
  // dropdown shows a DIFFERENT set each press, and select the first new one.
  const loadTopics = async (fresh = false) => {
    setTopicsBusy(true);
    try {
      const r = await API.post('/api/tools/lesson/suggest', { lesson, levels, count: 5, avoid: fresh ? topicIdeas.join(', ') : '' });
      const ideas = Array.isArray(r?.topics) ? r.topics.map(String).filter(Boolean) : [];
      if (ideas.length) {
        setTopicIdeas(ideas);
        // On a manual refresh always jump to a new topic; on first load only if unset.
        setForm(s => (fresh || !s.topic ? { ...s, topic: ideas[0] } : s));
      }
    } catch { /* ignore */ }
    setTopicsBusy(false);
  };
  useEffect(() => { loadActivities(); refreshExample(); loadTopics(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);
  // Keep the wallet balance handy so we can price a generation before starting it.
  // Refresh when returning to the hub (a finished run has spent credits).
  const loadBalance = () => { if (!app.user) { setBalance(null); return; } API.get('/api/tokens').then((t: any) => setBalance(typeof t?.balance === 'number' ? t.balance : null)).catch(() => { /* ignore */ }); };
  useEffect(() => { if (phase === 'hub') loadBalance(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [phase, app.user?.username]);

  // Fetch slide `idx` (0-based) into the cache. Returns true on success.
  const fetchInto = async (idx: number, useCfg: Cfg): Promise<boolean> => {
    cfgRef.current = useCfg;
    setGenBusy(true); setErr('');
    try {
      const r = await API.post('/api/tools/lesson/slide', { lesson: runLesson(), values: useCfg, slideNumber: idx + 1, priorSummary: priorDigest(idx) });
      setSlides(sc => { const n = [...sc]; n[idx] = r; slidesRef.current = n; return n; });
      setGenBusy(false);
      // Keep the pencil until the WHOLE slide is ready — warm its visuals, then
      // reveal. Slides with no visuals are ready immediately.
      markReady(idx, false);
      warmSupports(r).then(() => markReady(idx, true));
      prefetch(idx + 1);               // start loading the NEXT slide in the background
      return true;
    } catch (e: any) { setErr(e?.message || 'Could not load the slide.'); setGenBusy(false); return false; }
  };

  const play = (c: Cfg) => {
    cfgRef.current = c; slidesRef.current = []; prefetching.current = {}; startedAt.current = Date.now();
    shufflePages();   // roll a fresh slide order for this run (intro stays first)
    savedRun.current = false;   // this fresh run hasn't been auto-saved yet
    setFavSlides({}); favSlidesRef.current = {};
    setCfg(c); setSlides([]); setSlideReady({}); setResults({}); setCur(0); setShowReview(false); setErr(''); setPhase('play');
    fetchInto(0, c);
  };

  // When the OWNER/ADMIN finishes a run, auto-save the completed deck (slides +
  // images + answers + their results) so "OP results" is always available and the
  // results are reachable again via the tool's share link — no manual step needed.
  useEffect(() => {
    // Jump to the TOP whenever the view changes — so starting a lesson lands on
    // the progress bar (not scrolled halfway down where the gallery card was), and
    // the results screen shows the score without scrolling.
    if (phase === 'play' || phase === 'done' || phase === 'history') window.scrollTo(0, 0);
    // The owner/admin's finished run auto-saves the canonical deck (silently, no
    // manual "save" button). Every play — by anyone — is already saved to the
    // tool's gallery as its own rendition entry when it starts, so finished games
    // always appear there.
    if (phase === 'done' && canEdit && !savedRun.current && slidesRef.current.filter(Boolean).length) {
      savedRun.current = true;
      saveDeck(results, true);
    }
    // CREATE the gallery card — ONLY now that the run has reached the end. This is
    // the single point a rendition is saved: an abandoned run (that never reaches
    // 'done') leaves no card. The card carries the run's FINAL config (all in-play
    // tweaks) plus the score. No image is auto-generated — a card with no picture
    // shows a random emoji until someone presses 🎨 on it.
    if (phase === 'done' && !savedRunEntry.current && slidesRef.current.filter(Boolean).length) {
      savedRunEntry.current = true;
      const cfg = cfgRef.current || {};
      const all = Object.values(results).flatMap((r: any) => Object.values(r.answers || {}));
      const answered = all.length;
      const correct = all.filter((d: any) => d.correct).length;
      const pct = answered ? Math.round((correct / answered) * 100) : 0;
      const favs = Object.keys(favSlidesRef.current).map(Number).sort((a, b) => a - b);
      const data: Cfg = { ...cfg, ...(answered ? { score: pct } : {}), ...(favs.length ? { favorites: favs } : {}) };
      API.post('/api/tools/entries', { slug, data })
        .then((r: any) => { playedEntryId.current = r?.entry?.id || null; loadActivities(); })
        .catch(() => { /* best-effort */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const defaultCat = () => lesson.subjectKind === 'math' ? 'Mathematics' : lesson.subjectKind === 'programming' ? 'Technology' : lesson.subjectKind === 'language' ? 'Language Learning' : 'Science';
  // Start a play. The gallery card is NOT created here — a rendition is only saved
  // to the gallery when the learner REACHES THE END (see the 'done' effect). An
  // abandoned run leaves no card. The run's config (incl. any AI-suggested/replica
  // flags) is stashed so the finish handler can save it.
  const recordAndPlay = async (c: Cfg, extra?: Record<string, any>) => {
    const cc: Cfg = { ...c, level: c.level || c.difficulty || levels[0], topic: c.topic || '', category: c.category || defaultCat(), ...extra };
    // "Any (AI picks)" tone means: don't constrain the AI — drop it so the generator
    // chooses the voice itself.
    if ((cc as any).tone === 'Any (AI picks)') delete (cc as any).tone;
    // Credit gate: you may start (and finish) a generation while you still have a
    // positive balance — even if the estimate exceeds it, so a run isn't cut off
    // mid-way — but once your balance is at zero or negative you're redirected to
    // the dashboard to buy more. Admins are unlimited. The estimate is shown by
    // the button as a heads-up.
    if (!eff.isAdmin && typeof balance === 'number' && balance <= 0) {
      setGateMsg(`You're out of credits (balance ${balance.toLocaleString()}). Get more to generate.`);
      app.nav('dashboard');
      return;
    }
    setGateMsg('');
    playedEntryId.current = null; savedRunEntry.current = false;
    play(cc);
  };
  const createAndPlay = () => recordAndPlay(form);

  // Consume an "open intent" from a Posts-carousel card (once): jump to the saved
  // results/report, or generate a fresh run of that rendition.
  const intentDone = useRef(false);
  useEffect(() => {
    if (intentDone.current) return;
    // A shared "results" link (?results=1) opens straight on the saved results page,
    // so anyone with the link sees the finished run without hunting for the 📖 card.
    let urlResults = false;
    try { urlResults = new URLSearchParams(window.location.search).get('results') === '1'; } catch { /* ignore */ }
    const intent = appState.openIntent;
    if (!intent && !urlResults) return;
    intentDone.current = true; appState.openIntent = null;
    if (urlResults || intent?.action === 'results') { if (hasSaved) { setPhase('history'); window.scrollTo(0, 0); } }
    else if (intent?.action === 'replay') { recordAndPlay(intent.config || {}, { replica: true }); }
    else if (intent?.action === 'generate') { recordAndPlay(intent.config && Object.keys(intent.config).length ? intent.config : form); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Consume a study-path "slide seed" once: a repo card can prefill the create
  // form and optionally auto-start generation for one-click lesson launches.
  const seedDone = useRef(false);
  useEffect(() => {
    if (seedDone.current) return;
    const seed = appState.slideSeed;
    if (!seed) return;
    seedDone.current = true; appState.slideSeed = null;
    // Remember the origin repo (stable slug) + unit/lesson so the run record can link back.
    lessonOriginRef.current = {
      repoSlug: seed.repoSlug || '', repoTitle: seed.repoTitle || '', unitTitle: seed.unitTitle || '',
      lessonTitle: seed.lessonTitle || '', lessonIndex: seed.lessonIndex, lessonCount: seed.lessonCount,
    };
    const topic = String(seed.topic || '').trim();
    const customInstructions = String(seed.customInstructions || '').trim();
    if (!topic && !seed.slides && !customInstructions) return;
    let seededCfg: Cfg | null = null;
    setForm(s => {
      seededCfg = {
        ...s,
        ...(topic ? { topic } : {}),
        ...(seed.slides ? { slides: seed.slides } : {}),
        ...(customInstructions ? { custom: customInstructions } : {}),
      };
      return seededCfg;
    });
    // Land on the create form (hub) so the preset topic is visible, and scroll to it.
    setPhase('hub'); try { window.scrollTo(0, 0); } catch { /* ignore */ }
    if (seed.autoGenerate) {
      const cfg = seededCfg;
      if (cfg) setTimeout(() => { recordAndPlay(cfg); }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resume-after-refresh ────────────────────────────────────────────────────
  // A play session (which slide, answers so far, the generated deck) lives only in
  // memory, so a page refresh used to drop the learner back to the create screen.
  // Persist it per tool to sessionStorage and restore it on load, so a refresh keeps
  // you on the SAME lesson and the SAME slide. Best-effort: if the deck (with images)
  // is too large for the quota, we retry without the heavy image data URLs.
  const playKey = `sl_play:${slug}`;
  const savePlay = useCallback(() => {
    if (typeof sessionStorage === 'undefined') return;
    if (phase !== 'play' && phase !== 'done') return;
    const payload = { v: 1, phase, cur, cfg: cfgRef.current, results, startedAt: startedAt.current, slides: slidesRef.current, origin: lessonOriginRef.current };
    try { sessionStorage.setItem(playKey, JSON.stringify(payload)); }
    catch {
      // Quota hit — drop long data:/base64 media so the text + progress still persist.
      try { sessionStorage.setItem(playKey, JSON.stringify(payload, (_k, v) => (typeof v === 'string' && v.length > 4000 && /^data:|base64/i.test(v) ? '' : v))); }
      catch { /* give up — resume just won't be available for this deck */ }
    }
  }, [phase, cur, results, playKey]);
  const clearPlay = useCallback(() => { try { sessionStorage.removeItem(playKey); } catch { /* ignore */ } }, [playKey]);
  // Write the session whenever the meaningful play state changes.
  useEffect(() => { savePlay(); }, [savePlay, slides]);
  // Restore ONCE on mount (a plain refresh has no slideSeed; a study-path launch does
  // and takes precedence, so we skip the restore then).
  useEffect(() => {
    if (restoredPlay.current) return;
    restoredPlay.current = true;
    if (typeof sessionStorage === 'undefined' || appState.slideSeed) return;
    try {
      const raw = sessionStorage.getItem(playKey);
      if (!raw) return;
      const p = JSON.parse(raw);
      const sl = Array.isArray(p?.slides) ? p.slides : [];
      if (!p || (p.phase !== 'play' && p.phase !== 'done') || !sl.filter(Boolean).length) return;
      cfgRef.current = p.cfg || {}; slidesRef.current = sl; startedAt.current = p.startedAt || Date.now();
      if (p.origin) lessonOriginRef.current = p.origin;
      setCfg(p.cfg || {}); setSlides(sl); setResults(p.results || {}); setCur(Math.max(0, Number(p.cur) || 0)); setPhase(p.phase);
      try { window.scrollTo(0, 0); } catch { /* ignore */ }
    } catch { /* ignore a corrupt entry */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add a preset lesson to the history WITHOUT playing it (and with no image). It
  // shows up as a fresh card in the feed whose no-photo spot carries the usual
  // 🎨/✎/📎 buttons, so an image can be added later.
  const [addMsg, setAddMsg] = useState('');
  const addToHistory = async (c: Cfg, extra?: Record<string, any>) => {
    const cc: Cfg = { ...c, level: c.level || c.difficulty || levels[0], topic: c.topic || '', category: c.category || defaultCat(), ...extra };
    if ((cc as any).tone === 'Any (AI picks)') delete (cc as any).tone;
    try {
      await API.post('/api/tools/entries', { slug, data: cc });
      setAddMsg('Added to the gallery below ✓'); setTimeout(() => setAddMsg(''), 4000);
      loadActivities();      // the new card shows in the gallery/history below
      refreshExample();      // propose a fresh generation to play or add again
    } catch (e: any) {
      setAddMsg(e?.message || 'Could not add — please try again.'); setTimeout(() => setAddMsg(''), 5000);
    }
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
    // Do NOT scroll on submit — the learner stays exactly where they answered so
    // the red/green feedback and the Next button are right there, no hunting.
    // (The view only jumps to the top when the NEXT slide loads.)
  };

  // Re-explain THIS slide at a chosen level (the gear on the slide): the teaching
  // text AND the questions move together — deeper/longer/more challenging as the
  // level rises. Because the questions change, this slide's recorded answers are
  // cleared so the new questions start fresh. Support/images are left untouched.
  const relevel = async (lvl: string) => {
    const s = slidesRef.current[cur]; if (!s) return;
    // The level this slide's CURRENT text is at (so we can save it before switching).
    const curLvl = String(slideLevel[cur] || cfg.level || cfg.difficulty || levels[0]);
    if (curLvl === lvl && (levelCache.current[cur]?.[lvl])) { setLevelOpen(false); return; }
    setLevelOpen(false);
    // Remember the current slide's text/questions under its current level, so
    // switching back to it later restores it instantly (no regeneration).
    const bucket = (levelCache.current[cur] = levelCache.current[cur] || {});
    if (!bucket[curLvl]) bucket[curLvl] = { content: s.content, translation: s.translation, questions: s.questions };

    // Carry the new level FORWARD: update the run config so every slide generated
    // after this one uses the new level, and discard any already-prefetched slides
    // ahead of the current one so they regenerate at the new level.
    cfgRef.current = { ...cfgRef.current, level: lvl, difficulty: lvl };
    setCfg((c) => ({ ...c, level: lvl, difficulty: lvl }));
    const kept = slidesRef.current.map((sl, i) => (i > cur ? null : sl));
    slidesRef.current = kept; setSlides(kept);
    setSlideReady((m) => { const n = { ...m }; Object.keys(n).forEach((k) => { if (Number(k) > cur) delete n[Number(k)]; }); return n; });
    Object.keys(prefetching.current).forEach((k) => { if (Number(k) > cur) delete prefetching.current[Number(k)]; });
    setSlideLevel((m) => { const n: Record<number, string> = {}; for (const k of Object.keys(m)) { if (Number(k) <= cur) n[Number(k)] = m[Number(k)]; } n[cur] = lvl; return n; });

    // Apply a slide's text/questions (from cache or a fresh relevel) to slide `cur`.
    const applyLeveled = (r: { content?: string; translation?: string; questions?: any[] }) => {
      setSlides((sc) => {
        const n = [...sc];
        if (n[cur]) n[cur] = {
          ...(n[cur] as Slide),
          content: r.content || (n[cur] as Slide).content,
          translation: r.translation || (n[cur] as Slide).translation,
          questions: Array.isArray(r.questions) && r.questions.length ? r.questions : (n[cur] as Slide).questions,
        };
        slidesRef.current = n; return n;
      });
      // Questions differ per level — drop this slide's recorded answers.
      setResults((rr) => { const n = { ...rr }; delete n[cur]; return n; });
    };

    // Already generated this slide at this level before → restore instantly.
    if (bucket[lvl]) { applyLeveled(bucket[lvl]); prefetch(cur + 1); return; }

    setRelevelBusy(true);
    prefetch(cur + 1);
    try {
      const r = await API.post('/api/tools/lesson/relevel', {
        subject: lesson.subject, topic: cfg.topic || '', title: s.title, content: s.content, translation: s.translation,
        level: lvl, language: lesson.language, translateTo: lesson.translateTo, paragraphs: cfg.paragraphs, length: cfg.length,
        density: cfg.density || '', questions: s.questions || [],
      });
      if (r?.content || Array.isArray(r?.questions)) {
        const leveled = {
          content: r.content || s.content,
          translation: r.translation || s.translation,
          questions: Array.isArray(r.questions) && r.questions.length ? r.questions : s.questions,
        };
        bucket[lvl] = leveled;   // save for instant return later
        applyLeveled(leveled);
      }
    } catch { /* keep the current text */ }
    setRelevelBusy(false);
  };

  // Regenerate THIS slide applying the learner's change request. Apply IS the
  // send + refresh: it asks the AI, waits, then swaps the slide in place (and
  // clears its answers so the new questions start fresh).
  const applyModify = async () => {
    const s = slidesRef.current[cur]; if (!s || modBusy || !modText.trim()) return;
    setModBusy(true);
    try {
      const r = await API.post('/api/tools/lesson/slide', { lesson: runLesson(), values: cfgRef.current, slideNumber: cur + 1, priorSummary: priorDigest(cur), modify: modText.trim() });
      if (r?.content || (Array.isArray(r?.questions) && r.questions.length) || r?.title) {
        setSlides((sc) => { const n = [...sc]; n[cur] = r; slidesRef.current = n; return n; });
        setResults((rr) => { const n = { ...rr }; delete n[cur]; return n; });
        setModText(''); setModOpen(false);
        // The rebuilt slide has fresh visuals — hold the pencil until they warm.
        markReady(cur, false);
        warmSupports(r).then(() => markReady(cur, true));
      }
    } catch { /* keep the current slide */ }
    setModBusy(false);
  };

  // Change the image art style for the WHOLE presentation. It becomes the run's
  // image style (so every slide — including ones generated later — uses it), any
  // per-slide overrides are cleared, and every slide's cached images are dropped
  // so they regenerate with the new style when viewed.
  const setSlideImageStyle = (style: string) => {
    setImgStyleOpen(false);
    cfgRef.current = { ...cfgRef.current, imageStyle: style };
    setCfg((c) => ({ ...c, imageStyle: style }));
    setSlideImgStyle({});   // drop per-slide overrides — the new style is global
    // Invalidate cached image supports on EVERY loaded slide so they refetch.
    slidesRef.current.forEach((sl: any) => {
      if (sl && Array.isArray(sl.supportPlan)) {
        sl.supportPlan.forEach((t: string, i: number) => { if (t === 'image') { if (sl._supports) sl._supports[i] = undefined; if (sl._supportP) sl._supportP[i] = undefined; } });
      }
    });
    setSupportNonce((n) => n + 1);
  };

  // Choose which image BACKEND (OpenAI, Grok, Gemini, Leonardo, Pollinations…) to
  // try first, for the whole presentation. Invalidates cached images so they
  // regenerate on the chosen provider. '' = Auto (best available, in order).
  const setImageProvider = (id: string) => {
    setProviderOpen(false);
    cfgRef.current = { ...cfgRef.current, imageProvider: id };
    setCfg((c) => ({ ...c, imageProvider: id }));
    slidesRef.current.forEach((sl: any) => {
      if (sl && Array.isArray(sl.supportPlan)) {
        sl.supportPlan.forEach((t: string, i: number) => { if (t === 'image') { if (sl._supports) sl._supports[i] = undefined; if (sl._supportP) sl._supportP[i] = undefined; } });
      }
    });
    setSupportNonce((n) => n + 1);
  };

  // Set the TTS voice for the whole run (read-aloud + click-to-pronounce). Audio is
  // fetched on demand, so no cache to invalidate — just update the config.
  const setVoice = (id: string) => { setVoiceOpen(false); cfgRef.current = { ...cfgRef.current, voice: id }; setCfg((c) => ({ ...c, voice: id })); };

  // Change the CONTENT theme for the whole presentation (Vacations, Sports, Stoic
  // philosophy, …). It becomes the run's theme so every slide generated after it
  // is framed around it; the current slide is regenerated with the new theme now,
  // its answers cleared, and any prefetched later slides are discarded so they
  // regenerate too. Like the level/image-style tweaks, it only PERSISTS to the
  // gallery if the learner plays to the end (finalizeRun).
  const setLessonTheme = async (theme: string) => {
    setThemeOpen(false);
    if ((cfgRef.current.theme || 'Any') === theme) return;
    cfgRef.current = { ...cfgRef.current, theme };
    setCfg((c) => ({ ...c, theme }));
    // Drop the current slide and everything after it so they regenerate on-theme.
    const kept = slidesRef.current.map((sl, i) => (i < cur ? sl : null));
    slidesRef.current = kept; setSlides(kept);
    setSlideReady((m) => { const n = { ...m }; Object.keys(n).forEach((k) => { if (Number(k) >= cur) delete n[Number(k)]; }); return n; });
    Object.keys(prefetching.current).forEach((k) => { if (Number(k) >= cur) delete prefetching.current[Number(k)]; });
    setResults((rr) => { const n = { ...rr }; delete n[cur]; return n; });
    setThemeBusy(true); setGenBusy(true); setErr('');
    try { await (prefetching.current[cur] || prefetch(cur)); } catch { /* ignore */ }
    setGenBusy(false); setThemeBusy(false);
    prefetch(cur + 1);
  };

  // Jump back to the top so the learner starts reading the next slide from its
  // title, not wherever they left off after answering the question below.
  const toTop = () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* ignore */ } };
  const goToSlide = async (nxt: number) => {
    if (nxt >= total()) return;
    // Usually prefetched -> instant. Otherwise wait for the in-flight prefetch.
    if (slidesRef.current[nxt]) { setCur(nxt); toTop(); prefetch(nxt + 1); return; }
    setGenBusy(true); setErr('');
    await (prefetching.current[nxt] || prefetch(nxt));
    setGenBusy(false);
    if (slidesRef.current[nxt]) { setCur(nxt); toTop(); prefetch(nxt + 1); }
    else setErr('Could not load the next slide. Tap Next to retry.');
  };

  const label = (c: Cfg) => [lesson.subject, c.level || c.difficulty, c.topic].filter(Boolean).join(' · ');
  // How many slides a run has — from its own config, else the lesson default.
  const slideCountOf = (c: any) => Math.max(1, Math.min(MAX_SLIDES, parseInt(c?.slides, 10) || parseInt(lesson.totalSlides, 10) || 5));

  // ---------------- ORIGINAL DECK (history, with answers) ----------------
  if (phase === 'history') {
    const hslides: Slide[] = Array.isArray(savedDeck?.slides) ? savedDeck.slides : [];
    const totalQs = hslides.reduce((a, s) => a + (Array.isArray(s.questions) ? s.questions.length : 0), 0);
    // The OP's own score, if their finished run was saved with results.
    const savedRes = savedDeck?.results && typeof savedDeck.results === 'object' ? savedDeck.results : null;
    let opScore = 0, opAnswered = 0;
    if (savedRes) for (const k of Object.keys(savedRes)) { const ans = savedRes[k]?.answers || {}; for (const qi of Object.keys(ans)) { opAnswered++; if (ans[qi]?.correct) opScore++; } }
    const jump = (i: number) => { if (typeof document !== 'undefined') document.getElementById(`hslide-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <button className="btn small ghost" onClick={() => setPhase('hub')}>← Lessons</button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Share THIS results page — the link opens the tool straight on this
                results view (?results=1) so anyone can see the finished run. */}
            {appState.activeTool?.visibility !== 'private' && <SharePanel slug={slug} title={savedDeck?.config ? label(savedDeck.config) : lesson.subject} query={{ results: '1' }} label="🔗 Share results" />}
            {canPlay && viewMode !== 'history' && <button className="btn small green" onClick={() => recordAndPlay(savedDeck?.config || form, { replica: true })}>✨ Play a replica</button>}
          </div>
        </div>

        {/* Start at the ENDING: a results/summary header with navigation tools. */}
        <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>📖 Original results</h2>
          <p style={{ fontSize: 13, opacity: 0.75, margin: '4px 0' }}>By @{savedDeck?.savedBy || 'the author'}{savedDeck?.config ? ` · ${label(savedDeck.config)}` : ''}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
            <div><div style={{ fontSize: 24, fontWeight: 800 }}>{hslides.length}</div><div style={{ fontSize: 12, opacity: 0.6 }}>slides</div></div>
            <div><div style={{ fontSize: 24, fontWeight: 800 }}>{totalQs}</div><div style={{ fontSize: 12, opacity: 0.6 }}>questions (with answers)</div></div>
            {savedRes && opAnswered > 0 && <div><div style={{ fontSize: 24, fontWeight: 800 }}>{opScore}/{opAnswered}</div><div style={{ fontSize: 12, opacity: 0.6 }}>author&apos;s score</div></div>}
          </div>
          <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>The exact slides the author made, shown with the answer key. Jump to any section below.</p>
        </div>

        {/* Section navigator (the "tools to navigate the lesson"). */}
        {hslides.length > 0 && (
          <div className="card alt" style={{ padding: '12px 14px', marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px' }}>Go to a section</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {hslides.map((s, i) => <button key={i} className="btn small" onClick={() => jump(i)} title={s.title || ''}>Slide {i + 1}</button>)}
            </div>
          </div>
        )}

        {hslides.map((s, si) => (
          <div key={si} id={`hslide-${si}`} className="card" style={{ padding: '16px 18px', margin: '14px 0', scrollMarginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5 }}>Slide {si + 1} / {hslides.length}</div>
              <button className="btn small ghost" title="Back to top" onClick={() => jump(0)}>↑ Top</button>
            </div>
            <h3 style={{ marginTop: 4, textAlign: 'center' }}>{s.title}</h3>
            {s.content && <p style={{ fontSize: 16, lineHeight: 1.6 }}><RichText text={s.content} translateTo={lesson.translateTo || 'English'} speakable={!!lesson.language} voiceId={cfg.voice} /></p>}
            {(Array.isArray(s._supports) ? s._supports : (s.support ? [s.support] : [])).map((sup: any, k: number) => <Support key={k} s={sup} />)}
            {(Array.isArray(s.questions) ? s.questions : []).map((q, qi) => (
              <div key={qi} style={{ marginTop: 14, borderTop: '2px dashed var(--ink)', paddingTop: 14 }}>
                {s.questions.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, marginBottom: 6 }}>Question {qi + 1} / {s.questions.length}</div>}
                <AnswerKey q={q} />
              </div>
            ))}
          </div>
        ))}
        {canEdit && (
          <div style={{ textAlign: 'center', marginTop: 6 }}>
            <button className="btn small ghost" onClick={async () => { if (!confirm('Remove the saved original deck?')) return; try { await API.post('/api/tools/lesson/save-deck', { slug, clear: true }); setSavedDeck(null); if (def?.lesson) delete def.lesson.savedDeck; setPhase('hub'); } catch { /* ignore */ } }}>🗑 Remove saved deck</button>
          </div>
        )}
      </div>
    );
  }

  // ---------------- HUB ----------------
  if (phase === 'hub') {
    // Normalize each generation field so every dropdown is ALSO editable (the ✎
    // pencil toggles the dropdown ↔ a free-text box):
    //  • topic     → dropdown of AI-suggested topics (when we have them)
    //  • level/diff → the academic scale Zero…PhD, always
    //  • slides     → an editable dropdown of preset counts
    const TONE_OPTIONS = ['Any (AI picks)', 'Friendly', 'Formal', 'Playful', 'Socratic', 'Storytelling'];
    const normField = (f: any) => {
      if (f.id === 'topic' && topicIdeas.length) return { ...f, type: 'select-or-custom', options: topicIdeas };
      if (f.id === 'level' || f.id === 'difficulty') return { ...f, type: 'select-or-custom', options: TEXT_LEVELS };
      if (f.id === 'slides') return { ...f, type: 'select-or-custom', options: SLIDE_COUNTS };
      // Tone always offers "Any (AI picks)" first (the default), then any tones the
      // tool's own schema defined.
      if (f.id === 'tone') return { ...f, type: 'select-or-custom', options: ['Any (AI picks)', ...((f.options && f.options.length) ? f.options : TONE_OPTIONS.slice(1))] };
      return f;
    };
    const hasTone = settings.some((f: any) => f.id === 'tone');
    const hasTopic = settings.some((f: any) => f.id === 'topic');
    const hasLevel = settings.some((f: any) => f.id === 'level' || f.id === 'difficulty');
    const hasSlides = settings.some((f: any) => f.id === 'slides');
    const formFields = [
      // A name for THIS presentation run (shown as its card title). Always visible.
      { id: 'title', label: '📝 Title', type: 'text', placeholder: 'Name this presentation… (optional)' },
      ...settings.map(normField),
      // Core-input fallbacks: some AI-generated tools ship a SPARSE settings schema
      // (no topic / level / slides), which left those wizard steps empty. Offer the
      // standard fields so the create card always lets you set them.
      ...(hasTopic ? [] : [normField({ id: 'topic', label: '🎯 Topic', type: 'text', placeholder: 'What should this cover?' })]),
      ...(hasLevel ? [] : [{ id: 'level', label: '🎚️ Level', type: 'select-or-custom', options: TEXT_LEVELS }]),
      ...(hasSlides ? [] : [{ id: 'slides', label: '📄 Slides', type: 'select-or-custom', options: SLIDE_COUNTS }]),
      // If the tool schema didn't define a tone, offer a global one (AI-picks default).
      ...(hasTone ? [] : [{ id: 'tone', label: 'Tone', type: 'select-or-custom', options: TONE_OPTIONS }]),
      { id: 'category', label: 'Category', type: 'select-or-custom', options: ['Any (AI picks)', ...GEN_CATEGORIES] },
      // A free-text box for anything else the author wants woven into the lesson.
      { id: 'custom', label: 'Custom instructions (optional)', type: 'text', placeholder: 'e.g. focus on real-world examples, add a fun fact each slide…' },
    ];
    // The essentials shown when the settings card is COLLAPSED: the title, then
    // topic, level and slide count (in that order), each pulled from the full field
    // list so they keep their dropdown/suggest behavior.
    const ESSENTIAL_IDS = ['title', 'topic', 'level', 'difficulty', 'slides'];
    const collapsedFields = ESSENTIAL_IDS
      .map((id) => formFields.find((f: any) => f.id === id))
      .filter(Boolean) as any[];
    // 🎨 Suggest ONE field's value with AI, reading the author's other settings and
    // (especially) the Custom instructions box so the suggestion stays consistent.
    const suggestField = async (id: string) => {
      const field: any = formFields.find((f: any) => f.id === id);
      if (!field) return;
      // Topic is special: refresh the WHOLE dropdown with a fresh, different set of
      // recommendations each press (not just one value). Other fields pick one.
      if (id === 'topic') { setSuggestingField((m) => ({ ...m, topic: true })); await loadTopics(true); setSuggestingField((m) => { const n = { ...m }; delete n.topic; return n; }); return; }
      setSuggestingField((m) => ({ ...m, [id]: true }));
      try {
        const r = await API.post('/api/tools/lesson/suggest-field', {
          lesson, field: { id, label: field.label, options: field.options || [] }, values: form,
        });
        if (r?.value !== undefined && String(r.value) !== '') setForm((s) => ({ ...s, [id]: r.value }));
      } catch { /* ignore */ }
      setSuggestingField((m) => { const n = { ...m }; delete n[id]; return n; });
    };
    // 🎨 Suggest a preset value (Theme / Text density / Image style) with AI, using
    // the tool context + the author's other settings to choose a fitting option.
    const suggestPreset = async (id: string, label: string, options: string[]) => {
      setSuggestingField((m) => ({ ...m, [id]: true }));
      try {
        const r = await API.post('/api/tools/lesson/suggest-field', { lesson, field: { id, label, options }, values: form });
        if (r?.value !== undefined && String(r.value) !== '') setForm((s) => ({ ...s, [id]: r.value }));
      } catch { /* ignore */ }
      setSuggestingField((m) => { const n = { ...m }; delete n[id]; return n; });
    };
    // The small 🎨 "suggest with AI" control shared by the preset dropdowns.
    const suggestBtn = (id: string, label: string, options: string[]) => (
      <button type="button" title="Suggest with AI (from your settings & the lesson context)" disabled={!!suggestingField[id]}
        onClick={() => suggestPreset(id, label, options)} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: suggestingField[id] ? 'wait' : 'pointer', fontSize: 13 }}>
        {suggestingField[id] ? '…' : '🎨'}
      </button>
    );
    const feedItems = activities;
    const visibleFeed = feedItems.filter((e: any) => {
      if (historyFilter === 'fav' && !favs[e.id]) return false;
      const term = historyQ.trim().toLowerCase();
      if (!term) return true;
      const hay = `${label(e.data || {})} ${e.username || ''} ${e.data?.topic || ''}`.toLowerCase();
      return hay.includes(term);
    });
    const feedPages = Math.max(1, Math.ceil(visibleFeed.length / 6));
    const shownFeed = visibleFeed.slice((historyPage - 1) * 6, historyPage * 6);
    const skeletonRec = { slug, title: def?.title || 'Presentation', archetype: 'lesson', owner: 'sketchlearn', visibility: 'public', description: def?.description || 'Open this slide tool to play.', tags: def?.tags || [], aiGenerated: false, thumbnail: null, createdAt: new Date().toISOString() };
    // One rendition card — rendered through the SHARED CardShell so its container
    // (image space, title, subtitle, footer) is identical to the tools gallery
    // cards; only the buttons differ (Play + OP results instead of Open →). It
    // gets the same AI-changing distortion powers (reword, generate/upload image).
    const stop = (fn: () => void) => (ev: React.MouseEvent) => { ev.stopPropagation(); fn(); };
    const feedCard = (e: any, row: boolean) => {
      const busy = !!distBusy[e.id];
      const editable = canEditEntry(e);
      const title = e.data?.title || label(e.data || {});
      // Never blank: fall back to a description built from the run's topic/level.
      const subtitle = e.data?.subtitle || e.data?.why
        || `A ${String(e.data?.level || e.data?.difficulty || '').toLowerCase() || ''} ${lesson.subject || 'presentation'}${e.data?.topic ? ` on ${e.data.topic}` : ''}.`.replace(/\s+/g, ' ').trim();
      // Show a REAL uploaded/AI image if the card has one; otherwise a RANDOM
      // emoji, picked once per page load and re-shuffled on each refresh. A stored
      // "emoji:" default (creation default / 🎲) is intentionally NOT treated as a
      // set image, so the emoji keeps changing until a real picture is attached.
      const thumb = e.data?.thumbnail;
      const hasImg = isRenderableImage(thumb);
      if (!hasImg && !randEmojis.current[e.id]) randEmojis.current[e.id] = randomEmoji();
      const emoji = hasImg ? '' : randEmojis.current[e.id];
      const play = () => recordAndPlay(e.data || {}, { replica: true });
      const editIcons = editable ? (
        <span style={{ display: 'inline-flex', gap: 6, marginLeft: 5, verticalAlign: 'middle' }}>
          <button title="Edit title & subtitle" style={iconBtn} onClick={stop(() => editEntryText(e))}>✎</button>
          <button title="AI tap-mixer — reword title & subtitle" style={iconBtn} disabled={busy} onClick={stop(() => distort(e, 'remix'))}>{busy ? '…' : '🎨'}</button>
        </span>
      ) : null;
      const overlay = editable ? (
        <span style={{ position: 'absolute', top: 6, right: 8, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <button title="Remove image — show a random emoji instead" style={overlayIcon} disabled={busy} onClick={stop(() => clearEntryImage(e))}>🎲</button>
          <button title="Custom image — describe it" style={overlayIcon} disabled={busy} onClick={stop(() => promptEntryImage(e))}>✎</button>
          <button title="Regenerate image with AI" style={overlayIcon} disabled={busy} onClick={stop(() => distort(e, 'image'))}>{busy ? '…' : '🎨'}</button>
          <button title="Upload a custom image" style={overlayIcon} disabled={busy} onClick={stop(() => uploadEntryImage(e))}>📎</button>
        </span>
      ) : null;
      const placeholder = editable ? (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn small ghost" disabled={busy} onClick={stop(() => distort(e, 'image'))}>{busy ? 'Generating…' : '🎨 Generate'}</button>
          <button className="btn small ghost" disabled={busy} onClick={stop(() => promptEntryImage(e))}>✎ Custom</button>
          <button className="btn small ghost" disabled={busy} onClick={stop(() => uploadEntryImage(e))}>📎 Upload</button>
        </span>
      ) : null;
      const badges = (
        <>
          {e.data?.suggested && <span title="AI-suggested topic">✦ AI pick</span>}
          {e.data?.replica && <span title="A fresh AI replica">♻ replica</span>}
          {typeof e.data?.score === 'number' && <span title={`Scored ${e.data.score}%`}>{e.data.score >= 80 ? '🌟' : e.data.score >= 50 ? '📈' : '🌱'} {e.data.score}%</span>}
          {e.byAdmin && <span title="By an admin">🛡️</span>}
        </>
      );
      const del = editable ? <button style={delIcon} title="Delete this rendition" onClick={() => deleteRendition(e)}>🗑</button> : null;
      return (
        <CardShell
          view={row ? 'row' : 'grid'}
          title={title}
          subtitle={subtitle || undefined}
          fav={!!favs[e.id]}
          gridHeight={row ? undefined : 372}   // uniform tiles: title clamps to 2 lines (…), edit icons stay
          thumbnail={emoji ? null : thumb}
          iconNode={emoji ? <span aria-hidden>{emoji}</span> : undefined}
          onOpen={hasSaved ? () => { setPhase('history'); window.scrollTo(0, 0); } : (canPlay ? play : () => gatedPlay(play))}
          overlay={overlay}
          placeholder={placeholder}
          editBtns={editIcons}
          badges={badges}
          meta={(() => {
            const d = e.data || {};
            const lvl = d.level || d.difficulty || '';
            const theme = d.theme && d.theme !== 'Any' ? d.theme : '';
            const imgStyle = d.imageStyle && d.imageStyle !== 'Any' ? d.imageStyle : '';
            const bits = [
              lvl && `🎚️ ${lvl}`,
              theme && `🎭 ${theme}`,
              d.density && `📏 ${d.density}`,
              imgStyle && `🖼 ${imgStyle}`,
              `📄 ${slideCountOf(d)} slides`,
              typeof d.score === 'number' && `🏆 ${d.score}%`,
            ].filter(Boolean);
            return (
              <span style={{ fontSize: 11, opacity: 0.6, display: 'flex', flexDirection: 'column', lineHeight: 1.4 }}>
                <span>{bits.join(' · ')}</span>
                <span>@{e.username || 'anon'}{e.createdAt ? ` · 🕒 ${new Date(e.createdAt).toLocaleString()}` : ''}</span>
              </span>
            );
          })()}
          del={del}
          actions={
            <>
              {app.user && <button style={iconBtn} title={favs[e.id] ? 'Unfavorite' : 'Favorite'} onClick={() => toggleFav(e.id)}>{favs[e.id] ? '★' : '☆'}</button>}
              {(hasSaved || canEdit) && (
                <button className="btn small" style={{ background: '#fbe08a', padding: '5px 9px' }} title={hasSaved ? 'View the saved run (history)' : 'No results saved yet'}
                  onClick={() => { if (hasSaved) { setPhase('history'); window.scrollTo(0, 0); } else alert('No results saved yet — a moderator plays a run and it saves automatically.'); }}>📖</button>
              )}
              <button className="btn small green" title="Play a fresh replica (no answers)" onClick={() => gatedPlay(play)}>▶ Play</button>
            </>
          }
        />
      );
    };
    const setupWidth = setupCardSize <= 0 ? 360 : setupCardSize === 1 ? 340 : setupCardSize === 2 ? 392 : setupCardSize === 3 ? 430 : setupCardSize === 4 ? 500 : 560;
    const setupImageProps: any = cardImageProps(setupImgMode);
    const setupGridHeight = typeof setupImageProps.gridHeight === 'number'
      ? setupImageProps.gridHeight + 110
      : 430;
    // View options: offer the saved original deck and/or a fresh AI replica.
    const showGenerate = viewMode !== 'history' || !hasSaved;
    return (
      <div>
        {/* Inline editor for a gallery card (title/subtitle, or a custom AI-image
            prompt) — replaces the unreliable browser prompt. */}
        {cardEdit && (
          <div onClick={() => setCardEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto', padding: '48px 12px' }}>
            <div className="card" onClick={(ev) => ev.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b>{cardEdit.kind === 'text' ? '✎ Edit card' : '✎ Custom image'}</b>
                <button className="btn small ghost" onClick={() => setCardEdit(null)}>✕</button>
              </div>
              {cardEdit.kind === 'text' ? (
                <>
                  <label className="field"><span>Title</span>
                    <input type="text" autoFocus value={cardEdit.title} onChange={(ev) => setCardEdit(c => c && { ...c, title: ev.target.value })} />
                  </label>
                  <label className="field" style={{ marginTop: 8 }}><span>Description / subtitle</span>
                    <textarea value={cardEdit.subtitle} placeholder="A short description…" onChange={(ev) => setCardEdit(c => c && { ...c, subtitle: ev.target.value })} style={{ minHeight: 64 }} />
                  </label>
                </>
              ) : (
                <label className="field"><span>Describe the image to generate</span>
                  <textarea autoFocus value={cardEdit.prompt} placeholder="e.g. a labelled diagram of a plant cell, watercolour style…" onChange={(ev) => setCardEdit(c => c && { ...c, prompt: ev.target.value })} style={{ minHeight: 72 }} />
                </label>
              )}
              <div className="slide-actions" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button className="btn small ghost" onClick={() => setCardEdit(null)}>Cancel</button>
                <button className="btn green" onClick={submitCardEdit}>{cardEdit.kind === 'text' ? 'Save' : '🎨 Generate'}</button>
              </div>
            </div>
          </div>
        )}
        {hasSaved && viewMode !== 'replica' && (
          <div className="card" style={{ padding: '14px 16px', marginBottom: 12, borderStyle: 'dashed' }}>
            <h4 style={{ margin: '0 0 4px' }}>📖 This presentation has a saved original</h4>
            <p style={{ fontSize: 13, opacity: 0.75, margin: '0 0 10px' }}>
              View the exact slides the author made (with the answer key){showGenerate ? ', or generate a fresh AI replica of the same lesson' : ''}.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn blue" onClick={() => { setPhase('history'); window.scrollTo(0, 0); }}>📖 View original (with answers)</button>
              {canPlay && showGenerate && <button className="btn green" onClick={() => recordAndPlay(savedDeck?.config || form, { replica: true })}>✨ Generate a fresh replica →</button>}
            </div>
          </div>
        )}

        {/* Editing the slide layout / proposed activities opens the Studio (the same
            builder used to create slide tools), pre-loaded with this tool's layout,
            via the "✏️ Edit layout & activities" button beside "New topics". */}

        {/* The create wizard spans the full page width. */}
        <div ref={wizardRef} style={{ width: '100%' }}>
        {/* Collapsed: a slim bar that expands the create-new settings (visible by default). */}
        {showGenerate && !settingsOpen && (
          <div className="card" onClick={toggleSettings} title="Show the create-new settings"
            style={{ cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ opacity: 0.45, fontSize: 12 }}>▸</span>
            <b>⚙️ Create a {lesson.subject || 'lesson'} activity</b>
            <span style={{ marginLeft: 'auto', fontSize: 11.5, opacity: 0.6 }}>settings hidden — tap to show</span>
          </div>
        )}
        {showGenerate && settingsOpen && (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
          {(() => {
            const fieldsFor = (ids: string[]) => formFields.filter((f: any) => ids.includes(f.id));
            const stepFields = (ids: string[], single?: boolean) => {
              const fs = fieldsFor(ids);
              return fs.length
                ? <div style={{ width: '100%' }}><ToolFields fields={fs} values={form} onChange={(id, v) => setForm(s => ({ ...s, [id]: v }))} onSuggest={suggestField} suggesting={suggestingField} single={single} fill /></div>
                : null;
            };
            const goPrev = () => setWizardStep((s) => Math.max(0, s - 1));
            const fieldShell: React.CSSProperties = { width: '100%', margin: 0 };
            const controlStyle: React.CSSProperties = FIELD_CONTROL_STYLE;
            const navSizeStyle: React.CSSProperties = {
              width: 96,
              height: 40,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            };
            const fieldLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', marginBottom: 4 };
            const themeField = (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>🎭 Theme{suggestBtn('theme', 'Theme', [...LESSON_THEMES])}</span>
                <select style={controlStyle} value={(form as any).theme || 'Any'} onChange={(e) => setForm(s => ({ ...s, theme: e.target.value }))}>
                  {LESSON_THEMES.map((th) => <option key={th} value={th}>{th === 'Any' ? 'Any (AI picks)' : th}</option>)}
                </select>
              </label>
            );
            const densityField = (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>📏 Text density{suggestBtn('density', 'Text density', PARA_DENSITIES)}</span>
                <select style={controlStyle} value={(form as any).density || ''} onChange={(e) => setForm(s => ({ ...s, density: e.target.value }))} title="How much text to show — independent of the level's vocabulary difficulty">
                  <option value="">Auto (match the level)</option>
                  {PARA_DENSITIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            );
            const imageStyleField = (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>🖼 Image style
                <button type="button" title={customImg ? 'Pick from the list' : 'Type a custom style'}
                  onClick={() => { const goingCustom = !customImg; setCustomImg(goingCustom); if (!goingCustom && !(IMAGE_STYLES as readonly string[]).includes((form as any).imageStyle)) setForm(s => ({ ...s, imageStyle: 'Any' })); }}
                  style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>{customImg ? '▾' : '✎'}</button>
                {suggestBtn('imageStyle', 'Image style', [...IMAGE_STYLES])}
              </span>
                {customImg
                  ? <input type="text" style={controlStyle} placeholder="Describe your image style…" value={(form as any).imageStyle || ''} onChange={(e) => setForm(s => ({ ...s, imageStyle: e.target.value }))} />
                  : <select style={controlStyle} value={(IMAGE_STYLES as readonly string[]).includes((form as any).imageStyle) ? (form as any).imageStyle : 'Any'} onChange={(e) => setForm(s => ({ ...s, imageStyle: e.target.value }))}>
                      {IMAGE_STYLES.map((st) => <option key={st} value={st}>{st === 'Any' ? 'Any (AI picks)' : st}</option>)}
                    </select>}
              </label>
            );
            const imageApiField = (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>🔌 Image API</span>
                <select style={controlStyle} value={(form as any).imageProvider || ''} onChange={(e) => setForm(s => ({ ...s, imageProvider: e.target.value }))} title="Which image generator to use — Pollinations is free & keyless">
                  <option value="">Auto (best available)</option>
                  {imageProviders.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
            );
            const textApiField = (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>🔤 Text API</span>
                <select style={controlStyle} value={(form as any).textProvider ?? 'gemini'} onChange={(e) => setForm(s => ({ ...s, textProvider: e.target.value }))} title="Which model writes the slide text & questions — Gemini is the default">
                  <option value="gemini">Gemini (default)</option>
                  <option value="">Auto (best available)</option>
                  {textProviders.filter((p) => p.id !== 'gemini').map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
            );
            const voiceField = (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>🎙 Voice</span>
                <select style={controlStyle} value={(form as any).voice || ''} onChange={(e) => setForm(s => ({ ...s, voice: e.target.value }))} title="Which voice reads the text aloud / pronounces words">
                  <option value="">Default voice</option>
                  {TTS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </label>
            );
            const tooltipsField = (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>💡 Tooltips</span>
                <button type="button" className={`btn ${(form as any).tooltips === false ? 'ghost' : 'blue'}`} style={{ ...controlStyle, justifyContent: 'flex-start', textAlign: 'left', boxShadow: 'none' }}
                  onClick={() => setForm(s => ({ ...s, tooltips: (s as any).tooltips === false }))}>
                  💡 Tooltips: {(form as any).tooltips === false ? 'Off' : 'On'}
                </button>
              </label>
            );
            // Annotation activities (hand-drawn "mark up a paper pad" drills) are OFF
            // by default, so the AI never picks that template. The author can opt in.
            const annotationField = (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>🖊️ Annotation slides</span>
                <select style={controlStyle} value={(form as any).annotations === 'on' ? 'on' : ''} onChange={(e) => setForm(s => ({ ...s, annotations: e.target.value }))}
                  title="Include hand-drawn “annotate on a paper pad” activities. Off by default — the AI won’t use annotation templates unless you turn this on.">
                  <option value="">Off — no annotation activities</option>
                  <option value="on">On — allow annotation activities</option>
                </select>
              </label>
            );
            // Owner/admin: the repository this slide tool is the study-path for — the
            // "Study-path slide tool" link, from the slide side. Picking a repo points
            // its studyToolSlug at this tool; the 📁 Repo button then returns there.
            const repoLinkField = (canEdit || eff.isAdmin) ? (
              <label className="field" style={fieldShell}><span style={fieldLabelStyle}>🎬 Study-path repo</span>
                <select style={controlStyle} value={linkedRepo?.slug || ''} disabled={linking}
                  onChange={(e) => linkStudyRepo(e.target.value)}
                  title="The repository this slide tool originated from / belongs to. The 📁 Repo button in the runs filter returns to it.">
                  <option value="">— none —</option>
                  {editableRepos.map((t: any) => <option key={t.slug} value={t.slug}>{t.title}</option>)}
                </select>
              </label>
            ) : null;
            const finalActions = (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', width: 96, minWidth: 96 }}>
                {!app.user
                  ? <button className="btn small green" style={navSizeStyle} onClick={() => app.requireLogin()}>▶ Sign in</button>
                  : canPlay
                  ? <button className="btn small green" style={navSizeStyle} onClick={() => { createAndPlay(); setWizardKey((k) => k + 1); }}>✨ Generate</button>
                  : <button className="btn small green" style={navSizeStyle} title="You need play credits — get some from the dashboard" onClick={() => app.nav('dashboard')}>🎟 Get credits</button>}
                {canPlay && !eff.isAdmin && (
                  <span title="Estimated credits for this generation (slides + images). Charged as it runs." style={{ fontSize: 12, opacity: 0.7, textAlign: 'center' }}>
                    ~{estimateLessonTokens({ slides: (form as any).slides, totalSlides: lesson.totalSlides, support: lesson.support }).toLocaleString()} credits{typeof balance === 'number' ? ` · you have ${balance.toLocaleString()}` : ''}
                  </span>
                )}
                {gateMsg && <span style={{ fontSize: 12, color: 'var(--danger,#e4572e)', textAlign: 'center' }}>{gateMsg}</span>}
              </div>
            );
            // Every editable field becomes a CELL — the tool's own settings (title,
            // topic, level/difficulty, slides, tone, … whatever the schema defines)
            // followed by the standard theme / image / API / voice / tooltip controls
            // — then paginate them into pages whose size ADAPTS to the measured card
            // width: a wide (full-width) card packs 4 per page in a 2-col grid; a
            // narrow one shows fewer per page and simply adds pages.
            const cells: React.ReactNode[] = [
              // 'topic' and 'custom' get their OWN first page (tall textareas, side by
              // side) so the full repo prompt is visible — so leave them out here.
              ...formFields.filter((f: any) => f.id !== 'topic' && f.id !== 'custom').map((f: any) => stepFields([f.id], true)),
              themeField, densityField, imageStyleField, imageApiField, textApiField, voiceField, tooltipsField, annotationField, repoLinkField,
            ].filter((c) => c != null);
            // wizardW === 0 means "not measured yet" — assume the wide default (the
            // card is full-width unless shrunk), so it opens as a 2×2 grid instead of
            // flashing 1-per-page. A real narrow measurement still drops to 2 or 1.
            const perPage = wizardW === 0 || wizardW >= 620 ? 4 : wizardW >= 330 ? 2 : 1;
            const gridCols = perPage >= 2 ? 2 : 1;
            const pageCount = Math.max(1, Math.ceil(cells.length / perPage));
            // One extra page after the settings: a read-only window showing the ACTUAL
            // prompt(s) this tool sends to the AI — one box per output request (slide text,
            // illustration/SVG, trust & safety). Same idea as the coach chat's "How I reply".
            // Pages: [prompt & instructions] + settings pages + [the prompt window].
            const totalPages = pageCount + 2;
            const goNext = () => setWizardStep((s) => Math.min(totalPages - 1, s + 1));
            // The FIRST page: the topic/prompt and custom-instructions boxes as TALL
            // textareas, side by side — so the whole prompt pulled from the repo (via
            // the 🎬 study-path button) is fully visible and editable, not clipped.
            const bigArea: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 148, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.4, padding: '8px 10px', border: '2px solid var(--ink,#2d2a26)', borderRadius: 8, background: 'var(--paper,#fffdf7)', color: 'var(--ink,#2d2a26)' };
            const promptInputStep: WizardStep = {
              key: 'topic-prompt',
              title: 'Prompt & instructions',
              render: () => (
                <WizardGridTemplate tall
                  top={
                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignContent: 'start' }}>
                      <label className="field" style={fieldShell}>
                        <span style={fieldLabelStyle}>🎯 Topic / prompt{suggestBtn('topic', 'Topic', topicIdeas)}</span>
                        <textarea value={(form as any).topic || ''} onChange={(e) => setForm((s) => ({ ...s, topic: e.target.value }))}
                          placeholder="The prompt this lesson is built from — pulled from the repo, or write your own." style={bigArea} />
                      </label>
                      <label className="field" style={fieldShell}>
                        <span style={fieldLabelStyle}>✍️ Custom instructions (optional)</span>
                        <textarea value={(form as any).custom || ''} onChange={(e) => setForm((s) => ({ ...s, custom: e.target.value }))}
                          placeholder="Anything extra to weave into every slide…" style={bigArea} />
                      </label>
                    </div>
                  }
                  onNext={goNext} onBack={goPrev} backDisabled={wizardStep === 0} />
              ),
            };
            const settingsSteps: WizardStep[] = Array.from({ length: pageCount }, (_, pi) => {
              const pageCells = cells.slice(pi * perPage, pi * perPage + perPage);
              return {
                key: `p${pi}`,
                title: `Settings ${pi + 1} of ${pageCount}`,
                render: () => (
                  <WizardGridTemplate tall
                    top={<div style={{ width: '100%', display: 'grid', gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap: 12, alignContent: 'start' }}>{pageCells.map((c, i) => <div key={i} style={{ minWidth: 0 }}>{c}</div>)}</div>}
                    // Every settings page just advances with Next → (the last one goes to the
                    // prompt window). Generate lives ONLY on that final step, never here.
                    // `tall` keeps a FIXED height so Next/Back sit in the same spot on every step.
                    onNext={goNext}
                    onBack={goPrev}
                    backDisabled={wizardStep === 0} />
                ),
              };
            });
            const promptStep: WizardStep = {
              key: 'prompt',
              title: 'How it’s generated — the prompt',
              render: () => (
                <WizardGridTemplate tall
                  top={<PromptInspector kind="slide" topic={(form as any).topic || lesson.subject || ''} level={(form as any).level || (form as any).difficulty || 'Beginner'} />}
                  onBack={goPrev}
                  backDisabled={wizardStep === 0}
                  rightTop={finalActions} />
              ),
            };
            const steps: WizardStep[] = [promptInputStep, ...settingsSteps, promptStep];
            return (
              <CardShell
                view="grid"
                title=""
                {...setupImageProps}
                gridHeight={setupGridHeight}
                bodyStyle={{ padding: '10px 12px 12px' }}
                body={(
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <h4 style={{ margin: 0, cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={toggleSettings}
                        title="Hide the create-new settings">
                        <span style={{ opacity: 0.45, fontSize: 12 }}>▾</span>
                        ⚙️ Create a {lesson.subject || 'lesson'} activity
                      </h4>
                      {(canEdit || eff.isAdmin) && <button onClick={openLayoutEditor} title="Modify the proposed lesson layouts (opens the Studio)"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>⚙️</button>}
                      <button onClick={() => loadTopics(true)} disabled={topicsBusy} title="Fresh suggested topics"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>{topicsBusy ? '…' : '🔄'}</button>
                    </div>
                    <StepWizard
                      steps={steps}
                      finalActions={null}
                      resetKey={wizardKey}
                      bodyMinHeight={112}
                      actionsJustify="flex-end"
                      stepIndex={wizardStep}
                      onStepChange={setWizardStep}
                      showFooter={false}
                    />
                  </>
                )}
              />
            );
          })()}
        </div>
        )}

        </div>

        {/* ┄ divider: create ┄ activities feed ┄ */}
        <div style={{ maxWidth: 820, margin: '10px auto', borderTop: '2px dashed var(--ink)', opacity: 0.45 }} />

        <GalleryFilterRow q={historyQ} onQ={setHistoryQ} filter={historyFilter} onFilter={setHistoryFilter} right={<>
          <button className="btn small ghost" title="Refresh saved runs" aria-label="Refresh saved runs" onClick={() => { loadActivities(); setRecNonce((n) => n + 1); }} style={{ fontSize: 16, padding: '0 9px' }}>🔄</button>
          {/* Everyone: jump to the repo this slide tool originated from / belongs to, if any.
              The association itself is set in the settings card's "Study-path repo" field. */}
          {linkedRepo && (
            <button className="btn small ghost" title={`Open the repository: ${linkedRepo.title}`} onClick={() => openRepo(linkedRepo.slug)} style={{ fontSize: 13, padding: '0 10px' }}>📁 Repo</button>
          )}
        </>} />

        {visibleFeed.length === 0 ? (
          <GallerySkeleton cardSize={galleryCardSize} imgMode={galleryImgMode} recommended={skeletonRec}
            onBuild={() => setWizardStep(0)}
            onOpen={() => { if (canPlay) createAndPlay(); else gatedPlay(() => createAndPlay()); }}
          />
        ) : (
          <>
            <div style={{ ...galleryCfg.container, alignItems: 'stretch' }}>
              {shownFeed.map((e: any) => feedCard(e, galleryCfg.view === 'row'))}
            </div>
            {feedPages > 1 && <GalleryPager page={historyPage} pages={feedPages} onPrev={() => setHistoryPage((p) => Math.max(1, p - 1))} onNext={() => setHistoryPage((p) => Math.min(feedPages, p + 1))} />}
          </>
        )}

        {/* The data tables at the foot of the page are an admin-only view. */}
        {eff.isAdmin && (<>
        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '18px 0 12px' }} />
        <h3 style={{ margin: '0 0 10px' }}>🎮 Lessons made with this slide tool</h3>
        <PagedTable
          headers={['#', 'Lesson', 'Topic', 'Slides', 'Level', 'Created', 'Last accessed', 'Play']}
          rows={activities.map((e: any, idx: number) => {
            const d = e?.data || {};
            return [
              idx + 1,
              String(d?.title || label(d || {}) || 'Saved run').trim() || 'Saved run',
              String(d?.topic || lesson.subject || '').trim() || '—',
              Number(d?.slides || lesson.totalSlides || (Array.isArray(lesson.pages) ? lesson.pages.length : 0)) || '—',
              String(d?.level || d?.difficulty || lesson.level || '').trim() || 'Auto',
              fmtDateTime(e?.createdAt),
              fmtDateTime(e?.updatedAt || e?.createdAt),
              { node: <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <button className="btn small ghost" title="Owner history" onClick={() => { if (hasSaved) { setPhase('history'); window.scrollTo(0, 0); } }} style={{ padding: '0 8px' }}>📖</button>
                <button className="btn small ghost" title="Play this saved run" onClick={() => recordAndPlay(d || {}, { replica: true })} style={{ padding: '0 8px' }}>▶️</button>
              </span> },
            ] as Cell[];
          })}
          empty="No lessons have been made with this slide tool yet."
          rowsPerPage={6}
          tight
        />

        <hr style={{ border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '18px 0 12px' }} />
        <h3 style={{ margin: '0 0 10px' }}>🛠 Slide tool info</h3>
        <PagedTable
          headers={['Slide tool', 'Prompt', 'Layout hint', 'Created', 'Last accessed']}
          rows={[[
            def?.title || 'Untitled slide tool',
            String(def?.description || lesson?.style || '').trim() || '—',
            slideComboHint(),
            fmtDateTime((def as any)?.createdAt || null),
            fmtDateTime(activities[0]?.updatedAt || activities[0]?.createdAt || null),
          ]]}
          empty="No slide tool information is available."
          rowsPerPage={6}
          tight
        />
        </>)}
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
    const secs = startedAt.current ? Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)) : 0;
    const timeStr = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
    const doneSlides = Object.keys(results).map(Number).sort((a, b) => a - b);
    // Jump back into the deck at a given slide to review it (answers are kept).
    const reviewSlide = (i: number) => { setCur(i); setPhase('play'); window.scrollTo(0, 0); };
    const shareResult = async () => {
      const link = slug ? `${window.location.origin}/?tool=${encodeURIComponent(slug)}` : window.location.href;
      const text = `I scored ${scoreCount}/${answeredCount} (${pct}%) in ${timeStr} on ${label(cfg)} — SketchLearn`;
      try {
        if ((navigator as any).share) { await (navigator as any).share({ title: 'My SketchLearn result', text, url: link }); return; }
        await navigator.clipboard.writeText(`${text}\n${link}`);
        alert('Result copied to clipboard!');
      } catch { window.prompt('Copy your result:', `${text}\n${link}`); }
    };
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Lesson complete 🎉</h2>
          <p style={{ fontSize: 14, opacity: 0.7 }}>{label(cfg)}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
            <div><div style={{ fontSize: 24, fontWeight: 800 }}>{scoreCount}/{answeredCount}</div><div style={{ fontSize: 12, opacity: 0.6 }}>score ({pct}%)</div></div>
            <div><div style={{ fontSize: 24, fontWeight: 800 }}>⏱ {timeStr}</div><div style={{ fontSize: 12, opacity: 0.6 }}>time</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn small blue" onClick={shareResult}>🔗 Share result</button>
            <button className="btn small ghost" onClick={() => setShowReview(v => !v)}>{showReview ? 'Hide review' : '🔎 Review answers'}</button>
            {offlineOn && (
              <button className="btn small ghost" disabled={zipBusy} onClick={async () => {
                setZipBusy(true);
                try {
                  const blob = await buildLessonZip({
                    title: def?.title || lesson.subject || 'Lesson', subtitle: label(cfg),
                    slides: slidesRef.current.filter(Boolean) as Slide[], results,
                    score: scoreCount, answered: answeredCount, pct, timeStr,
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `${(slug || 'lesson')}-offline.zip`; document.body.appendChild(a); a.click(); a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 4000);
                } catch (e: any) { alert(e?.message || 'Could not build the offline copy.'); }
                setZipBusy(false);
              }}>{zipBusy ? <><Spinner />Zipping…</> : '⬇ Offline copy (.zip)'}</button>
            )}
          </div>
        </div>

        {/* Jump to any section of the finished lesson to review it. */}
        {doneSlides.length > 0 && (
          <div className="card alt" style={{ padding: '12px 14px', marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px' }}>Go to a section</h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {doneSlides.map((i) => {
                const r = results[i];
                const c = Object.values(r.answers).filter((x: any) => x.correct).length;
                const t = Object.keys(r.answers).length;
                return <button key={i} className="btn small" onClick={() => reviewSlide(i)} title={slidesRef.current[i]?.title || ''}>Slide {i + 1}{t ? ` · ${c}/${t}` : ''}</button>;
              })}
            </div>
          </div>
        )}

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
          {canPlay && <button className="btn green" onClick={() => play(cfg)}>↻ Replay</button>}
          <button className="btn" onClick={() => { clearPlay(); setPhase('hub'); loadActivities(); }}>← Back to lessons</button>
        </div>
        {/* The finished run is saved automatically (owner: canonical deck; everyone:
            their rendition entry) — no manual save button needed. */}
        {canEdit && deckMsg && <p style={{ fontSize: 11, opacity: 0.6, textAlign: 'center', marginTop: 8 }}>{deckMsg}</p>}

        {/* A comment section at the end of every finished lesson. */}
        {app.user && <CommentSection targetType="tool" targetId={slug} />}

        {/* Admin / moderator record of THIS run: one row per slide (up to the max),
            each cell a JSON dictionary of the slide's content + the student's result,
            plus the run details — a compact, saveable record. Hidden from learners. */}
        {(eff.isAdmin || eff.isModerator) && (() => {
          const origin = lessonOriginRef.current;
          const runDetails = {
            student: app.user?.username || 'guest',
            lesson: label(cfg),
            level: (cfg as any).level || (cfg as any).difficulty || '',
            // Origin link — by STABLE repo slug (title may change), plus unit/lesson.
            ...(origin?.repoSlug ? {
              fromRepo: origin.repoTitle || origin.repoSlug,
              fromRepoSlug: origin.repoSlug,
              unit: origin.unitTitle || '',
              lessonInUnit: `${(typeof origin.lessonIndex === 'number' && origin.lessonIndex >= 0 ? origin.lessonIndex + 1 : '?')} of ${origin.lessonCount || '?'}${origin.lessonTitle ? ` — ${origin.lessonTitle}` : ''}`,
            } : {}),
            date: startedAt.current ? new Date(startedAt.current).toLocaleDateString() : new Date().toLocaleDateString(),
            completedAt: new Date().toLocaleString(),
            timeTaken: timeStr,
            timeSeconds: secs,
            score: `${scoreCount}/${answeredCount}`,
            percent: pct,
            slidesGenerated: slidesRef.current.filter(Boolean).length,
          };
          const slideDict = (i: number) => {
            const s = slidesRef.current[i];
            if (!s) return null;
            const r = results[i];
            const answers = r ? Object.keys(r.answers).map(Number).sort((a, b) => a - b).map((k) => r.answers[k]) : [];
            return {
              slide: i + 1,
              title: s.title || '',
              content: s.content || '',
              support: (s.supportPlan && s.supportPlan.length ? s.supportPlan : (s._supports || []).map((c: any) => c && c.type).filter(Boolean)),
              questions: (s.questions || []).map((q: any) => ({ kind: q.kind, prompt: q.prompt, options: (q.options || []).map((o: any) => (o && typeof o === 'object' ? o.text : o)) })),
              results: answers.map((a: any) => ({ prompt: a.prompt, chose: a.your, expected: a.answer, correct: !!a.correct })),
            };
          };
          // Always render up to the max capacity (MAX_SLIDES rows) so every possible
          // slide has a row, even when fewer were generated — and grow if a deck is longer.
          const ROW_COUNT = Math.max(MAX_SLIDES, slidesRef.current.length);
          const jsonCell: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minWidth: 320, height: 66, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 10, lineHeight: 1.4, padding: '5px 7px', border: '1.5px solid var(--ink,#2d2a26)', borderRadius: 6, background: 'var(--paper,#fffdf7)', color: 'var(--ink,#2d2a26)', whiteSpace: 'pre', overflow: 'auto' };
          const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, padding: '5px 7px', borderBottom: '2px solid var(--ink,#2d2a26)', background: 'var(--card,#fff8ee)', position: 'sticky', top: 0 };
          const td: React.CSSProperties = { padding: '5px 7px', borderBottom: '1px solid var(--line,#d9cfc0)', verticalAlign: 'top' };
          return (
            <div className="card alt" style={{ padding: '14px 16px', marginTop: 16, maxWidth: 860, marginInline: 'auto' }}>
              <h4 style={{ margin: '0 0 4px' }}>📋 Run record — admin / moderator only</h4>
              <p style={{ fontSize: 11, opacity: 0.6, margin: '0 0 8px', lineHeight: 1.4 }}>
                One row per slide (up to {ROW_COUNT}). Each cell is a JSON dictionary of that slide’s content and the student’s result. The run details are the dictionary just below — a compact, saveable record of this generation.
              </p>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Run details</div>
                <textarea readOnly value={JSON.stringify(runDetails, null, 2)} style={{ ...jsonCell, height: 150, whiteSpace: 'pre-wrap' }} />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr><th style={{ ...th, width: 46, textAlign: 'center' }}>Slide</th><th style={th}>Content &amp; result (JSON dictionary)</th></tr></thead>
                  <tbody>
                    {Array.from({ length: ROW_COUNT }, (_, i) => {
                      const dict = slideDict(i);
                      return (
                        <tr key={i}>
                          <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{i + 1}</td>
                          <td style={td}>{dict
                            ? <textarea readOnly value={JSON.stringify(dict)} style={jsonCell} />
                            : <span style={{ fontSize: 11, opacity: 0.4 }}>— no slide generated —</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
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
  const canNext = allAnswered && !isLast && !genBusy;
  const canFinish = allAnswered && isLast && !genBusy;
  // The designed page for the CURRENT display position, honoring this run's play
  // order (the pages are shuffled per run, so read through runLesson()).
  const curPage = runLesson().pages?.[cur];
  const padSize = curPage?.padSize || 'large';
  const hasAnnotation = qList.some((q: Q) => q.kind === 'annotation');
  const scoreSoFar = Object.values(results).reduce((a, r) => a + Object.values(r.answers).filter((x: any) => x.correct).length, 0);
  // A slide is ready to REVEAL once its text is loaded AND all its visuals are
  // warmed. Until then the pencil skeleton stands in, so the whole slide appears
  // complete rather than half-loaded. Slides with no visuals are ready at once.
  const curNeedsWarm = !!(curSlide && Array.isArray(curSlide.supportPlan) && curSlide.supportPlan.length);
  const curReady = !!curSlide && (!curNeedsWarm || !!slideReady[cur]);

  return (
    <div>
      <style>{'@keyframes sl-spin{to{transform:rotate(360deg)}}'}</style>
      {/* Top run metadata: just the current level (the long subject/topic prompt
          is hidden — it's not needed while playing). */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.75, textAlign: 'center' }}>
          🎚️ Level: {slideLevel[cur] || cfg.level || cfg.difficulty || levels[0]}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Slide {cur + 1} / {tot}{qList.length > 1 ? ` · ${answeredCount}/${qList.length} answered` : ''}</span>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Score: {scoreSoFar}</span>
      </div>
      <div style={{ position: 'relative', height: 8, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden', border: '1.5px solid var(--ink)', marginBottom: 12 }}>
        <div style={{ width: `${((cur + 1) / tot) * 100}%`, height: '100%', background: 'var(--accent,#5c80bc)', transition: 'width 0.3s ease' }} />
        {/* Checkpoint ticks — one per slide boundary. */}
        {Array.from({ length: Math.max(0, tot - 1) }, (_, i) => (
          <span key={i} aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `${((i + 1) / tot) * 100}%`, width: 2, background: 'var(--ink)', opacity: 0.4 }} />
        ))}
      </div>

      {/* A slide-sized skeleton fills the space WHILE the whole slide loads (text
          AND its visuals), so the first slide appears complete rather than
          half-drawn, and the view keeps the same height (the layout doesn't
          collapse to reveal the comments). */}
      {!curReady && !err && (
        <div className="card" style={{ padding: '16px 18px', maxWidth: 640, margin: '0 auto', minHeight: 'min(72vh, 560px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Just the writing pencil, centred and large — no progress bar, no
              caption, no skeleton lines. */}
          <div style={{ lineHeight: 1 }}><WritingPencil size={88} block /></div>
        </div>
      )}
      {err && !curSlide && <p style={{ color: 'var(--danger,#e4572e)' }}>{err} <button className="btn small" onClick={() => fetchInto(cur, cfg)}>Retry</button></p>}

      {curReady && curSlide && (
        <div className="card" style={{ padding: '16px 18px', maxWidth: hasAnnotation ? 900 : 640, margin: '0 auto' }}>
          {curSlide.fallback && <p style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.7, textAlign: 'center' }}>Demo slide (no AI connected).</p>}
          {/* Title row with a ⚙ gear to change the TEXT LEVEL of this slide. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative' }}>
            <h3 style={{ margin: 0, textAlign: 'center' }}>{curSlide.title}</h3>
            <button className="btn small ghost" title="Change the reading level of this slide" onClick={() => setLevelOpen((o) => !o)} style={{ padding: '0 6px' }}>{relevelBusy ? <Spinner /> : '⚙'}</button>
            <button className="btn small ghost" title="Ask the AI to change this slide — add or remove a component, a question, an image…" onClick={() => setModOpen((o) => !o)} style={{ padding: '0 6px' }}>{modBusy ? <Spinner /> : '🧩'}</button>
            <button className="btn small ghost" title="Change the theme of this presentation (Vacations, Sports, Stoic philosophy…)" onClick={() => setThemeOpen((o) => !o)} style={{ padding: '0 6px' }}>{themeBusy ? <Spinner /> : '🎭'}</button>
            {(curSlide.supportPlan?.includes('image') || curSlide.support?.type === 'image') && (
              <button className="btn small ghost" title="Image style for this slide" onClick={() => setImgStyleOpen((o) => !o)} style={{ padding: '0 6px' }}>🖼</button>
            )}
            <button className="btn small ghost" title="Image API — choose which image generator to use (Pollinations is free)" onClick={() => setProviderOpen((o) => !o)} style={{ padding: '0 6px' }}>🔌</button>
            <button className="btn small ghost" title="Voice — choose which voice reads aloud / pronounces words" onClick={() => setVoiceOpen((o) => !o)} style={{ padding: '0 6px' }}>🎙</button>
            {voiceOpen && (
              <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, padding: 8, minWidth: 200, maxHeight: 320, overflowY: 'auto', textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>VOICE</div>
                {[{ id: '', label: 'Default voice' }, ...TTS_VOICES].map((v) => {
                  const active = (cfg.voice || '') === v.id;
                  return <button key={v.id || 'default'} className={`btn small ${active ? 'green' : 'ghost'}`} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3 }} onClick={() => setVoice(v.id)}>{v.label}</button>;
                })}
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>Used by 🔊 read-aloud and click-to-pronounce.</div>
              </div>
            )}
            {providerOpen && (
              <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, padding: 8, minWidth: 200, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>IMAGE API</div>
                {[{ id: '', label: 'Auto (best available)' }, ...imageProviders].map((p) => {
                  const active = (cfg.imageProvider || '') === p.id;
                  return <button key={p.id || 'auto'} className={`btn small ${active ? 'green' : 'ghost'}`} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3 }} onClick={() => setImageProvider(p.id)}>{p.label}</button>;
                })}
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>Pollinations is free &amp; needs no key. Regenerates this slide&apos;s image(s).</div>
              </div>
            )}
            {themeOpen && (
              <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, padding: 8, minWidth: 200, maxHeight: 320, overflowY: 'auto', textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>THEME</div>
                {LESSON_THEMES.map((th) => {
                  const active = (cfg.theme || 'Any') === th;
                  return <button key={th} className={`btn small ${active ? 'green' : 'ghost'}`} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3 }} onClick={() => setLessonTheme(th)}>{th === 'Any' ? 'Any (AI picks)' : th}</button>;
                })}
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>Reframes this &amp; the following slides. Saved if you finish the run.</div>
              </div>
            )}
            {imgStyleOpen && (
              <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, padding: 8, minWidth: 180, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>IMAGE STYLE</div>
                {IMAGE_STYLES.map((st) => {
                  const active = (slideImgStyle[cur] || cfg.imageStyle || 'Any') === st;
                  return <button key={st} className={`btn small ${active ? 'green' : 'ghost'}`} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3 }} onClick={() => setSlideImageStyle(st)}>{st}</button>;
                })}
                {(() => {
                  const curStyle = slideImgStyle[cur] || cfg.imageStyle || 'Any';
                  const isCustom = !(IMAGE_STYLES as readonly string[]).includes(curStyle);
                  return <input type="text" defaultValue={isCustom ? curStyle : ''} placeholder="✍️ Custom style — type & Enter"
                    onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) setSlideImageStyle(v); } }}
                    style={{ width: '100%', marginTop: 4, fontSize: 12 }} />;
                })()}
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>Regenerates this slide&apos;s image(s).</div>
              </div>
            )}
            {modOpen && (
              <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, padding: 10, minWidth: 240, maxWidth: 300, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>CHANGE THIS SLIDE</div>
                <textarea value={modText} onChange={(e) => setModText(e.target.value)} disabled={modBusy}
                  placeholder="e.g. add a multiple-choice question about…, remove the image, make it shorter"
                  style={{ width: '100%', minHeight: 56, fontSize: 13 }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyModify(); }} />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                  <button className="btn small ghost" onClick={() => setModOpen(false)}>✕</button>
                  <button className="btn small blue" disabled={modBusy || !modText.trim()} onClick={applyModify}>{modBusy ? <><Spinner />Applying…</> : '🔄 Apply'}</button>
                </div>
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>The AI rebuilds this slide with your change.</div>
              </div>
            )}
            {levelOpen && (
              <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 30, padding: 8, minWidth: 170, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>READING LEVEL</div>
                {TEXT_LEVELS.map((lvl) => {
                  const active = (slideLevel[cur] || cfg.level || cfg.difficulty) === lvl;
                  return <button key={lvl} className={`btn small ${active ? 'green' : 'ghost'}`} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3 }} onClick={() => relevel(lvl)}>{lvl}</button>;
                })}
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>Higher = deeper &amp; more technical, not just longer.</div>
              </div>
            )}
          </div>
          {/* A dashed rule under the title separates it from the teaching text. */}
          <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.5, margin: '8px 0 12px' }} />
          {/* On-slide helper tooltips (hints/links/ask-AI). Hidden when the player
              turned Tooltips OFF for this run (some students lack tooltip access). */}
          {cfg.tooltips !== false && curPage?.decorations?.length ? <Decorations items={curPage.decorations} subject={lesson.subject || ''} topic={cfg.topic || ''} onFinish={() => { setPhase('done'); window.scrollTo(0, 0); }} /> : null}
          {/* Body order depends on the slide:
              • Normal slide → teaching text, then its visuals, then the question(s).
              • Multiple-choice slide → visuals + the question FIRST (predict from the
                picture/table/etc.), and the teaching text is revealed only AFTER the
                MCQ is answered, so the lesson "continues teaching" once you commit. */}
          {(() => {
            const contentEl = curSlide.content ? (
              <div>
                <p style={{ fontSize: 16, lineHeight: 1.6, margin: 0 }}><RichText text={curSlide.content} translateTo={lesson.translateTo || 'English'} speakable={!!lesson.language} voiceId={cfg.voice} /></p>
                {curSlide.provider && <div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--muted,#8a7f70)', fontStyle: 'italic' }}>text generated by {curSlide.provider}</div>}
              </div>
            ) : null;
            const supportsEl = (
              <SupportsLoader slide={curSlide} ctx={{ lesson, values: cfg, imageStyle: slideImgStyle[cur] || cfg.imageStyle || '', imageProvider: cfg.imageProvider || '', nonce: supportNonce }} />
            );
            const questionsEl = qList.map((q: Q, i: number) => {
              const ans = res?.answers?.[i];
              return (
                <div key={`${cur}-${i}`} style={{ marginTop: 14, borderTop: '2px dashed var(--ink)', paddingTop: 14 }}>
                  {qList.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, marginBottom: 6 }}>Question {i + 1} / {qList.length}</div>}
                  {/* MCQ keeps its full option list (chosen red, correct green,
                      explanation below) even after it's answered; other kinds use
                      the compact ReviewRow once answered. */}
                  {ans && q.kind !== 'mcq'
                    ? <ReviewRow d={ans} />
                    : q.kind === 'annotation'
                      ? <AnnotationQuestion q={q} subject={lesson.subject || ''} size={padSize} onDone={(c, d) => recordQ(i, c, d)} />
                      : q.kind === 'code'
                        ? <CodeQuestion q={q} subject={lesson.subject || ''} onDone={(c, d) => recordQ(i, c, d)} />
                        : q.kind === 'writing'
                          ? <WritingQuestion q={q} translateTo={lesson.translateTo || 'English'} onDone={(c, d) => recordQ(i, c, d)} />
                          : <ChoiceQuestion q={q} translateTo={lesson.translateTo || 'English'} subject={lesson.subject || ''} recorded={ans} voiceId={cfg.voice} speakable={!!lesson.language} onDone={(c, d) => recordQ(i, c, d)} />}
                </div>
              );
            });
            // Teaching TEXT is always shown first on EVERY slide (no hiding it
            // behind the question), then the support visuals, then the question(s).
            return (
              <>
                {/* Reading passage (its own "paper") — always visible. */}
                {contentEl}
                {/* Support materials — each streams into its own card, dotted-separated. */}
                {(curSlide.supportPlan?.length || curSlide.support) && curSlide.content ? <div style={{ borderTop: '1.5px dashed var(--ink)', marginTop: 12 }} /> : null}
                {supportsEl}
                {/* Every question, stacked as its own "paper"; scroll down to reach them. */}
                {questionsEl}
              </>
            );
          })()}

          {/* The single, clear navigation bar — one place, always the same order. */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16, borderTop: '1.5px solid rgba(0,0,0,0.12)', paddingTop: 14 }}>
            <button className="btn blue" disabled={!canNext} onClick={() => goToSlide(cur + 1)}>{genBusy && curSlide ? <><Spinner />Loading…</> : 'Next →'}</button>
            <button className="btn green" disabled={!canFinish} onClick={() => setPhase('done')}>🏁 Finish</button>
          </div>
          {!allAnswered && <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 6 }}>Answer {qList.length > 1 ? 'every question' : 'the question'} above to unlock {isLast ? 'Finish' : 'Next'}.</p>}
        </div>
      )}
    </div>
  );
}
