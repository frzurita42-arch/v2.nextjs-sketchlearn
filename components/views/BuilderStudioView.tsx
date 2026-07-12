'use client';
/* The Builder STUDIO — a visual, structured way to compose a tool, with a tab to
 * a short-question CHAT. You pick the artifact type (a slide Presentation OR a
 * Repository/collection — not both), add components by category (each becomes a
 * bar with a "how to use it" instruction), set the slide/paragraph counts, and
 * hit Generate. Generation merges the visual settings WITH the chat history, so
 * either alone — or both together — works. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import {
  STUDIO_CATEGORIES, ANNOTATION_SIZES, studioItem, assembleDefinition,
  type StudioConfig, type StudioComponent, type ArtifactKind,
} from '@/lib/studio-catalog';

type Msg = { role: 'assistant' | 'user'; content: string };

export function BuilderStudioView() {
  const app = useApp();
  const [tab, setTab] = useState<'studio' | 'chat'>('studio');

  // ---- Studio config ----
  const [artifact, setArtifact] = useState<ArtifactKind>('presentation');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [slides, setSlides] = useState(5);
  const [paragraphs, setParagraphs] = useState(1);
  const [length, setLength] = useState<'brief' | 'medium' | 'detailed'>('medium');
  const [tone, setTone] = useState('Friendly');
  const [display, setDisplay] = useState<'cards' | 'list' | 'table'>('cards');
  const [components, setComponents] = useState<StudioComponent[]>([]);
  const [context, setContext] = useState('');
  const [visibility, setVisibility] = useState('unlisted');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // ---- Chat state (shared: fed into Generate) ----
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatOpts, setChatOpts] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, chatBusy]);

  const cats = STUDIO_CATEGORIES.filter((c) => c.for === artifact || c.for === 'both');
  const addComponent = (id: string) => { if (!id || components.some((c) => c.id === id)) return; setComponents((cs) => [...cs, { id, instr: '', opt: studioItem(id)?.sizes ? ANNOTATION_SIZES[1] : undefined }]); };
  const setCompField = (id: string, patch: Partial<StudioComponent>) => setComponents((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeComponent = (id: string) => setComponents((cs) => cs.filter((c) => c.id !== id));

  const config = (): StudioConfig => ({ artifact, title, subject, slides, paragraphs, length, tone, display, components, context });

  const generate = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const assembled = assembleDefinition(config());
      const r = await API.post('/api/tools/studio-build', { definition: assembled, messages }, { retries: 1 });
      const def = r?.definition || assembled;
      const pub = await API.post('/api/tools', { definition: def, visibility, aiGenerated: true });
      const one = await API.get(`/api/tools?slug=${encodeURIComponent(pub.slug)}`);
      if (one?.tool) { appState.activeTool = one.tool; app.nav('tool'); return; }
      app.nav('tools');
    } catch (e: any) { setErr(e?.message || 'Could not generate the tool.'); }
    setBusy(false);
  };

  // ---- Chat: always a short follow-up question ----
  const askNext = async (next: Msg[]) => {
    setChatBusy(true); setChatOpts([]);
    try {
      const r = await API.post('/api/tools/studio-chat', { messages: next }, { retries: 2 });
      setMessages([...next, { role: 'assistant', content: r?.reply || 'Tell me more about the lesson.' }]);
      setChatOpts(Array.isArray(r?.options) ? r.options : []);
    } catch { setMessages([...next, { role: 'assistant', content: '(Could not reach the assistant — you can still Generate from the Studio tab.)' }]); }
    setChatBusy(false);
  };
  const sendChat = (text: string) => { const t = text.trim(); if (!t || chatBusy) return; setInput(''); askNext([...messages, { role: 'user', content: t }]); };
  useEffect(() => { if (tab === 'chat' && messages.length === 0 && !chatBusy) askNext([]); /* eslint-disable-next-line */ }, [tab]);

  const gridCol = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 } as const;

  return (
    <>
      <h1 className="view-title">Build a <span className="scribble-underline">tool</span></h1>
      <p className="view-sub">Compose it visually, or chat — the two combine.{' '}
        <button className="btn small ghost" onClick={() => app.nav('tools')}>← Gallery</button></p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
        <button className={`btn ${tab === 'studio' ? 'blue' : 'ghost'}`} onClick={() => setTab('studio')}>🧩 Studio</button>
        <button className={`btn ${tab === 'chat' ? 'blue' : 'ghost'}`} onClick={() => setTab('chat')}>💬 Chat</button>
      </div>

      {tab === 'studio' ? (
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          {/* Artifact type — presentation XOR repository */}
          <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 8 }}>WHAT ARE YOU MAKING?</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {([['presentation', '📊 Presentation', 'A playable, scored slide deck'], ['repository', '🗂️ Repository', 'A collection / gallery of posted items (multiple pages, no slides)']] as const).map(([k, name, d]) => (
                <button key={k} className={`btn ${artifact === k ? 'green' : 'ghost'}`} style={{ flex: '1 1 220px', textAlign: 'left', padding: '10px 12px' }} onClick={() => { setArtifact(k); setComponents([]); }}>
                  <div style={{ fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{d}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Global settings */}
          <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 8 }}>SETTINGS</div>
            <div style={gridCol}>
              <label className="field"><span>Title</span><input value={title} placeholder="Name your tool" onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="field"><span>{artifact === 'presentation' ? 'Subject / topic' : 'Collection name'}</span><input value={subject} placeholder={artifact === 'presentation' ? 'e.g. Trigonometry' : 'e.g. My sketchbook'} onChange={(e) => setSubject(e.target.value)} /></label>
              {artifact === 'presentation' ? (
                <>
                  <label className="field"><span>Slides</span><input type="number" min={1} max={15} value={slides} onChange={(e) => setSlides(Number(e.target.value))} /></label>
                  <label className="field"><span>Paragraph length</span><select value={length} onChange={(e) => setLength(e.target.value as any)}><option value="brief">brief</option><option value="medium">medium</option><option value="detailed">detailed</option></select></label>
                  <label className="field"><span>Paragraphs / slide</span><input type="number" min={1} max={4} value={paragraphs} onChange={(e) => setParagraphs(Number(e.target.value))} /></label>
                  <label className="field"><span>Tone</span><input value={tone} onChange={(e) => setTone(e.target.value)} /></label>
                </>
              ) : (
                <label className="field"><span>Show items as</span><select value={display} onChange={(e) => setDisplay(e.target.value as any)}><option value="cards">Cards</option><option value="list">List</option><option value="table">Table</option></select></label>
              )}
            </div>
          </div>

          {/* Component picker */}
          <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>{artifact === 'presentation' ? 'COMPONENTS ON YOUR SLIDES' : 'FIELDS ON EACH ITEM'}</div>
              <select value="" onChange={(e) => { addComponent(e.target.value); e.currentTarget.selectedIndex = 0; }} style={{ maxWidth: 260 }}>
                <option value="">＋ Add a component…</option>
                {cats.map((cat) => (
                  <optgroup key={cat.id} label={cat.label}>
                    {cat.items.map((it) => <option key={it.id} value={it.id} disabled={components.some((c) => c.id === it.id)}>{it.emoji} {it.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            {components.length === 0 ? <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Add a component to shape what each {artifact === 'presentation' ? 'slide' : 'item'} contains.</p> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {components.map((c) => {
                  const it = studioItem(c.id); if (!it) return null;
                  return (
                    <div key={c.id} className="card alt" style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{it.emoji} {it.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.72 }}>{it.desc}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          {it.sizes && (
                            <select value={c.opt || ANNOTATION_SIZES[1]} onChange={(e) => setCompField(c.id, { opt: e.target.value })} style={{ fontSize: 12 }}>
                              {ANNOTATION_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                          <input value={c.instr || ''} placeholder="How should the AI use this? (optional)" onChange={(e) => setCompField(c.id, { instr: e.target.value })} style={{ flex: '1 1 200px', fontSize: 13 }} />
                        </div>
                      </div>
                      <button className="btn small ghost" title="Remove" onClick={() => removeComponent(c.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Free context */}
          <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <label className="field" style={{ gridColumn: '1 / -1' }}><span>Anything else for the AI to consider? (optional)</span>
              <textarea value={context} placeholder="Extra details, constraints, examples…" onChange={(e) => setContext(e.target.value)} style={{ minHeight: 52 }} /></label>
            {messages.some((m) => m.role === 'user') && <small style={{ fontSize: 11, opacity: 0.65 }}>💬 Your chat answers will also be merged in when you generate.</small>}
          </div>

          {err && <p style={{ color: 'var(--danger,#e4572e)', textAlign: 'center' }}>{err}</p>}
          <div className="slide-actions" style={{ justifyContent: 'center', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Visibility</span>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
              </select></label>
            <button className="btn green" disabled={busy} onClick={generate}>{busy ? 'Generating…' : '✨ Generate the tool →'}</button>
          </div>
        </div>
      ) : (
        // ---- CHAT tab ----
        <div className="chat-shell" style={{ maxWidth: 720 }}>
          <p style={{ fontSize: 12, opacity: 0.65, textAlign: 'center', margin: '0 0 8px' }}>Answer as much or as little as you like — then hit <b>Generate</b> in the Studio tab. Everything you say is merged with your settings.</p>
          <div className="chat-log" ref={logRef}>
            {messages.length === 0 && !chatBusy && <div className="msg ai"><span>Describe your lesson idea and I&apos;ll ask a few quick questions.</span></div>}
            {messages.map((m, i) => <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}><span>{m.content}</span></div>)}
            {chatBusy && <div className="msg ai">✏️ …</div>}
          </div>
          {chatOpts.length > 0 && !chatBusy && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
              {chatOpts.map((o, i) => <button key={i} className="btn small" onClick={() => sendChat(o)}>{o}</button>)}
            </div>
          )}
          <div className="chat-input-row">
            <textarea value={input} placeholder="Type your idea or answer…" onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(input); } }} />
            <button className="btn primary" disabled={chatBusy} onClick={() => sendChat(input)}>Send</button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button className="btn green" disabled={busy} onClick={generate}>{busy ? 'Generating…' : '✨ Generate the tool →'}</button>
          </div>
        </div>
      )}
    </>
  );
}
