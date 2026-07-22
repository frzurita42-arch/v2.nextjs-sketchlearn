'use client';
/* Coach chat — a conversational builder with saved history. Each visit opens a
 * FRESH chat; a left sidebar lists past chats so you can reopen them. You chat
 * about what you want to learn; the coach's job is to gather enough to recommend
 * (and build) a slide tool or repo. "🧰 Build from this chat" turns the
 * conversation into a real tool (spending credits) and drops a sticky note with a
 * button to open/play it. "🎨 Draw" generates an AI image inline, attributed to
 * whichever model made it. You can also attach images to your messages. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { API } from '@/lib/api';
import { appState, initialCoachGreeting } from '@/lib/app-state';
import { CoachRail } from '@/components/coach/CoachRail';
import { PromptSettingsModal } from '@/components/coach/PromptSettingsModal';
import { usePromptSettings, loadPromptSettings, ICON_PX } from '@/lib/prompt-settings';
import { useDictation } from '@/lib/use-dictation';
import { AudioButton } from '@/components/ui/AudioButton';
import { useApp } from '@/components/AppContext';
import { estimateLessonTokens } from '@/lib/cost-estimate';
import { loadLikes } from '@/lib/tool-likes';
import {
  type ChatMsg, type ChatSession, type Sticky,
  newSessionId, loadSessions, saveSession, deleteSession, hasContent,
} from '@/lib/chat-history';

// Pages the coach can point the learner to via a [[page:xxx]] marker in its reply.
const PAGE_STICKIES: Record<string, { view: string; emoji: string; title: string; desc: string }> = {
  slides: { view: 'slides', emoji: '🎞️', title: 'Slides', desc: 'Browse & play presentations' },
  repos: { view: 'tools', emoji: '📁', title: 'Repos', desc: 'Explore repositories & pathways' },
  tools: { view: 'tools', emoji: '📁', title: 'Repos', desc: 'Explore repositories & pathways' },
  feed: { view: 'feed', emoji: '📖', title: 'Lesson feed', desc: 'Read & review published lesson runs' },
  moderators: { view: 'moderators', emoji: '🛡️', title: 'Moderators', desc: 'Meet the moderators' },
  dashboard: { view: 'dashboard', emoji: '🧑‍🏫', title: 'Dashboard', desc: 'Your tokens & work' },
};
// Bare emoji toolbar buttons: no card/background — just the glyph. A toggle button
// shows a green line along its bottom edge when it's active (`on`), so all buttons
// keep a transparent 3px bottom border to stay vertically aligned.
const EMOJI_BTN: CSSProperties = { background: 'none', border: 'none', borderBottom: '3px solid transparent', cursor: 'pointer', fontSize: 'inherit', lineHeight: 1, padding: '3px 6px', borderRadius: 4, color: 'inherit' };
const emojiBtn = (on = false): CSSProperties => (on ? { ...EMOJI_BTN, borderBottomColor: 'var(--green,#7fb069)' } : EMOJI_BTN);
// Round icon button for the "Create a repo"-style composer (＋ attach, ⚙️ settings, ↑ send).
const composerCircle: CSSProperties = {
  width: 34, height: 34, borderRadius: '50%', border: '2.5px solid var(--ink,#2d2a26)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, lineHeight: 1, cursor: 'pointer', flex: '0 0 auto', padding: 0, background: 'transparent', color: 'var(--ink,#2d2a26)',
};

// The four places the welcome message points a fresh visitor to — each is a
// self-describing page sticky (its own view/emoji/title + a free/paid tag), so
// it does not depend on a unique PAGE_STICKIES key.
const WELCOME_PAGES: { page: string; view: string; emoji: string; title: string; desc: string; access: 'free' | 'paid' }[] = [
  { page: 'repos', view: 'tools', emoji: '📁', title: 'Repos', desc: 'Explore learning repositories & pathways', access: 'free' },
  { page: 'slides', view: 'slides', emoji: '🎞️', title: 'Slide Tool', desc: 'Browse & build slide presentations', access: 'free' },
  { page: 'runs', view: 'slides', emoji: '▶️', title: 'Presentation runs', desc: 'Play a full presentation run', access: 'paid' },
  { page: 'feed', view: 'feed', emoji: '📖', title: 'Lesson feed review', desc: 'Read & review published lesson runs', access: 'free' },
];
// Pull [[page:xxx]] markers out of an assistant reply.
function splitPageMarkers(reply: string): { text: string; pages: string[] } {
  const pages: string[] = [];
  const text = String(reply || '')
    .replace(/\[\[\s*page\s*:\s*(slides|repos|tools|moderators|dashboard)\s*\]\]/gi, (_m, p) => { const k = String(p).toLowerCase(); if (PAGE_STICKIES[k]) pages.push(k); return ''; })
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, pages: Array.from(new Set(pages)) };
}
// Turn a reply into a text message (attributed to the model that wrote it) + any
// page sticky notes it asked for.
function replyToMessages(reply: string, provider?: string): ChatMsg[] {
  const { text, pages } = splitPageMarkers(reply);
  const credit = provider ? { textCredit: provider } : {};
  const out: ChatMsg[] = [];
  if (text) out.push({ role: 'assistant', content: text, ...credit });
  pages.forEach((p) => out.push({ role: 'assistant', content: '', sticky: { slug: '', kind: 'page', page: p, title: PAGE_STICKIES[p].title, runCost: 0, recommended: true, reason: PAGE_STICKIES[p].desc } }));
  if (!out.length) out.push({ role: 'assistant', content: reply, ...credit });
  return out;
}

// Turn a chat message into what the AI should SEE. A normal message passes its text;
// a sticky (a recommended video / tool / page) becomes a short note so the coach
// REMEMBERS what it already offered and can answer follow-ups like "what was that
// video about?". Attachments are noted too. This is how the chat gets its memory.
function stickySummary(s: Sticky): string {
  if (!s) return '';
  if (s.kind === 'video') return `[Earlier I recommended a YouTube video — "${s.title}"${s.channel ? ` by ${s.channel}` : ''}${s.desc ? `. It is about: ${s.desc}` : ''}${s.url ? ` (${s.url})` : ''}.]`;
  if (s.kind === 'page') return `[I suggested the ${s.title} page.]`;
  const kind = s.kind === 'repo' ? 'repo pathway' : 'slide presentation';
  return `[I ${s.recommended ? 'recommended' : 'built'} a ${kind} — "${s.title}"${s.reason ? `: ${s.reason}` : ''}.]`;
}
function msgToAI(m: ChatMsg): { role: 'user' | 'assistant'; content: string } {
  const role = m.role === 'assistant' ? 'assistant' : 'user';
  let content = (m.content || '').trim();
  if (m.sticky) content = (content ? content + ' ' : '') + stickySummary(m.sticky);
  if (m.images?.length) content += `${content ? ' ' : ''}[attached ${m.images.length} image(s)]`;
  return { role, content: content || '(no text)' };
}

export function ChatView() {
  const app = useApp();
  const username = app.user?.username || null;
  // A brand-new chat starts every time the Coach page loads (the previous one is
  // saved to history as it was typed).
  const [sessionId, setSessionId] = useState<string>(() => newSessionId());
  const [messages, setMessages] = useState<ChatMsg[]>([initialCoachGreeting as ChatMsg]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recVideos, setRecVideos] = useState(false);   // fetching YouTube videos
  const [youtubeOn, setYoutubeOn] = useState(false);   // YOUTUBE_API_KEY configured?
  const [promptOpen, setPromptOpen] = useState(false); // ChatBot settings modal
  const [prompt] = usePromptSettings();                // behavior settings (live)
  const iconPx = ICON_PX[prompt.toolbarIcon] ?? 18;    // chat toolbar icon size
  const [freeOnly, setFreeOnly] = useState(false);   // recommend only free (premade) tools
  const [attachments, setAttachments] = useState<string[]>([]);   // data URLs
  const [balance, setBalance] = useState<number | null>(null);
  // 🎤 dictation (ElevenLabs speech-to-text): append the transcript to the input.
  const { voiceOn, recording, transcribing, toggleMic } = useDictation(
    (t) => setInput((v) => (v ? v.trimEnd() + ' ' : '') + t),
    (m) => setMessages((cur) => [...cur, { role: 'assistant', content: `(Could not transcribe: ${m})` }]),
  );
  const logRef = useRef<HTMLDivElement>(null);

  // Debounced push of the whole history to the DB (signed-in users only — guests
  // keep their chats in the browser, never the server).
  const dbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushToDb = (next: ChatSession[]) => {
    if (!username) return;
    if (dbTimer.current) clearTimeout(dbTimer.current);
    dbTimer.current = setTimeout(() => { API.put('/api/coach-chats', { sessions: next }).catch(() => { /* stays in local cache */ }); }, 900);
  };

  // On every visit: start a brand-new chat. The previously active chat was saved
  // live into history as it was typed. Signed-in users load their history from the
  // DB (so it follows them across devices); guests use the browser cache only.
  // After the greeting, drop ONE page sticky note pointing the visitor at a place
  // to explore — a different one is picked at random on each page load, rotating
  // through Repos (free), the Slide Tool (free), Presentation runs (paid) and the
  // Lesson feed review (free). Static navigation card — no AI cost — appended only
  // while the chat is still untouched.
  // Build a welcome page sticky (with a 🔄 refresh to cycle to another suggestion).
  // A paid page (Presentation runs) shows the estimated tokens a typical run costs.
  const makeWelcomeSticky = (w: typeof WELCOME_PAGES[number]): ChatMsg => ({
    role: 'assistant', content: '', sticky: {
      slug: '', kind: 'page', runCost: w.access === 'paid' ? estimateLessonTokens({ slides: 5 }) : 0,
      page: w.page, view: w.view, emoji: w.emoji, title: w.title, reason: w.desc, access: w.access, recommended: true, cycle: true,
    },
  });
  const welcomePages = () => {
    const w = WELCOME_PAGES[Math.floor(Math.random() * WELCOME_PAGES.length)];
    const sticky = makeWelcomeSticky(w);
    setMessages((cur) => (cur.length === 1 && !cur.some((x) => x.role === 'user') ? [...cur, sticky] : cur));
  };
  // 🔄 on a welcome card: replace THIS card with the next suggestion in the cycle.
  const refreshWelcome = (index: number, currentPage?: string) => {
    const idx = WELCOME_PAGES.findIndex((p) => p.page === currentPage);
    const next = WELCOME_PAGES[(idx + 1 + WELCOME_PAGES.length) % WELCOME_PAGES.length];
    setMessages((cur) => cur.map((m, i) => (i === index ? makeWelcomeSticky(next) : m)));
  };

  useEffect(() => {
    // Keep the working chat alive across navigation: if a session is already open
    // this visit (appState singleton survives view switches), restore it — WITH its
    // generated images — instead of wiping it. Only the very first load, or an
    // explicit "New chat", starts a fresh greeting + welcome card.
    if (appState.chatSessionId && Array.isArray(appState.chat) && appState.chat.length) {
      setMessages(appState.chat as ChatMsg[]);
      setSessionId(appState.chatSessionId);
    } else {
      const fresh = [initialCoachGreeting as ChatMsg];
      const id = newSessionId();
      setMessages(fresh); setSessionId(id);
      appState.chat = fresh; appState.chatSessionId = id;
      welcomePages();
    }
    // Signed-in users load their history from the DB; guests use the browser cache.
    if (username) {
      API.get('/api/coach-chats').then((r: any) => {
        const db = Array.isArray(r?.sessions) ? (r.sessions as ChatSession[]) : [];
        setSessions(db.length ? db : loadSessions(username));
      }).catch(() => setSessions(loadSessions(username)));
    } else {
      setSessions(loadSessions(username));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => { appState.chat = messages; }, [messages]);
  useEffect(() => { appState.chatSessionId = sessionId; }, [sessionId]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [messages, thinking, building, drawing]);

  // Persist the active chat into history whenever it gains content, so the sidebar
  // stays live and the chat survives navigating away. Mirror it to the DB too.
  useEffect(() => {
    if (!hasContent(messages)) return;
    const next = saveSession(username, { id: sessionId, ts: Date.now(), title: '', messages });
    setSessions(next);
    pushToDb(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);


  const [tokenRole, setTokenRole] = useState<string>('');
  const loadBalance = () => {
    if (!app.user) { setBalance(null); setTokenRole(''); return; }
    API.get('/api/tokens').then((t: any) => { setBalance(typeof t?.balance === 'number' ? t.balance : null); setTokenRole(String(t?.role || '')); }).catch(() => { /* ignore */ });
  };
  useEffect(() => { loadBalance(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [app.user?.username]);
  // Is the YouTube recommendation feature available (key configured)?
  useEffect(() => { API.get('/api/config').then((c: any) => setYoutubeOn(!!c?.youtubeEnabled)).catch(() => { /* leave off */ }); }, []);

  const newChat = () => {
    const fresh = [initialCoachGreeting as ChatMsg];
    const id = newSessionId();
    setMessages(fresh); setSessionId(id); appState.chat = fresh; appState.chatSessionId = id;
    setInput(''); setAttachments([]);
    welcomePages();
  };
  const openSession = (s: ChatSession) => {
    setMessages(s.messages); setSessionId(s.id); appState.chat = s.messages; appState.chatSessionId = s.id;
    setInput(''); setAttachments([]);
  };
  const removeSession = (id: string) => {
    const next = deleteSession(username, id);
    setSessions(next);
    pushToDb(next);
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
    // Natural-language "recommend YouTube videos on X" → embed real videos inline.
    // Free (no token spend), so it runs for guests and out-of-credit users too.
    if (!imgs.length) {
      const vTopic = videoRequestTopic(text);
      if (vTopic) { await fetchVideosInto(next, vTopic); return; }
    }
    // Free-mode users (guests, 🆓 toggle, or out of credits) never spend credits: a
    // signed-in user gets a reply from a FREE OpenRouter model when one is configured,
    // otherwise (and for guests) we fall back to a no-AI tool recommendation.
    if (freeMode) {
      if (app.user) {
        setThinking(true);
        try {
          const r: any = await API.post('/api/ai/chat', {
            messages: next.filter((m) => !m.building).map(msgToAI),
            recentChats: sessions.filter((s) => s.id !== sessionId).slice(0, 12).map((s) => s.title).filter(Boolean),
            free: true, promptSettings: loadPromptSettings(),
          });
          if (r?.reply) { setMessages([...next, ...replyToMessages(r.reply, r.provider)]); setThinking(false); return; }
        } catch { /* fall through to recommendation */ }
        setThinking(false);
      }
      await freeReply(next, text);
      return;
    }
    setThinking(true);
    try {
      const r = await API.post('/api/ai/chat', {
        messages: next.filter((m) => !m.building).map(msgToAI),
        images: imgs,
        recentChats: sessions.filter((s) => s.id !== sessionId).slice(0, 12).map((s) => s.title).filter(Boolean),
        promptSettings: loadPromptSettings(),
      });
      setMessages([...next, ...replyToMessages(r.reply, r.provider)]);
    } catch (e: any) { setMessages([...next, { role: 'assistant', content: `(The coach dropped their pencil: ${e.message})` }]); }
    setThinking(false); loadBalance();
  };

  // 🎨 = the coach draws its OWN read of the conversation so far as a whimsical
  // anthropomorphic scene, framed as a Polaroid keepsake. No typed prompt needed;
  // anything in the box is passed along as extra direction. Attributed to the
  // model that made it.
  const drawImage = async () => {
    if (!app.user) { app.requireLogin(); return; }
    if (drawing) return;
    const idea = input.trim();
    // Roll up the visible transcript (skip stickies/placeholders) for the coach to
    // interpret; keep the tail so the most recent turns dominate.
    const convo = messages
      .filter((m) => m.content && !m.sticky && !m.building)
      .map((m) => `${m.role === 'user' ? 'Learner' : 'Coach'}: ${m.content}`)
      .join('\n').slice(-1500);
    const caption = idea ? (idea.length > 40 ? idea.slice(0, 40) + '…' : idea) : 'our chat, so far 🐾';
    setInput('');
    const next = [...messages, { role: 'user', content: idea ? `🎨 Draw: ${idea}` : '🎨 Draw our chat so far' } as ChatMsg];
    setMessages(next); setDrawing(true);
    try {
      const r: any = await API.post('/api/ai/coach-image', { prompt: idea, convo, mode: 'interpret' });
      if (r?.url) setMessages([...next, { role: 'assistant', content: '', images: [r.url], imageCredit: r.providerLabel || r.provider || 'AI', polaroid: true, caption }]);
      else setMessages([...next, { role: 'assistant', content: r?.error || 'Could not draw that — try again.' }]);
    } catch (e: any) { setMessages([...next, { role: 'assistant', content: `(Could not draw that: ${e.message})` }]); }
    setDrawing(false); loadBalance();
  };

  // Turn the conversation into a real tool: build a proposal, publish it, drop a
  // sticky note with a link. Auto-answers any builder questions so it reaches a
  // proposal from the chat.
  const buildTool = async () => {
    if (!app.user) { app.requireLogin(); return; }
    // No generating presentations/repos without credits — building spends them.
    if (noCredits) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Building a tool needs credits. Add credits on the dashboard, or press ⭐ Recommend a run to play (free).' }]);
      return;
    }
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
  // Navigate to a whole PAGE the coach recommended (Slides / Repos / Moderators /
  // Dashboard). The chat stays open, so the learner can come back and continue.
  // A page sticky may carry its own target view (the welcome cards do); fall back
  // to the PAGE_STICKIES lookup for coach-generated [[page:xxx]] markers.
  const openPage = (s: Sticky) => { const view = s.view || PAGE_STICKIES[s.page || '']?.view; if (view) app.nav(view as never); };

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

  // Fetch real, embeddable YouTube videos (Gemini + Google Search grounding) for a
  // learning topic and append them to `base` as red "video" stickies whose player
  // embeds right in the chat. Free — no token debit. Shared by the 📺 button and
  // the natural-language "recommend videos" path.
  const fetchVideosInto = async (base: ChatMsg[], topic: string) => {
    setRecVideos(true);
    try {
      const r: any = await API.post('/api/tools/youtube', { query: topic, limit: 4 });
      const vids: any[] = Array.isArray(r?.videos) ? r.videos : [];
      if (!vids.length) {
        setMessages([...base, { role: 'assistant', content: r?.error || 'No videos found for that — try rephrasing the topic.' }]);
      } else {
        const intro: ChatMsg = { role: 'assistant', content: `Here ${vids.length === 1 ? 'is a video' : 'are some videos'} to learn about that — play them right here:` };
        const stickies: ChatMsg[] = vids.map((v) => ({ role: 'assistant', content: '', sticky: {
          slug: v.videoId, kind: 'video', runCost: 0, title: v.title, channel: v.channel, thumb: v.thumb, url: v.url, embed: v.embed, reason: v.channel, desc: v.desc, free: true,
        } }));
        setMessages([...base, intro, ...stickies]);
      }
    } catch (e: any) { setMessages([...base, { role: 'assistant', content: `(Could not fetch videos: ${e.message})` }]); }
    setRecVideos(false);
  };

  // 📺 button: recommend videos for the typed text (else the last few asks).
  const recommendVideos = async () => {
    if (recVideos) return;
    const typed = input.trim();
    const topic = (typed || messages.filter((m) => m.role === 'user' && m.content).slice(-3).map((m) => m.content).join(' ')).slice(0, 200);
    if (!topic) { setMessages((m) => [...m, { role: 'assistant', content: 'Tell me what you want to learn first, then tap 📺 to find videos.' }]); return; }
    let base = messages;
    if (typed) { setInput(''); base = [...messages, { role: 'user', content: `📺 Videos: ${typed}` } as ChatMsg]; setMessages(base); }
    await fetchVideosInto(base, topic);
  };

  // Detect a natural-language "recommend YouTube videos on X" request and pull the
  // topic out of it. Returns the cleaned topic, or null if it isn't a video ask.
  const videoRequestTopic = (text: string): string | null => {
    if (!youtubeOn) return null;
    if (!/\b(you\s?tube|videos?|vids?)\b/i.test(text)) return null;
    if (!/\b(recommend|show|find|suggest|watch|search|play|got|give|any|some|list|share)\b/i.test(text)) return null;
    const topic = text
      .replace(/\b(please|can you|could you|would you|i (?:want|need)|i'?d like|i would like|recommend(?:ed)?|show me|show|find me|find|suggest|search for|search|watch|play|share|list|give me|got any|any|some|a few|me|for|on|about|regarding|related to|of|the|good|best|top|great|helpful|educational|learning|learn|to|youtube|videos?|vids?)\b/gi, ' ')
      .replace(/[?.!,]+/g, ' ').replace(/\s+/g, ' ').trim();
    return topic || text.slice(0, 200);
  };

  return (
    <>
      {/* Fills the fixed-viewport shell (see AppRoot). The shared CoachRail is the
          full-height side-nav; only the chat log scrolls — the page never does. */}
      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', justifyContent: 'center', height: '100%', width: '100%' }}>
        <CoachRail active={sessionId} sessions={sessions} onNewChat={newChat} onOpenSession={openSession} onDeleteSession={removeSession} />

        {/* The working column is centred in the area to the right of the rail (and
            re-centres when the rail collapses), bounded by two dashed vertical rules
            that separate the workstation from the background. */}
        <div className="chat-shell" style={{ width: '100%', maxWidth: 880, minWidth: 0, height: '100%', padding: '0 16px', boxSizing: 'border-box', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
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
              // A page sticky — points to a whole section of the site (chat stays open).
              // The welcome cards carry their own emoji/title/view + a free/paid tag;
              // coach [[page:xxx]] markers fall back to the PAGE_STICKIES lookup.
              if (m.sticky && m.sticky.kind === 'page') {
                const base = PAGE_STICKIES[m.sticky.page || ''] || { view: 'slides', emoji: '📄', title: m.sticky.title, desc: '' };
                const emoji = m.sticky.emoji || base.emoji;
                const title = m.sticky.title || base.title;
                const desc = m.sticky.reason || base.desc;
                const access = m.sticky.access;
                return (
                  <div key={i} style={{ marginRight: 'auto', marginBottom: 14, maxWidth: 320 }}>
                    <div className="slide-comp comp-sticky sticky-blue" style={{ position: 'relative', transform: 'rotate(-1deg)', marginBottom: 0 }}>
                      {m.sticky.cycle && (
                        <button title="Recommend another" aria-label="Recommend another"
                          onClick={() => refreshWelcome(i, m.sticky!.page)}
                          style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, color: 'var(--ink)' }}>🔄</button>
                      )}
                      <b className="sticky-title" style={{ display: 'block', paddingRight: m.sticky.cycle ? 22 : 0 }}>{emoji} {title}</b>
                      {access && (
                        <span style={{ display: 'inline-block', margin: '2px 0 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, padding: '1px 7px', borderRadius: 999, border: '1.5px solid var(--ink)', background: access === 'paid' ? 'rgba(255,138,76,0.18)' : 'rgba(102,187,106,0.2)' }}>
                          {access === 'paid'
                            ? `💳 Paid — ≈ ${(m.sticky.runCost || 0).toLocaleString()} tokens to run`
                            : '🆓 Free to view'}
                        </span>
                      )}
                      {desc && <p style={{ margin: '3px 0 8px', fontSize: 12.5 }}>{desc}. Come back to the chat anytime.</p>}
                      <button className="btn small green" onClick={() => openPage(m.sticky!)}>Open the {title} page →</button>
                    </div>
                  </div>
                );
              }
              // A recommended YouTube video — a red sticky with the player embedded
              // right in the chat so the learner never leaves the site. A small link
              // still opens it on YouTube if they prefer.
              if (m.sticky && m.sticky.kind === 'video') {
                const v = m.sticky;
                return (
                  <div key={i} style={{ marginRight: 'auto', marginBottom: 14, maxWidth: 340, width: '100%' }}>
                    <div className="slide-comp comp-sticky sticky-red" style={{ transform: 'rotate(-1deg)', marginBottom: 0 }}>
                      <b className="sticky-title" style={{ display: 'block' }}>📺 {v.title}</b>
                      {v.embed ? (
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', margin: '6px 0', borderRadius: 6, overflow: 'hidden', border: '1.5px solid var(--ink)', background: '#000' }}>
                          <iframe
                            src={v.embed}
                            title={v.title}
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            loading="lazy"
                          />
                        </div>
                      ) : v.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumb} alt="" style={{ display: 'block', width: '100%', borderRadius: 6, border: '1.5px solid var(--ink)', margin: '6px 0' }} />
                      ) : null}
                      {v.channel && <p style={{ margin: '2px 0 6px', fontSize: 12, fontStyle: 'italic', opacity: 0.8 }}>{v.channel}</p>}
                      <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: 'var(--muted,#8a7f70)' }}>Open on YouTube ↗</a>
                    </div>
                  </div>
                );
              }
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
              // Every AI-generated image in the chat comes framed as a Polaroid.
              if (m.imageCredit && m.images?.length) return (
                <div key={i} style={{ marginRight: 'auto', marginBottom: 14 }}>
                  <figure className="chat-polaroid" style={{ width: 212, padding: '9px 9px 24px', margin: 0, transform: 'rotate(-2deg)', background: '#fffef9', border: '1px solid rgba(0,0,0,.08)', boxShadow: '2px 4px 11px rgba(40,26,8,.26)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.images[0]} alt="generated" style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' }} />
                  </figure>
                  <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--muted,#8a7f70)', maxWidth: 212 }}>🎨 Generated by {m.imageCredit}</div>
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
                  {m.textCredit && <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--muted,#8a7f70)', fontStyle: 'italic' }}>generated by {m.textCredit}</div>}
                </div>
              );
            })}
            {thinking && <div className="msg ai">✏️ …</div>}
            {drawing && (
              <div className="msg ai" style={{ maxWidth: 220 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '20px 14px', minHeight: 120 }}>
                  <span className="sl-pencil" style={{ fontSize: 52, color: 'var(--ink)' }} aria-hidden><span className="sl-pencil__line" /><span className="sl-pencil__tip">✏️</span></span>
                  <span style={{ fontSize: 14 }}>sketching your image…</span>
                </div>
              </div>
            )}
          </div>

          {/* Composer — the "Create a repo"-style card: a dashed rounded box with the
              prompt, ＋ attach and ⚙️ settings on the left, and ↑ send on the right.
              (Per design, the build/recommend/draw/video/history/new-chat buttons were
              removed here; New chat & history live on the side rail, and the ⚙️ settings
              functionality is preserved.) The message log above is unchanged. */}
          <div style={{ margin: '6px 0 20px' }}>
            <div style={{
              border: '2.5px dashed var(--ink,#2d2a26)', borderRadius: 'var(--wobble-2, 16px)',
              background: 'var(--paper,#fbf7ee)', padding: '12px 14px 10px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* Attachment chips (the image content is carried into the chat). */}
              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {attachments.map((src, k) => (
                    <span key={k} style={{ position: 'relative', display: 'inline-flex' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="attachment" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ink)' }} />
                      <button onClick={() => setAttachments((a) => a.filter((_, j) => j !== k))} title="Remove" style={{ position: 'absolute', top: -6, right: -6, background: '#fff', border: '1.5px solid var(--ink)', borderRadius: '50%', width: 18, height: 18, lineHeight: 1, cursor: 'pointer', fontSize: 11 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}

              {/* The prompt — a borderless text box that blends into the dashed card. */}
              <textarea id="chat-input" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Tell me what you want to learn… I'll steer you to a game to play or a lesson to build"
                rows={2}
                style={{ border: 'none', background: 'transparent', boxShadow: 'none', outline: 'none', resize: 'vertical',
                  minHeight: 44, fontSize: 15, lineHeight: 1.35, padding: 0, width: '100%', fontFamily: 'inherit' }} />

              {/* Faint dotted rule separating the write area from the controls. */}
              <div style={{ borderTop: '1px dotted var(--ink,#2d2a26)', opacity: 0.18 }} />

              {/* Controls: ＋ attach + ⚙️ settings on the left, ↑ send on the right. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" title="Attach images" aria-label="Attach images" onClick={pickFiles}
                  style={{ ...composerCircle, width: 32, height: 32 }}>＋</button>
                <button type="button" title="ChatBot settings — tone, length, sticky-note publicity…" aria-label="Settings" onClick={() => setPromptOpen(true)}
                  style={{ ...composerCircle, width: 32, height: 32, fontSize: 15 }}>⚙️</button>
                <span style={{ fontSize: 12, opacity: 0.5, marginRight: 'auto' }}>{recording ? 'Recording… tap ⏹ to transcribe' : transcribing ? 'Transcribing your speech…' : 'Chat to get a recommendation or build a lesson'}</span>
                {/* Record + send grouped on the right, mic beside the green send button. */}
                {voiceOn && (
                  <button type="button" aria-label="Dictate" aria-pressed={recording} disabled={transcribing} onClick={toggleMic}
                    title={recording ? 'Stop & transcribe' : transcribing ? 'Transcribing…' : 'Dictate — speak instead of typing (ElevenLabs)'}
                    style={{ ...composerCircle, width: 32, height: 32, fontSize: 15,
                      ...(recording ? { background: 'var(--danger,#e4572e)', color: '#fff', borderColor: 'var(--danger,#e4572e)' } : null) }}>
                    {transcribing ? '⏳' : recording ? '⏹' : '🎤'}
                  </button>
                )}
                <button type="button" title="Send" aria-label="Send" id="chat-send" onClick={send}
                  style={{ ...composerCircle, background: 'var(--green,#7fb069)', color: '#fff', fontSize: 16 }}>↑</button>
              </div>
            </div>
            {freeMode && (
              <div style={{ fontSize: 11, color: 'var(--muted,#8a7f70)', marginTop: 6 }}>
                {!app.user ? 'Free mode (guest): messages recommend a tool to play — no cost. Sign in to build and generate.'
                  : noCredits && !freeOnly ? 'You’re out of credits: chat runs on a free model (or recommends a tool), and building/generating is paused until you add credits.'
                  : 'Free mode: no credits are spent — you’ll get a free-model reply or a tool recommendation. Building/generating still needs credits.'}
              </div>
            )}
          </div>
        </div>
      </div>
      {promptOpen && <PromptSettingsModal onClose={() => setPromptOpen(false)} />}
    </>
  );
}
