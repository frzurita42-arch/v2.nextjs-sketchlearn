'use client';
/* The Builder STUDIO — a visual, structured way to compose a tool, with a tab to
 * a short-question CHAT. Pick the artifact type (a slide Presentation OR a
 * Repository/collection). A presentation is built PAGE BY PAGE: add pages, and on
 * each page add MULTIPLE components (each becomes a bar with a "how to use it"
 * note) and set that page's paragraph length/count. The number of pages IS the
 * number of slides. Generation merges these settings WITH the chat history, so
 * either alone — or both together — works. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import {
  STUDIO_CATEGORIES, ANNOTATION_SIZES, LAYOUT_TEMPLATES, BUTTON_ACTIONS, parseTemplateSpec,
  studioItem, assembleDefinition, capAvailable,
  type StudioConfig, type StudioComponent, type StudioLayout, type StudioPage, type ArtifactKind,
} from '@/lib/studio-catalog';

type Msg = { role: 'assistant' | 'user'; content: string };
const newLayout = (): StudioLayout => ({ template: 'auto', components: [] });
const newPage = (): StudioPage => ({ layouts: [newLayout()], length: 'medium', paragraphs: 1 });

export function BuilderStudioView() {
  const app = useApp();
  const [tab, setTab] = useState<'studio' | 'chat'>('studio');
  const [caps, setCaps] = useState<any>(null);   // which integrations/keys are configured
  useEffect(() => { API.get('/api/config').then((c) => setCaps(c?.caps || {})).catch(() => setCaps({})); }, []);

  // ---- Studio config ----
  const [artifact, setArtifact] = useState<ArtifactKind>('presentation');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [tone, setTone] = useState('Friendly');
  const [display, setDisplay] = useState<'cards' | 'list' | 'table'>('cards');
  const [pages, setPages] = useState<StudioPage[]>([newPage()]);
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

  const presCats = STUDIO_CATEGORIES.filter((c) => c.for === 'presentation' || c.for === 'both');

  // ---- per-page / per-layout editing ----
  const setPage = (i: number, patch: Partial<StudioPage>) => setPages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPage = () => setPages((ps) => [...ps, newPage()]);
  const removePage = (i: number) => setPages((ps) => ps.length > 1 ? ps.filter((_, j) => j !== i) : ps);
  const layoutsOf = (p: StudioPage): StudioLayout[] => (p.layouts && p.layouts.length ? p.layouts : [{ template: p.template || 'auto', components: p.components || [] }]);
  const mapLayouts = (i: number, fn: (ls: StudioLayout[]) => StudioLayout[]) => setPages((ps) => ps.map((p, j) => (j === i ? { ...p, layouts: fn(layoutsOf(p)), components: undefined, template: undefined } : p)));
  const addLayout = (i: number) => mapLayouts(i, (ls) => [...ls, newLayout()]);
  const removeLayout = (i: number, li: number) => mapLayouts(i, (ls) => (ls.length > 1 ? ls.filter((_, k) => k !== li) : ls));
  const setLayout = (i: number, li: number, patch: Partial<StudioLayout>) => mapLayouts(i, (ls) => ls.map((l, k) => (k === li ? { ...l, ...patch } : l)));
  // The SAME component type can be added many times (two text blocks, etc.), so
  // each placement gets a unique uid and we never dedupe by catalog id.
  const mkUid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const addComp = (i: number, li: number, id: string) => { if (!id) return; const it = studioItem(id); const opt = it?.sizes ? ANNOTATION_SIZES[1] : it?.button ? 'ask' : undefined; mapLayouts(i, (ls) => ls.map((l, k) => (k === li ? { ...l, components: [...l.components, { id, uid: mkUid(), instr: '', opt }] } : l))); };
  const setComp = (i: number, li: number, uid: string, patch: Partial<StudioComponent>) => mapLayouts(i, (ls) => ls.map((l, k) => (k === li ? { ...l, components: l.components.map((c) => ((c.uid || c.id) === uid ? { ...c, ...patch } : c)) } : l)));
  const rmComp = (i: number, li: number, uid: string) => mapLayouts(i, (ls) => ls.map((l, k) => (k === li ? { ...l, components: l.components.filter((c) => (c.uid || c.id) !== uid) } : l)));

  const config = (): StudioConfig => artifact === 'presentation'
    ? { artifact, title, subject, tone, context, pages }
    : { artifact, title, subject, context, display };

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

  // A grouped component picker <select>. Gated items (no key/integration) are
  // shown but disabled with a hint. Kept narrow so it shares a row with delete.
  const picker = (cats: typeof presCats, disabledIds: string[], onPick: (id: string) => void, label: string) => (
    <select value="" onChange={(e) => { onPick(e.target.value); e.currentTarget.selectedIndex = 0; }} style={{ flex: '1 1 auto', minWidth: 0 }}>
      <option value="">{label}</option>
      {cats.map((cat) => (
        <optgroup key={cat.id} label={cat.label}>
          {cat.items.map((it) => {
            // Gated items (news/music/AI providers) can still be ADDED — they need
            // a key to fully work, so we only hint that, never block selection.
            const off = !capAvailable(caps || {}, it.requires);
            return <option key={it.id} value={it.id} disabled={disabledIds.includes(it.id)}>{it.emoji} {it.name}{off ? ' — needs a key' : ''}</option>;
          })}
        </optgroup>
      ))}
    </select>
  );

  const componentBar = (c: StudioComponent, patch: (p: Partial<StudioComponent>) => void, onRemove: () => void) => {
    const it = studioItem(c.id); if (!it) return null;
    return (
      <div key={c.uid || c.id} className="card alt" style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{it.emoji} {it.name}</div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>{it.desc}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {it.sizes && (
              <select value={c.opt || ANNOTATION_SIZES[1]} onChange={(e) => patch({ opt: e.target.value })} style={{ fontSize: 12 }}>
                {ANNOTATION_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {it.button && (
              <select value={c.opt || 'ask'} onChange={(e) => patch({ opt: e.target.value })} style={{ fontSize: 12 }}>
                {BUTTON_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            )}
            <input value={c.instr || ''}
              placeholder={it.tmpl ? 'e.g. 1x2(2x2)' : it.button ? 'Button label / message (e.g. “Ask about this”)' : it.deco ? 'Your message…' : it.note ? 'Your instruction for this slide…' : 'How should the AI use this? (optional)'}
              onChange={(e) => patch({ instr: e.target.value })} style={{ flex: '1 1 180px', fontSize: 13 }} />
            {it.linkField && <input value={c.link || ''} placeholder={it.deco ? 'Link (donation / YouTube / URL)' : 'Reference image URL / Drive link (optional)'} onChange={(e) => patch({ link: e.target.value })} style={{ flex: '1 1 180px', fontSize: 13 }} />}
            {it.button && (c.opt || 'ask') === 'action' && <input value={c.link || ''} placeholder="Link to open (optional)" onChange={(e) => patch({ link: e.target.value })} style={{ flex: '1 1 180px', fontSize: 13 }} />}
          </div>
          {it.tmpl && c.instr && (
            parseTemplateSpec(c.instr).ok
              ? <div style={{ fontSize: 11, color: '#2d6a4f', marginTop: 4 }}>✓ {parseTemplateSpec(c.instr).desc}</div>
              : <div style={{ fontSize: 11, color: 'var(--danger,#e4572e)', marginTop: 4 }}>Not a valid template — use rows×cols like 2x2, or nest like 1x2(2x2).</div>
          )}
        </div>
        <button className="btn small ghost" title="Remove" onClick={onRemove}>✕</button>
      </div>
    );
  };

  const gridCol = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 } as const;

  return (
    <>
      <h1 className="view-title">Build a <span className="scribble-underline">tool</span></h1>
      <p className="view-sub">Compose it visually, or chat — the two combine.{' '}
        <button className="btn small ghost" onClick={() => app.nav('tools')}>← Gallery</button></p>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
        <button className={`btn ${tab === 'studio' ? 'blue' : 'ghost'}`} onClick={() => setTab('studio')}>🧩 Studio</button>
        <button className={`btn ${tab === 'chat' ? 'blue' : 'ghost'}`} onClick={() => setTab('chat')}>💬 Chat</button>
      </div>

      {tab === 'studio' ? (
        <div style={{ maxWidth: 940, margin: '0 auto' }}>
          {/* Artifact type */}
          <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 8 }}>WHAT ARE YOU MAKING?</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {([['presentation', '📊 Presentation', 'A playable slide deck — one slide per page you design'], ['repository', '🗂️ Repository', 'A collection / gallery of posted items (no slides)']] as const).map(([k, name, d]) => (
                <button key={k} className={`btn ${artifact === k ? 'green' : 'ghost'}`} style={{ flex: '1 1 220px', textAlign: 'left', padding: '10px 12px' }} onClick={() => setArtifact(k)}>
                  <div style={{ fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{d}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Global settings */}
          <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 8 }}>OVERALL</div>
            <div style={gridCol}>
              <label className="field"><span>Title</span><input value={title} placeholder="Name your tool" onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="field"><span>{artifact === 'presentation' ? 'Subject / topic' : 'Collection name'}</span><input value={subject} placeholder={artifact === 'presentation' ? 'e.g. Trigonometry' : 'e.g. My sketchbook'} onChange={(e) => setSubject(e.target.value)} /></label>
              {artifact === 'presentation'
                ? <label className="field"><span>Tone</span><input value={tone} onChange={(e) => setTone(e.target.value)} /></label>
                : <label className="field"><span>Repository type</span><select value={display} onChange={(e) => setDisplay(e.target.value as any)}><option value="cards">Course (nested weeks / units)</option><option value="list">Post (entries with links)</option></select></label>}
            </div>
          </div>

          {artifact === 'presentation' ? (
            <>
              {/* PAGES — one slide each; a slide is a STACK of layout sections,
                  and each layout section holds one or more components. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 2px 8px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>SLIDES ({pages.length}) — stack layouts, fill each with components</div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {pages.map((pg, i) => {
                  const layouts = layoutsOf(pg);
                  return (
                  <div key={i} className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong>📄 Slide {i + 1}</strong>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, opacity: 0.55 }}>{layouts.length} layout{layouts.length === 1 ? '' : 's'}</span>
                        <button className="btn small ghost" disabled={pages.length <= 1} title="Remove slide" onClick={() => removePage(i)}>🗑</button>
                      </div>
                    </div>

                    {/* Stacked layout sections (scroll down the slide). */}
                    <div style={{ display: 'grid', gap: 10 }}>
                      {layouts.map((ly, li) => (
                        <div key={li} className="card alt" style={{ padding: '10px 12px', borderStyle: 'dashed' }}>
                          {/* layout dropdown + add-component picker share ONE row */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.55, flex: '0 0 auto' }}>▦{li + 1}</span>
                            <select value={ly.template || 'auto'} onChange={(e) => setLayout(i, li, { template: e.target.value })} style={{ fontSize: 12, flex: '1 1 120px', minWidth: 0 }}>
                              {LAYOUT_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                            </select>
                            {picker(presCats, [], (id) => addComp(i, li, id), '＋ Add component…')}
                            <button className="btn small ghost" style={{ flex: '0 0 auto' }} disabled={layouts.length <= 1} title="Remove layout" onClick={() => removeLayout(i, li)}>✕</button>
                          </div>
                          {ly.components.length === 0
                            ? <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>Pick a layout above, then add the components that go in this section (you can add the same type more than once).</p>
                            : <div style={{ display: 'grid', gap: 8 }}>{ly.components.map((c) => componentBar(c, (p) => setComp(i, li, c.uid || c.id, p), () => rmComp(i, li, c.uid || c.id)))}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: 'center', margin: '8px 0' }}>
                      <button className="btn small" onClick={() => addLayout(i)}>＋ Add layout (another section below)</button>
                    </div>

                    {/* per-page density */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1.5px dashed var(--ink)', paddingTop: 10 }}>
                      <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Paragraph length</span>
                        <select value={pg.length} onChange={(e) => setPage(i, { length: e.target.value as any })}><option value="brief">brief</option><option value="medium">medium</option><option value="detailed">detailed</option></select></label>
                      <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Paragraphs</span>
                        <input type="number" min={1} max={4} value={pg.paragraphs} onChange={(e) => setPage(i, { paragraphs: Number(e.target.value) })} style={{ width: 70 }} /></label>
                    </div>
                  </div>
                  );
                })}
              </div>
              <div style={{ textAlign: 'center', margin: '12px 0' }}>
                <button className="btn" onClick={addPage}>＋ Add page (slide {pages.length + 1})</button>
              </div>
            </>
          ) : (
            /* REPOSITORY — nested layers */
            <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 6 }}>🗂️ LAYERED REPOSITORY</div>
              <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
                A repository is a tree of <b>cards inside cards</b> — no slides, just layers.
                We&apos;ll create a starter card; then open the repository and use <b>✎ Edit</b> to
                add cards (nested inside), add sections (new layers below), attach <b>link buttons</b>,
                and turn on <b>✓ completion toggles</b>. You (and admins) can also ask the AI to
                lay it out for you. Great for a course (Week ▸ Unit ▸ activities) or post-style notes.
              </p>
            </div>
          )}

          {/* Free context */}
          <div className="card alt" style={{ padding: '12px 14px', margin: '12px 0' }}>
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
