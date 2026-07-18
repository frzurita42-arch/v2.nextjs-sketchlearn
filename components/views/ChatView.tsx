'use client';
/* Coach chat — now a conversational builder too. You chat about what you want to
 * learn; the coach's job is to gather enough to recommend (and build) a slide tool
 * or repo. "🧰 Build from this chat" turns the conversation into a real tool
 * (spending your credits), shows a writing-pencil card while it works, then drops a
 * sticky note with a button to open/play it (and the estimated credits to run it).
 * You can also attach images to your messages. Your credit balance is shown up top. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState, initialCoachGreeting, type ChatMessage } from '@/lib/app-state';
import { downloadCsv } from '@/lib/util';
import { PageHeader } from '@/components/ui/PageHeader';
import { AudioButton } from '@/components/ui/AudioButton';
import { MicButton } from '@/components/ui/MicButton';
import { useApp } from '@/components/AppContext';
import { estimateLessonTokens } from '@/lib/cost-estimate';

type Sticky = { slug: string; title: string; kind: string; runCost: number };
type ChatMsg = ChatMessage & { images?: string[]; sticky?: Sticky; building?: boolean };

export function ChatView() {
  const app = useApp();
  const [messages, setMessages] = useState<ChatMsg[]>(appState.chat as ChatMsg[]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [building, setBuilding] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);   // data URLs
  const [balance, setBalance] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { appState.chat = messages; }, [messages]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, thinking, building]);
  const loadBalance = () => { if (!app.user) { setBalance(null); return; } API.get('/api/tokens').then((t: any) => setBalance(typeof t?.balance === 'number' ? t.balance : null)).catch(() => { /* ignore */ }); };
  useEffect(() => { loadBalance(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [app.user?.username]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).slice(0, 6).forEach((f) => {
      if (!f.type.startsWith('image/') || f.size > 4_000_000) return;
      const rd = new FileReader(); rd.onload = () => setAttachments((a) => [...a, String(rd.result || '')]); rd.readAsDataURL(f);
    });
  };
  const pickFiles = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.onchange = () => addFiles(inp.files); inp.click(); };

  const send = async () => {
    const text = input.trim();
    if (!text && !attachments.length) return;
    setInput('');
    const imgs = attachments; setAttachments([]);
    const userMsg: ChatMsg = { role: 'user', content: text || '(shared an image)', ...(imgs.length ? { images: imgs } : {}) };
    const next = [...messages, userMsg];
    setMessages(next); setThinking(true);
    try {
      const r = await API.post('/api/ai/chat', { messages: next.filter((m) => !m.sticky && !m.building).map((m) => ({ role: m.role, content: m.content + (m.images?.length ? ` [attached ${m.images.length} image(s)]` : '') })), images: imgs });
      setMessages([...next, { role: 'assistant', content: r.reply }]);
    } catch (e: any) { setMessages([...next, { role: 'assistant', content: `(The coach dropped their pencil: ${e.message})` }]); }
    setThinking(false); loadBalance();
  };

  // Turn the conversation into a real tool: build a proposal, publish it, drop a
  // sticky note with a link. Auto-answers any builder questions with best-guess so
  // it reaches a proposal from the chat.
  const buildTool = async () => {
    if (!app.user) { app.requireLogin(); return; }
    if (building) return;
    setBuilding(true);
    setMessages((m) => [...m, { role: 'assistant', content: '', building: true }]);
    try {
      const convo = messages.filter((m) => !m.sticky && !m.building).map((m) => ({ role: m.role, content: m.content }));
      let r: any = await API.post('/api/tools/build', { messages: convo });
      let guard = 0;
      while (r?.kind === 'question' && guard++ < 3) {
        r = await API.post('/api/tools/build', { messages: [...convo, { role: 'assistant', content: r.question || '' }, { role: 'user', content: 'Use your best judgment.' }] });
      }
      if (r?.kind === 'proposal' && r.definition) {
        const pub: any = await API.post('/api/tools', { definition: r.definition, visibility: 'public', aiGenerated: true });
        const slug = pub?.tool?.slug || pub?.slug;
        const kind = r.definition.archetype || 'lesson';
        const runCost = kind === 'lesson' ? estimateLessonTokens({ slides: r.definition?.lesson?.totalSlides }) : 0;
        setMessages((m) => m.filter((x) => !x.building).concat(
          { role: 'assistant', content: r.summary || 'Built it! Open the sticky note to try it.' },
          { role: 'assistant', content: '', sticky: { slug, title: r.definition.title || 'New tool', kind, runCost } },
        ));
      } else {
        setMessages((m) => m.filter((x) => !x.building).concat({ role: 'assistant', content: r?.question || 'Tell me a bit more (subject + level) and I’ll build it.' }));
      }
    } catch (e: any) {
      setMessages((m) => m.filter((x) => !x.building).concat({ role: 'assistant', content: `(Could not build that: ${e.message})` }));
    }
    setBuilding(false); loadBalance();
  };

  const openTool = async (slug: string) => {
    try { const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(slug)}`); appState.activeTool = r?.tool || { slug }; } catch { appState.activeTool = { slug }; }
    app.nav('tool');
  };

  const clear = () => { if (!confirm('Clear the chat window?')) return; setMessages([initialCoachGreeting]); };

  return (
    <>
      <PageHeader page="coach" />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 10px' }}>
        <button className="btn small" id="chat-export" onClick={downloadCsv}>⬇ spreadsheet</button>
        {app.user && <span style={{ fontSize: 13, fontWeight: 700, color: (balance ?? 0) > 0 ? 'var(--green,#7fb069)' : 'var(--danger,#e4572e)' }}>🎟 {balance == null ? '…' : balance.toLocaleString()} credits</span>}
      </div>
      <div className="chat-shell">
        <div className="chat-log" id="chat-log" ref={logRef}>
          {messages.map((m, i) => {
            if (m.building) return (
              <div key={i} className="msg ai">
                <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px' }}>
                  <span className="sl-pencil" style={{ fontSize: 26, color: 'var(--ink)' }} aria-hidden><span className="sl-pencil__line" /><span className="sl-pencil__tip">✏️</span></span>
                  <span style={{ fontSize: 13 }}>Building your tool…</span>
                </div>
              </div>
            );
            if (m.sticky) return (
              <div key={i} className="msg ai">
                <div className="slide-comp comp-sticky sticky-yellow" style={{ transform: 'rotate(-1deg)', maxWidth: 320 }}>
                  <b className="sticky-title" style={{ display: 'block' }}>{m.sticky.kind === 'repo' ? '📁' : '🎬'} {m.sticky.title}</b>
                  <p style={{ margin: '4px 0 8px', fontSize: 13 }}>Ready to {m.sticky.kind === 'repo' ? 'open' : 'play'}.{m.sticky.runCost ? ` ≈ ${m.sticky.runCost.toLocaleString()} credits to run.` : ''}</p>
                  <button className="btn small green" onClick={() => openTool(m.sticky!.slug)}>{m.sticky.kind === 'repo' ? 'Open →' : '▶ Open & play'}</button>
                </div>
              </div>
            );
            return (
              <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                {m.images?.length ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: m.content ? 6 : 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {m.images.map((src, k) => <img key={k} src={src} alt="attachment" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ink)' }} />)}
                  </div>
                ) : null}
                {m.content && <span>{m.content}</span>}
                {m.role === 'assistant' && m.content && (
                  <div style={{ marginTop: 6 }}><AudioButton text={m.content} label="🔊" small showTextOnFail={false} /></div>
                )}
              </div>
            );
          })}
          {thinking && <div className="msg ai">✏️ …</div>}
        </div>

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
            {attachments.map((src, k) => (
              <div key={k} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="attachment" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ink)' }} />
                <button onClick={() => setAttachments((a) => a.filter((_, j) => j !== k))} title="Remove" style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1.5px solid var(--ink)', borderRadius: '50%', width: 18, height: 18, lineHeight: 1, cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="chat-input-row">
          <button className="btn small ghost" title="Attach images" onClick={pickFiles} style={{ padding: '0 10px' }}>📎</button>
          <textarea id="chat-input" placeholder="Tell me what you want to learn… I'll help you build a lesson or repo (or tap 🎤 / 📎)"
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <MicButton lang="en-US" title="Speak your message" onText={(t: string) => setInput((v) => (v ? v + ' ' : '') + t)} />
          <button className="btn primary" id="chat-send" onClick={send}>Send</button>
        </div>
        <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          <button className="btn small green" disabled={building} onClick={buildTool}>{building ? '🧰 Building…' : '🧰 Build a tool from this chat'}</button>
          <button className="btn small ghost" id="chat-clear" onClick={clear}>Clear chat</button>
        </div>
      </div>
    </>
  );
}
