'use client';
/* Coach chat — a conversational builder with saved history. Each visit opens a
 * FRESH chat; a left sidebar lists past chats so you can reopen them. You chat
 * about what you want to learn; the coach's job is to gather enough to recommend
 * (and build) a slide tool or repo. "🧰 Build from this chat" turns the
 * conversation into a real tool (spending credits) and drops a sticky note with a
 * button to open/play it. "🎨 Draw" generates an AI image inline, attributed to
 * whichever model made it. You can also attach images to your messages. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState, initialCoachGreeting } from '@/lib/app-state';
import { downloadCsv } from '@/lib/util';
import { AudioButton } from '@/components/ui/AudioButton';
import { MicButton } from '@/components/ui/MicButton';
import { useApp } from '@/components/AppContext';
import { estimateLessonTokens } from '@/lib/cost-estimate';
import { PAGE_HEADERS } from '@/lib/page-settings';
import { loadLikes } from '@/lib/tool-likes';
import {
  type ChatMsg, type ChatSession,
  newSessionId, loadSessions, saveSession, deleteSession, relTime, hasContent,
} from '@/lib/chat-history';

export function ChatView() {
  const app = useApp();
  const username = app.user?.username || null;
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const [messages, setMessages] = useState<ChatMsg[]>([initialCoachGreeting as ChatMsg]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);   // recommend only free (premade) tools
  const [attachments, setAttachments] = useState<string[]>([]);   // data URLs
  const [balance, setBalance] = useState<number | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [expanded, setExpanded] = useState(false);   // history "read more/less"
  const [coach, setCoach] = useState<{ emoji: string; title: string; subtitle: string }>(() => {
    const d = PAGE_HEADERS.coach;
    return { emoji: d.defaultEmoji, title: String(d.defaultTitle).replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '') || d.defaultTitle, subtitle: d.defaultSubtitle };
  });
  const logRef = useRef<HTMLDivElement>(null);
  const COLLAPSED_COUNT = 6;

  // The Coach identity (emoji/title/subtitle) now lives at the BOTTOM of the
  // sidebar instead of a tall page header. Read the editable copy from the DB.
  useEffect(() => {
    API.get('/api/site-settings').then((r: any) => {
      const s = r?.settings || {}; const d = PAGE_HEADERS.coach;
      const title = s[d.titleKey] || d.defaultTitle;
      setCoach({
        emoji: s[d.emojiKey] || d.defaultEmoji,
        title: String(title).replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '') || title,
        subtitle: s[d.subtitleKey] || d.defaultSubtitle,
      });
    }).catch(() => { /* keep defaults */ });
  }, []);

  // On every visit: start a brand-new chat. The previously active chat was saved
  // live into history as it was typed, so it's already listed in the sidebar.
  useEffect(() => {
    const fresh = [initialCoachGreeting as ChatMsg];
    setMessages(fresh); setSessionId(newSessionId()); appState.chat = fresh;
    setSessions(loadSessions(username));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => { appState.chat = messages; }, [messages]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, thinking, building, drawing]);

  // Persist the active chat into history whenever it gains content, so the sidebar
  // stays live and the chat survives navigating away.
  useEffect(() => {
    if (!hasContent(messages)) return;
    setSessions(saveSession(username, { id: sessionId, ts: Date.now(), title: '', messages }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const [tokenRole, setTokenRole] = useState<string>('');
  const loadBalance = () => {
    if (!app.user) { setBalance(null); setTokenRole(''); return; }
    API.get('/api/tokens').then((t: any) => { setBalance(typeof t?.balance === 'number' ? t.balance : null); setTokenRole(String(t?.role || '')); }).catch(() => { /* ignore */ });
  };
  useEffect(() => { loadBalance(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [app.user?.username]);

  const newChat = () => {
    const fresh = [initialCoachGreeting as ChatMsg];
    setMessages(fresh); setSessionId(newSessionId()); appState.chat = fresh;
    setInput(''); setAttachments([]);
  };
  const openSession = (s: ChatSession) => {
    setMessages(s.messages); setSessionId(s.id); appState.chat = s.messages;
    setInput(''); setAttachments([]);
  };
  const removeSession = (id: string) => {
    setSessions(deleteSession(username, id));
    if (id === sessionId) newChat();
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).slice(0, 6).forEach((f) => {
      if (!f.type.startsWith('image/') || f.size > 4_000_000) return;
      const rd = new FileReader(); rd.onload = () => setAttachments((a) => [...a, String(rd.result || '')]); rd.readAsDataURL(f);
    });
  };
  const pickFiles = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.onchange = () => addFiles(inp.files); inp.click(); };

  // Free chat mode: guests, anyone with the 🆓 toggle on, or a non-admin who has run
  // out of credits. In this mode we NEVER call the paid AI chat — every message just
  // gets a canned line + a random tool recommendation, so there's zero token spend.
  const noCredits = tokenRole !== 'admin' && typeof balance === 'number' && balance <= 0;
  const freeMode = !app.user || freeOnly || noCredits;

  const FREE_LINES = ['Here’s something to try:', 'You might like this:', 'A pick for you:', 'Try this one:', 'How about this:'];

  const freeReply = async (next: ChatMsg[], topic: string) => {
    setThinking(true);
    try {
      const r: any = await API.post('/api/tools/recommend', { query: topic, free: freeOnly, limit: 1, noai: true, random: true });
      const p = (Array.isArray(r?.picks) ? r.picks : [])[0];
      const nudge = (noCredits && !freeOnly) ? ' (You’re out of credits — turn on 🆓 Free only for free-to-play picks.)' : '';
      if (!p) {
        setMessages([...next, { role: 'assistant', content: 'Nothing to recommend yet — browse the Slides or Repos page.' + nudge }]);
      } else {
        setMessages([...next,
          { role: 'assistant', content: FREE_LINES[Math.floor(Math.random() * FREE_LINES.length)] + nudge },
          { role: 'assistant', content: '', sticky: {
            slug: p.slug, title: p.title || 'Tool', kind: p.archetype === 'repo' ? 'repo' : 'lesson',
            runCost: p.free ? 0 : (p.archetype === 'lesson' ? estimateLessonTokens({ slides: 5 }) : 0),
            reason: p.reason || '', recommended: true, free: !!p.free,
          } }]);
      }
    } catch (e: any) { setMessages([...next, { role: 'assistant', content: `(Could not fetch a recommendation: ${e.message})` }]); }
    setThinking(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text && !attachments.length) return;
    setInput('');
    const imgs = attachments; setAttachments([]);
    const userMsg: ChatMsg = { role: 'user', content: text || '(shared an image)', ...(imgs.length ? { images: imgs } : {}) };
    const next = [...messages, userMsg];
    setMessages(next);
    // No AI call for free-mode users — recommend a tool instead (zero token spend).
    if (freeMode) { await freeReply(next, text); return; }
    setThinking(true);
    try {
      const r = await API.post('/api/ai/chat', {
        messages: next.filter((m) => !m.sticky && !m.building).map((m) => ({ role: m.role, content: m.content + (m.images?.length ? ` [attached ${m.images.length} image(s)]` : '') })),
        images: imgs,
        recentChats: sessions.filter((s) => s.id !== sessionId).slice(0, 12).map((s) => s.title).filter(Boolean),
      });
      setMessages([...next, { role: 'assistant', content: r.reply }]);
    } catch (e: any) { setMessages([...next, { role: 'assistant', content: `(The coach dropped their pencil: ${e.message})` }]); }
    setThinking(false); loadBalance();
  };

  // Generate an AI image straight from the chat, attributed to the model that made it.
  const drawImage = async () => {
    if (!app.user) { app.requireLogin(); return; }
    const idea = input.trim();
    if (!idea || drawing) return;
    setInput('');
    const next = [...messages, { role: 'user', content: `🎨 Draw: ${idea}` } as ChatMsg];
    setMessages(next); setDrawing(true);
    try {
      const r: any = await API.post('/api/ai/coach-image', { prompt: idea });
      if (r?.url) setMessages([...next, { role: 'assistant', content: '', images: [r.url], imageCredit: r.providerLabel || r.provider || 'AI' }]);
      else setMessages([...next, { role: 'assistant', content: r?.error || 'Could not draw that — try again.' }]);
    } catch (e: any) { setMessages([...next, { role: 'assistant', content: `(Could not draw that: ${e.message})` }]); }
    setDrawing(false); loadBalance();
  };

  // Turn the conversation into a real tool: build a proposal, publish it, drop a
  // sticky note with a link. Auto-answers any builder questions so it reaches a
  // proposal from the chat.
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

  // Recommend an EXISTING repo/slide tool to play, based on the conversation topic,
  // and drop it into the chat as a sticky note (with an Open/Play button). This is
  // the "select a run to play" path — no credits spent to recommend.
  const recommend = async () => {
    if (recommending) return;
    const topic = messages.filter((m) => m.role === 'user' && m.content).slice(-4).map((m) => m.content).join(' ').slice(0, 400);
    setRecommending(true);
    try {
      const r: any = await API.post('/api/tools/recommend', { query: topic, favs: loadLikes ? Object.keys(loadLikes() || {}).join(',') : '', limit: 1, free: freeOnly });
      const p = (Array.isArray(r?.picks) ? r.picks : [])[0];
      if (!p) {
        setMessages((m) => [...m, { role: 'assistant', content: freeOnly ? 'No free premade tool matches that yet. Turn off “Free only”, or press “🧰 Build a tool from this chat”.' : 'No matching presentation or repo yet. Press “🧰 Build a tool from this chat” to make one.' }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: '', sticky: {
          slug: p.slug, title: p.title || 'Tool', kind: p.archetype === 'repo' ? 'repo' : 'lesson',
          runCost: p.free ? 0 : (p.archetype === 'lesson' ? estimateLessonTokens({ slides: 5 }) : 0),
          reason: p.reason || '', recommended: true, free: !!p.free,
        } }]);
      }
    } catch (e: any) { setMessages((m) => [...m, { role: 'assistant', content: `(Could not fetch a recommendation: ${e.message})` }]); }
    setRecommending(false);
  };

  const visibleSessions = expanded ? sessions : sessions.slice(0, COLLAPSED_COUNT);

  return (
    <>
      {/* A slim control strip replaces the tall page header (no more scrolling to
          reach the chat). The Coach identity moves to the bottom of the sidebar. */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '2px 0 8px' }}>
        <button className="btn small ghost" onClick={() => setSidebar((v) => !v)} title="Chat history">🗂 History</button>
        <button className="btn small green" onClick={newChat} title="Start a new chat">＋ New chat</button>
        <button className="btn small" id="chat-export" onClick={downloadCsv}>⬇ spreadsheet</button>
        {app.user && (tokenRole === 'admin'
          ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green,#7fb069)' }}>🎟 Unlimited</span>
          : <span style={{ fontSize: 13, fontWeight: 700, color: (balance ?? 0) > 0 ? 'var(--green,#7fb069)' : 'var(--danger,#e4572e)' }}>🎟 {balance == null ? '…' : balance.toLocaleString()} credits</span>)}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', height: 'calc(100vh - 150px)', minHeight: 420 }}>
        {sidebar && (
          <aside style={{ flex: '0 0 210px', maxWidth: 210, borderRight: '2px dashed var(--line,#d9cfc0)', paddingRight: 10, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <button className="btn small green" onClick={newChat} style={{ width: '100%', marginBottom: 8 }}>＋ New chat</button>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted,#8a7f70)', margin: '2px 0 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Chat history</div>

            {/* The history list scrolls in its own window and, when it fills up,
                offers read-more/less — so it never overlaps the Coach identity
                pinned at the bottom of the sidebar. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sessions.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted,#8a7f70)' }}>No past chats yet. Say something and it’ll show up here.</p>}
              {visibleSessions.map((s) => (
                <div key={s.id} className={s.id === sessionId ? 'card' : ''}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: s.id === sessionId ? 'var(--card,#fff8ee)' : 'transparent', border: s.id === sessionId ? '1.5px solid var(--ink)' : '1.5px solid transparent' }}
                  onClick={() => openSession(s)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title || 'New chat'}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted,#8a7f70)' }}>{relTime(s.ts)}</div>
                  </div>
                  <button title="Delete chat" onClick={(e) => { e.stopPropagation(); removeSession(s.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted,#8a7f70)', padding: 2 }}>✕</button>
                </div>
              ))}
              {sessions.length > COLLAPSED_COUNT && (
                <button className="btn small ghost" onClick={() => setExpanded((v) => !v)} style={{ alignSelf: 'flex-start', marginTop: 2, fontSize: 12 }}>
                  {expanded ? '▲ Read less' : `▼ Read more (${sessions.length - COLLAPSED_COUNT})`}
                </button>
              )}
            </div>

            {/* Coach identity — pinned at the bottom of the side navigation. */}
            <div style={{ borderTop: '2px dashed var(--line,#d9cfc0)', marginTop: 8, paddingTop: 10, textAlign: 'center', flex: '0 0 auto' }}>
              <div style={{ fontSize: 26, lineHeight: 1 }}>{coach.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{coach.title}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted,#8a7f70)', marginTop: 2 }}>{coach.subtitle}</div>
            </div>
          </aside>
        )}

        <div className="chat-shell" style={{ flex: 1, minWidth: 0, height: '100%', maxWidth: 'none' }}>
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
              if (m.sticky) {
                // Just the taped sticky note — no chat-bubble background. Recommended =
                // green, a built slide tool = blue, a built repo = orange.
                const color = m.sticky.recommended ? 'sticky-green' : m.sticky.kind === 'repo' ? 'sticky-orange' : 'sticky-blue';
                return (
                  <div key={i} style={{ marginRight: 'auto', marginBottom: 14, maxWidth: 320 }}>
                    <div className={`slide-comp comp-sticky ${color}`} style={{ transform: 'rotate(-1deg)', marginBottom: 0 }}>
                      <b className="sticky-title" style={{ display: 'block' }}>{m.sticky.recommended ? '⭐ ' : '🧰 '}{m.sticky.kind === 'repo' ? '📁' : '🎬'} {m.sticky.title}</b>
                      {m.sticky.reason && <p style={{ margin: '3px 0 0', fontSize: 12, fontStyle: 'italic', opacity: 0.8 }}>{m.sticky.reason}</p>}
                      <p style={{ margin: '4px 0 8px', fontSize: 13 }}>{m.sticky.recommended ? 'Recommended' : 'Built'} — {m.sticky.kind === 'repo' ? 'open the pathway' : 'play it'}.{m.sticky.free ? ' 🆓 Free to play.' : m.sticky.runCost ? ` ≈ ${m.sticky.runCost.toLocaleString()} credits to run.` : ''}</p>
                      <button className="btn small green" onClick={() => openTool(m.sticky!.slug)}>{m.sticky.kind === 'repo' ? 'Open →' : '▶ Open & play'}</button>
                    </div>
                  </div>
                );
              }
              // A generated image: show the picture + attribution alone, no bubble.
              if (m.imageCredit && m.images?.length) return (
                <div key={i} style={{ marginRight: 'auto', marginBottom: 12, maxWidth: 240 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.images[0]} alt="generated" style={{ width: '100%', borderRadius: 8, border: '2px solid var(--ink)' }} />
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted,#8a7f70)' }}>🎨 Generated by {m.imageCredit}</div>
                </div>
              );
              return (
                <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                  {m.images?.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: m.content ? 6 : 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.images.map((src, k) => <img key={k} src={src} alt="attachment" style={{ maxWidth: 220, width: '100%', borderRadius: 8, border: '2px solid var(--ink)' }} />)}
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
            {drawing && <div className="msg ai"><span className="sl-pencil" style={{ fontSize: 22, color: 'var(--ink)' }} aria-hidden><span className="sl-pencil__line" /><span className="sl-pencil__tip">✏️</span></span> sketching your image…</div>}
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
            <textarea id="chat-input" placeholder="Tell me what you want to learn… I'll help you build a lesson or repo (or tap 🎤 / 📎 / 🎨)"
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <MicButton lang="en-US" title="Speak your message" onText={(t: string) => setInput((v) => (v ? v + ' ' : '') + t)} />
            <button className="btn primary" id="chat-send" onClick={send}>Send</button>
          </div>
          {freeMode && (
            <div style={{ fontSize: 11, color: 'var(--muted,#8a7f70)', marginTop: 4 }}>
              {!app.user ? 'Free mode (guest): messages recommend a tool to play — no AI, no cost. Sign in to chat with the coach and build.'
                : noCredits && !freeOnly ? 'You’re out of credits, so messages recommend tools instead of using the AI. Add credits, or turn on 🆓 Free only.'
                : 'Free mode: messages recommend a random tool — no AI is used, so nothing is charged.'}
            </div>
          )}
          <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small green" disabled={building} onClick={buildTool}>{building ? '🧰 Building…' : '🧰 Build a tool from this chat'}</button>
            <button className="btn small" disabled={recommending} onClick={recommend} title="Recommend an existing presentation or repo to play">{recommending ? '⭐ Finding…' : '⭐ Recommend a run to play'}</button>
            <button className={`btn small ${freeOnly ? 'green' : 'ghost'}`} aria-pressed={freeOnly} onClick={() => setFreeOnly((v) => !v)} title="When on: no AI is called (no token cost) — every message just recommends a free premade tool">{freeOnly ? '🆓 Free only: ON' : '🆓 Free only: off'}</button>
            <button className="btn small" disabled={drawing} onClick={drawImage} title="Generate an AI image from the text box">{drawing ? '🎨 Drawing…' : '🎨 Draw an image'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
