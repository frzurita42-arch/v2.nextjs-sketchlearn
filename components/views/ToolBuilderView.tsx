'use client';
/* The Builder chat. You describe a tool; the AI asks a couple of short questions
 * (multiple-choice chips + a custom-answer box) then proposes a Tool Definition
 * you can preview and publish. Falls back to a heuristic proposal with no AI. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';

type Msg = { role: 'assistant' | 'user'; content: string };

const SUGGESTIONS = [
  '🍌 A banana Instagram page where people upload photo posts with captions',
  '🇫🇷 A French lesson where I set leveled slides and learners play them',
  '🛡️ A cybersecurity CVE tracker dashboard',
  '📓 A daily journal with mood and a photo',
  '🔗 A link directory with categories',
  '🗳️ A community poll board',
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
  const [visibility, setVisibility] = useState('unlisted');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, busy, draft]);

  const send = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setInput('');
    const next: Msg[] = [...messages, { role: 'user', content: t }];
    setMessages(next); setBusy(true); setResp(null);
    try {
      const r = await API.post('/api/tools/build', { messages: next });
      if (r?.kind === 'proposal') {
        setDraft(r.definition);
        setMessages([...next, { role: 'assistant', content: r.summary || 'Here is a tool based on what you described. Preview it below, then publish.' }]);
      } else {
        setResp(r);
        setMessages([...next, { role: 'assistant', content: r?.question || 'Tell me more.' }]);
      }
    } catch (e: any) {
      setMessages([...next, { role: 'assistant', content: `(Builder hiccup: ${e.message})` }]);
    }
    setBusy(false);
  };

  const publish = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await API.post('/api/tools', { definition: draft, visibility, aiGenerated: true });
      // Open the freshly published tool in the runtime.
      const one = await API.get(`/api/tools?slug=${encodeURIComponent(r.slug)}`);
      if (one?.tool) { appState.activeTool = one.tool; app.nav('tool'); return; }
      app.nav('tools');
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', content: `(Could not publish: ${e.message})` }]);
    }
    setBusy(false);
  };

  return (
    <>
      <h1 className="view-title">Build a <span className="scribble-underline">tool</span></h1>
      <p className="view-sub">Describe it — the AI assembles it from the platform&apos;s components.{' '}
        <button className="btn small ghost" onClick={() => app.nav('tools')}>← Gallery</button></p>

      <div className="chat-shell" style={{ maxWidth: 720 }}>
        <div className="chat-log" ref={logRef}>
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}><span>{m.content}</span></div>
          ))}
          {busy && <div className="msg ai">✏️ …</div>}
        </div>

        {/* Starter suggestions shown before the conversation gets going. */}
        {messages.length <= 1 && !draft && !busy && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="btn small" onClick={() => send(s.replace(/^\S+\s/, ''))}>{s}</button>
            ))}
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
