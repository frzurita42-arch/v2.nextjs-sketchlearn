'use client';
/* The Builder chat. You describe a tool; the AI asks a couple of short questions
 * (multiple-choice chips + a custom-answer box) then proposes a Tool Definition
 * you can preview and publish. Falls back to a heuristic proposal with no AI. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';

type Msg = { role: 'assistant' | 'user'; content: string };

// Preset tool TYPES — clicking one seeds the AI with that kind of tool, which
// also steers the display (slides vs cards vs table vs feed).
const PRESETS: { label: string; seed: string }[] = [
  { label: '📊 Presentation', seed: 'a playable multi-slide presentation/lesson with quiz questions and a score' },
  { label: '🎧 Single activity', seed: 'a single-page activity: one short lesson or listening/reading, a few questions, then a report I can review' },
  { label: '📝 Annotation / Worked answers', seed: 'a worked-answer quiz where the learner writes the full solution by hand on a paper pad (math problems, or calligraphy / full sentences), and the AI grades it — one question per slide. Include a code/text box option too, and let me mix pad questions and code-box questions' },
  { label: '💬 AI canvas chat', seed: 'an AI conversation on the annotation pad: I write or draw a message, send it, and the AI replies at the top like a chat. No set length — I can exit any time and publish the whole conversation with an AI recap' },
  { label: '📓 Journal / Diary', seed: 'a journal/diary with no AI — I write pages by hand on the pad, add as many as I like, then publish the pages' },
  { label: '🖼️ Gallery / Marketplace', seed: 'a marketplace-style gallery where people add items shown as cards on a grid, each with an image, a description and a link' },
  { label: '🗂️ Storage / Repository', seed: 'a document storage/repository shown as a list/table of items, each with a name, a category and a link to the file' },
  { label: '📰 Feed / Blog', seed: 'a feed/blog where people post entries shown as cards, with an image, text and an optional link' },
];

export function ToolBuilderView() {
  const app = useApp();
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: "Tell me what you want to build — a generator (makes something from a prompt) or an app (stores and shows entries). Describe it in a sentence or two." },
  ]);
  const [resp, setResp] = useState<any>(null);           // last {kind, ...}
  const [draft, setDraft] = useState<any>(null);         // proposed definition
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');                // last failure (shows a retry bar)
  const [visibility, setVisibility] = useState('unlisted');
  const logRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<null | (() => void)>(null);    // what "Try again" re-runs

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, busy, draft, error]);

  // Post the conversation to the Builder. The API auto-retries transient network
  // failures; if it still fails, we surface a retry bar instead of a dead-end.
  const runBuild = async (next: Msg[]) => {
    setMessages(next); setBusy(true); setResp(null); setError('');
    try {
      const r = await API.post('/api/tools/build', { messages: next }, { retries: 2 });
      if (r?.kind === 'proposal') {
        setDraft(r.definition);
        setMessages([...next, { role: 'assistant', content: r.summary || 'Here is a tool based on what you described. Preview it below, then publish.' }]);
      } else {
        setResp(r);
        setMessages([...next, { role: 'assistant', content: r?.question || 'Tell me more.' }]);
      }
    } catch (e: any) {
      // Keep the conversation intact and offer a one-tap retry of this same turn.
      setError(e?.message || 'Something went wrong reaching the Builder.');
      retryRef.current = () => runBuild(next);
    }
    setBusy(false);
  };

  const send = (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setInput('');
    runBuild([...messages, { role: 'user', content: t }]);
  };

  const retry = () => { const fn = retryRef.current; if (fn && !busy) { setError(''); fn(); } };

  const restart = () => {
    setMessages([{ role: 'assistant', content: "Tell me what you want to build — a generator (makes something from a prompt) or an app (stores and shows entries). Describe it in a sentence or two." }]);
    setResp(null); setDraft(null); setInput(''); setError(''); retryRef.current = null;
  };

  const publish = async () => {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const r = await API.post('/api/tools', { definition: draft, visibility, aiGenerated: true });
      // Open the freshly published tool in the runtime.
      const one = await API.get(`/api/tools?slug=${encodeURIComponent(r.slug)}`);
      if (one?.tool) { appState.activeTool = one.tool; app.nav('tool'); return; }
      app.nav('tools');
    } catch (e: any) {
      setError(e?.message || 'Could not publish the tool.');
      retryRef.current = () => publish();
    }
    setBusy(false);
  };

  return (
    <>
      <h1 className="view-title">Build a <span className="scribble-underline">tool</span></h1>
      <p className="view-sub">Describe it — the AI assembles it from the platform&apos;s components.{' '}
        <button className="btn small ghost" onClick={() => app.nav('tools')}>← Gallery</button>{' '}
        <button className="btn small ghost" onClick={restart} disabled={busy} title="Clear the conversation and start over">↻ Restart</button></p>

      <div className="chat-shell" style={{ maxWidth: 720 }}>
        <div className="chat-log" ref={logRef}>
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}><span>{m.content}</span></div>
          ))}
          {busy && <div className="msg ai">✏️ …</div>}
        </div>

        {/* A failed request never dead-ends: retry the same turn, or restart. */}
        {error && !busy && (
          <div className="card" style={{ padding: '10px 14px', margin: '8px 0', borderColor: 'var(--danger,#e4572e)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13 }}>⚠️ {error}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              {retryRef.current && <button className="btn small green" onClick={retry}>↻ Try again</button>}
              <button className="btn small ghost" onClick={restart}>Restart chat</button>
            </span>
          </div>
        )}

        {/* Preset tool-type buttons shown before the conversation gets going. */}
        {messages.length <= 1 && !draft && !busy && (
          <div style={{ margin: '8px 0' }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Start from a type:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESETS.map((p, i) => (
                <button key={i} className="btn small" title={p.seed} onClick={() => send(p.seed)}>{p.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Multiple-choice chips for a question (custom answer still allowed below). */}
        {resp?.kind === 'question' && resp.options?.length > 0 && !busy && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            {resp.options.map((o: string, i: number) => (
              <button key={i} className="btn small" onClick={() => send(o)}>{o}</button>
            ))}
          </div>
        )}

        {/* Proposal preview + publish. */}
        {draft && !busy && (
          <div className="card alt" style={{ padding: '14px 16px', margin: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <strong style={{ fontSize: 16 }}>{draft.title}</strong>
              <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>{draft.archetype === 'app' ? 'APP' : 'GENERATOR'}</span>
            </div>
            {draft.description && <p style={{ margin: '6px 0', fontSize: 13 }}>{draft.description}</p>}
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              {draft.archetype === 'generator' ? (
                <>
                  <div><b>Asks for:</b> {(draft.settings || []).map((f: any) => f.label).join(', ') || '—'}</div>
                  <div><b>Produces:</b> {draft.generator?.output}</div>
                </>
              ) : (
                <>
                  <div><b>Each entry:</b> {(draft.app?.entryFields || []).map((f: any) => `${f.label} (${f.type})`).join(', ')}</div>
                  <div><b>Shows as:</b> {draft.app?.display}{draft.app?.review ? ' · with owner review' : ''}</div>
                </>
              )}
            </div>
            <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 12, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Visibility</span>
                <select value={visibility} onChange={e => setVisibility(e.target.value)}>
                  <option value="private">Private (only me)</option>
                  <option value="unlisted">Unlisted (link only)</option>
                  <option value="public">Public (in the gallery)</option>
                </select></label>
              <button className="btn green" onClick={publish}>Publish →</button>
              <span style={{ fontSize: 12, opacity: 0.7 }}>or keep chatting to refine it.</span>
            </div>
          </div>
        )}

        <div className="chat-input-row">
          <textarea value={input} placeholder="Describe your tool, or type a custom answer…"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
          <button className="btn primary" disabled={busy} onClick={() => send(input)}>Send</button>
        </div>
      </div>
    </>
  );
}
