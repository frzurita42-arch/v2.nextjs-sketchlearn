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
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';
import {
  STUDIO_CATEGORIES, ANNOTATION_SIZES, LAYOUT_TEMPLATES, BUTTON_ACTIONS, parseTemplateSpec,
  studioItem, assembleDefinition, capAvailable,
  type StudioConfig, type StudioComponent, type StudioLayout, type StudioPage, type ArtifactKind, type RepoCard,
} from '@/lib/studio-catalog';

type Msg = { role: 'assistant' | 'user'; content: string };
const newLayout = (): StudioLayout => ({ template: 'auto', components: [] });
const newPage = (): StudioPage => ({ layouts: [newLayout()], length: 'medium', paragraphs: 1 });

// Simplified per-slide chips (same design as the tool's layout editor): a slide
// ALWAYS has reading text; you add SUPPORT/visuals (first) then EVALUATION (a
// question). These map onto the studio component catalog ids.
const SUPPORT_CHIPS = [
  { id: 'image', label: '🖼 Image' }, { id: 'table', label: '▦ Table' },
  { id: 'latex', label: '∑ Formula' }, { id: 'codeblock', label: '{ } Code' },
  { id: 'audio', label: '🔊 Audio' }, { id: 'geogebra', label: '📐 Graph' },
];
const EVAL_CHIPS = [
  { id: 'mcq4', label: 'Multiple choice' }, { id: 'mcq2', label: 'True / false' },
  { id: 'fill-blank', label: 'Fill the blank' }, { id: 'input', label: 'Typed answer' },
  { id: 'writing', label: 'Handwriting' }, { id: 'annotation', label: 'Annotation pad' },
  { id: 'code', label: 'Code box' },
];
const SUP_IDS = SUPPORT_CHIPS.map((c) => c.id);
const EVAL_IDS = EVAL_CHIPS.map((c) => c.id);
const chipSt = (on: boolean) => ({ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', border: '1.5px solid var(--ink)', background: on ? 'var(--yellow,#fdf0a6)' : 'transparent', fontWeight: on ? 700 : 400 } as const);
const TONES = ['Friendly', 'Formal', 'Playful', 'Socratic', 'Storytelling', 'Encouraging', 'Concise', 'Enthusiastic', 'Professional'];
const blankRepoCard = (): RepoCard => ({ name: '', link: '', description: '', children: [] });

// One repository card in the builder — a compact Name + Link row, a roomier
// Description, and any nested child cards (the same shape, one layer inward).
function RepoCardNode({ card, onChange, onRemove, canRemove, depth }: {
  card: RepoCard; onChange: (c: RepoCard) => void; onRemove: () => void; canRemove: boolean; depth: number;
}) {
  const kids = card.children || [];
  const setField = (patch: Partial<RepoCard>) => onChange({ ...card, ...patch });
  const setChild = (i: number, nc: RepoCard) => onChange({ ...card, children: kids.map((k, j) => (j === i ? nc : k)) });
  const addChild = () => onChange({ ...card, children: [...kids, blankRepoCard()] });
  const removeChild = (i: number) => onChange({ ...card, children: kids.filter((_, j) => j !== i) });
  const smallLabel = { fontSize: 11, fontWeight: 700, opacity: 0.6 } as const;
  return (
    <div className="card" style={{ padding: '10px 12px', marginLeft: depth ? 16 : 0, borderLeft: depth ? '3px solid var(--accent, #5c80bc)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ fontSize: depth ? 13 : 15 }}>🗂️ {card.name.trim() || (depth ? 'Nested card' : 'Card')}{depth ? ` · L${depth + 1}` : ''}</strong>
        <button className="btn small ghost" disabled={!canRemove} title="Remove this card (and anything nested inside)" onClick={onRemove}>🗑</button>
      </div>
      {/* Compact: Name + Link share one row; Description gets a roomier row. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ flex: '2 1 130px', minWidth: 0, display: 'grid', gap: 2 }}><span style={smallLabel}>Name</span>
          <input type="text" value={card.name} placeholder="Title" onChange={(e) => setField({ name: e.target.value })} style={{ padding: '6px 9px' }} /></label>
        <label style={{ flex: '2 1 130px', minWidth: 0, display: 'grid', gap: 2 }}><span style={smallLabel}>Link</span>
          <input type="text" value={card.link} placeholder="Attachment / Drive URL" onChange={(e) => setField({ link: e.target.value })} style={{ padding: '6px 9px' }} /></label>
      </div>
      <label style={{ display: 'grid', gap: 2, marginTop: 6 }}><span style={smallLabel}>Description</span>
        <textarea value={card.description} placeholder="A short note about this item…" onChange={(e) => setField({ description: e.target.value })} style={{ minHeight: 56, padding: '7px 10px' }} /></label>
      {kids.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {kids.map((k, i) => <RepoCardNode key={i} card={k} depth={depth + 1} canRemove onChange={(nc) => setChild(i, nc)} onRemove={() => removeChild(i)} />)}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <button className="btn small ghost" onClick={addChild}>＋ Add nested card (one layer inside)</button>
      </div>
    </div>
  );
}

export function BuilderStudioView() {
  const app = useApp();
  const [tab] = useState<'studio' | 'chat'>('studio');
  const [caps, setCaps] = useState<any>(null);   // which integrations/keys are configured
  const [textProviders, setTextProviders] = useState<{ id: string; label: string }[]>([]);   // directly-selectable models
  useEffect(() => { API.get('/api/config').then((c) => { setCaps(c?.caps || {}); setTextProviders(Array.isArray(c?.textProviders) ? c.textProviders : []); }).catch(() => setCaps({})); }, []);
  const [provider, setProvider] = useState('auto');   // which model to force ('auto' = failover)

  // ---- Studio config ----
  // A one-shot seed (from a repository's "topic pick") prefills the artifact +
  // subject/title. Read synchronously so the first render already reflects it.
  const seed = appState.builderSeed;
  // When set, we are EDITING an existing tool: publishing UPDATES it (same slug)
  // instead of creating a new one. Seeded by the "✏️ Edit tool" button.
  const [editSlug] = useState<string | undefined>(seed?.editSlug);
  // When the chat composer hands off with a prompt, pre-build the plan on arrival
  // (run Suggest-with-AI once) so the owner reviews & confirms rather than starting
  // from an empty repo. Captured before the seed is consumed/cleared.
  const [autoSuggestSeed] = useState<boolean>(!!seed?.autoSuggest);
  // Lesson Path: also pre-build the presentation (editable slides) alongside the
  // repo, so a learning path arrives with BOTH ready to review.
  const [lessonPathSeed] = useState<boolean>(!!seed?.lessonPath);
  const [artifact, setArtifact] = useState<ArtifactKind>(seed?.artifact || 'repository');
  const [title, setTitle] = useState(seed?.title || '');
  const [subject, setSubject] = useState(seed?.subject || '');
  // Tone: a dropdown of presets PLUS a free custom text field (both write `tone`),
  // with a 🎲 to roll a random preset and a 🎨 to reword it.
  const [tone, setTone] = useState(seed?.tone || 'Friendly');
  // Tone is ONE field: a dropdown by default, flipped to a free-text box by the ✎
  // pencil (and back by ▾). It starts in custom mode only if the seeded tone isn't
  // one of the presets, so a hand-typed tone stays editable.
  const [toneCustom, setToneCustom] = useState(!!(seed?.tone && !TONES.includes(seed.tone)));
  const randomTone = () => setTone(TONES[Math.floor(Math.random() * TONES.length)]);
  // 🎨 palette "diffuser" — reword a field to a similar but different phrasing so
  // the author can shuffle it to taste.
  const [rewording, setRewording] = useState<'' | 'title' | 'subject' | 'tone'>('');
  const rewordField = async (kind: 'title' | 'subject' | 'tone') => {
    const cur = kind === 'title' ? title : kind === 'subject' ? subject : tone;
    if (!cur.trim() || rewording) return;
    setRewording(kind);
    try {
      const r: any = await API.post('/api/tools/reword', { text: cur, kind: kind === 'tone' ? 'generic' : kind, context: `${title} ${subject}`.trim() });
      if (r?.text) { if (kind === 'title') setTitle(r.text); else if (kind === 'subject') setSubject(r.text); else setTone(r.text); }
    } catch { /* ignore */ }
    setRewording('');
  };
  // A topic pick can hand us an AI-designed slide plan (seed.pages) to prefill the
  // Studio so the user reviews/edits the preset slides before generating.
  const [pages, setPages] = useState<StudioPage[]>(seed?.pages && seed.pages.length ? (seed.pages as StudioPage[]) : [newPage()]);
  const [addMenu, setAddMenu] = useState<number | null>(null);   // which slide's "＋ Add" menu is open
  useEffect(() => { appState.builderSeed = null; }, []);   // consume the seed once
  const [sourcePrompt, setSourcePrompt] = useState(seed?.sourcePrompt || seed?.context || '');
  // Repository: a TREE of link/resource cards the owner designs (each may nest).
  const [repoCards, setRepoCards] = useState<RepoCard[]>(seed?.cards && seed.cards.length ? (seed.cards as RepoCard[]) : [{ name: '', link: '', description: '', children: [] }]);
  // The user's HAND-AUTHORED cards, captured once, used as the seed for every AI
  // suggestion. This is the fix for the "Suggest with AI appends instead of
  // replacing" bug: we must never feed a previous AI batch back in as the seed
  // (that made rule 4 "keep + add" grow the list on every click). Instead each
  // suggest rebuilds a FRESH batch from the same hand-authored baseline. A manual
  // edit clears it, so the (now edited) cards become the new baseline.
  const seedCardsRef = useRef<RepoCard[] | null>(null);
  const markCardsEdited = () => { seedCardsRef.current = null; };
  const addCard = () => { markCardsEdited(); setRepoCards((cs) => [...cs, { name: '', link: '', description: '', children: [] }]); };
  // "Suggest with AI": one or MORE reference documents (attached in the goal box,
  // PDF or text) plus the goal + any hand-entered cards let the AI propose /
  // extend a plan into the editable card fields below.
  type DocItem = { name: string; text?: string; dataUrl?: string };
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [withLinks, setWithLinks] = useState(false);   // "link suggestion" toggle
  // "Next card" mode: when ON, Suggest with AI adds a SINGLE next card that
  // follows the cards already on the page (using the chat, title & description)
  // instead of regenerating a whole fresh batch of pathways.
  const [nextCard, setNextCard] = useState(false);
  // AI card shape ({title,text,link?,linkLabel?,children}) → builder card shape.
  // A suggested link fills the card's Link field, so on publish it becomes a
  // Poster (blue) link viewers can open.
  const mapAiCards = (cards: any[]): RepoCard[] => (Array.isArray(cards) ? cards : []).slice(0, 20).map((c: any) => ({
    name: String(c?.title || c?.name || '').slice(0, 120),
    link: String(c?.link || c?.url || (Array.isArray(c?.links) ? c.links[0]?.url : '') || '').slice(0, 800),
    linkLabel: String(c?.linkLabel || (Array.isArray(c?.links) ? c.links[0]?.label : '') || '').slice(0, 15),
    description: String(c?.text || c?.subtitle || c?.description || '').slice(0, 2000),
    children: mapAiCards(c?.children || []),
  }));
  // Reverse: only the cards the user actually filled in, sent to the AI as a seed.
  const cardsToAi = (cards: RepoCard[]): any[] => (cards || [])
    .filter((c) => (c.name || '').trim() || (c.description || '').trim() || (c.children || []).length)
    .map((c) => ({ title: c.name || '', text: c.description || '', ...(c.link ? { link: c.link, linkLabel: c.linkLabel || '' } : {}), children: cardsToAi(c.children || []) }));
  const onConsiderDoc = async (f: File) => {
    if (!f) return;
    if (f.size > 20_000_000) { setErr('Please pick a document under 20 MB.'); return; }
    setErr('');
    const item: DocItem = { name: f.name };
    const isText = /text|json|markdown/.test(f.type) || /\.(txt|md|csv)$/i.test(f.name);
    if (isText) item.text = await f.text();
    else item.dataUrl = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result || '')); rd.readAsDataURL(f); });
    setDocs((d) => [...d, item].slice(0, 6));
  };
  const removeDoc = (i: number) => setDocs((d) => d.filter((_, j) => j !== i));
  const docsPayload = () => docs.map((d) => ({ text: d.text || '', dataUrl: d.dataUrl || '' }));
  // AI proposes the plan into the editable card fields (does NOT publish).
  // Two modes: "Next card" ON adds a SINGLE card that follows what's already on
  // the page; OFF regenerates a whole fresh batch (replacing the current cards,
  // built from the user's hand-authored baseline — never from a prior AI batch,
  // so a second click can't append/grow the list).
  const suggestWithAI = async () => {
    if (suggesting || busy) return;
    setSuggesting(true); setErr('');
    try {
      if (nextCard) {
        // ONE next card, based on the chat + title/description + all current cards.
        const r: any = await API.post('/api/tools/repo/ai', {
          op: 'suggest', next: true, title, subject, goal: context, withLinks, provider,
          docs: docsPayload(), cards: cardsToAi(repoCards), messages,
        }, { retries: 1 });
        const mapped = mapAiCards(r?.cards || []);
        if (mapped.length) setRepoCards((cs) => [...cs, ...mapped.slice(0, 1)]);
        else setErr(r?.error || 'The AI did not return a next card. Add a goal, a card or two, or chat, then try again.');
      } else {
        // Fresh batch from the hand-authored baseline (captured once, reused on
        // every re-suggest so the result replaces rather than appends).
        const seed = seedCardsRef.current ?? repoCards;
        seedCardsRef.current = seed;
        const r: any = await API.post('/api/tools/repo/ai', {
          op: 'suggest', title, subject, goal: context, withLinks, provider,
          docs: docsPayload(), cards: cardsToAi(seed), messages,
        }, { retries: 1 });
        const mapped = mapAiCards(r?.cards || []);
        if (mapped.length) setRepoCards(mapped);
        else setErr(r?.error || 'The AI did not return a plan. Add a goal, a document, or a card or two, then try again.');
      }
    } catch (e: any) { setErr(e?.message || 'Could not build a suggestion.'); }
    setSuggesting(false);
  };
  const [context, setContext] = useState(seed?.context || '');
  // "Generate the tool" for a repository: let the AI build the plan from
  // everything (goal, chat, document, current cards, toggles) AND publish it in
  // one step. (The plain "Post" button publishes the current cards untouched.)
  const generateWithAI = async () => {
    if (busy || suggesting) return;
    setBusy(true); setErr('');
    try {
      const r: any = await API.post('/api/tools/repo/ai', {
        op: 'suggest', title, subject, goal: context, withLinks, provider,
        docs: docsPayload(), cards: cardsToAi(repoCards), messages,
      }, { retries: 1 });
      const mapped = mapAiCards(r?.cards || []);
      const finalCards = mapped.length ? mapped : repoCards;
      setRepoCards(finalCards);
      const cfg: StudioConfig = { artifact: 'repository', title, subject, tone, context, cards: finalCards, imageGen: false };
      await publishDef(assembleDefinition(cfg), true, cfg);
    } catch (e: any) { setErr(e?.message || (editSlug ? 'Could not update the tool.' : 'Could not generate the tool.')); }
    setBusy(false);
  };
  // Pre-build once when arriving from the chat composer: fill the editable cards via
  // Suggest-with-AI (no publish) so the owner can edit and confirm.
  const didAutoSuggest = useRef(false);
  useEffect(() => {
    if (!autoSuggestSeed || didAutoSuggest.current) return;
    if (artifact !== 'repository' || !context.trim()) return;
    didAutoSuggest.current = true;
    (async () => {
      await suggestWithAI();                      // pre-build the repo cards
      if (lessonPathSeed) await suggestPresentation();   // + the presentation slides
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggestSeed, artifact, context]);
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
  // New slides start with the always-present reading text.
  const addPage = () => setPages((ps) => [...ps, { layouts: [{ template: 'auto', components: [{ id: 'reading', uid: mkUid() }] }], length: 'medium', paragraphs: 1 }]);
  const removePage = (i: number) => setPages((ps) => ps.length > 1 ? ps.filter((_, j) => j !== i) : ps);
  const movePage = (i: number, dir: -1 | 1) => setPages((ps) => { const j = i + dir; if (j < 0 || j >= ps.length) return ps; const n = ps.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
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

  // ---- Stack editing for a slide: an ordered list of elements (reading paragraphs,
  // support/visuals, evaluations), each with its own optional AI instruction. A "＋
  // Add" menu appends another reading / support / evaluation anywhere. ----
  const flatComps = (pg: StudioPage): StudioComponent[] => layoutsOf(pg).flatMap((l) => l.components);
  // Elements shown in the stack (the slide context "note" is edited separately below).
  const stackOf = (pg: StudioPage): StudioComponent[] => flatComps(pg).filter((c) => c.id !== 'note');
  const slideNote = (pg: StudioPage) => flatComps(pg).find((c) => c.id === 'note')?.instr || '';
  // Write a slide as ONE layout: the stack elements, then the context note (if any).
  const writeStack = (i: number, comps: StudioComponent[], note?: string) => setPages((ps) => ps.map((p, j) => {
    if (j !== i) return p;
    const nt = note !== undefined ? note : slideNote(p);
    const out = nt && nt.trim() ? [...comps, { id: 'note', uid: flatComps(p).find((c) => c.id === 'note')?.uid || mkUid(), instr: nt }] : comps;
    return { ...p, layouts: [{ template: 'auto', components: out }], components: undefined, template: undefined };
  }));
  const addEl = (i: number, id: string) => { const it = studioItem(id); const opt = it?.sizes ? ANNOTATION_SIZES[1] : it?.button ? 'ask' : undefined; writeStack(i, [...stackOf(pages[i]), { id, uid: mkUid(), instr: '', opt }]); setAddMenu(null); };
  const setElInstr = (i: number, uid: string, instr: string) => writeStack(i, stackOf(pages[i]).map((c) => ((c.uid || c.id) === uid ? { ...c, instr } : c)));
  const rmEl = (i: number, uid: string) => writeStack(i, stackOf(pages[i]).filter((c) => (c.uid || c.id) !== uid));
  const moveEl = (i: number, uid: string, dir: -1 | 1) => { const cs = stackOf(pages[i]); const k = cs.findIndex((c) => (c.uid || c.id) === uid); const m = k + dir; if (k < 0 || m < 0 || m >= cs.length) return; const n = cs.slice(); [n[k], n[m]] = [n[m], n[k]]; writeStack(i, n); };
  const setSlideNote = (i: number, text: string) => writeStack(i, stackOf(pages[i]), text);
  const readingCount = (pg: StudioPage) => stackOf(pg).filter((c) => c.id === 'reading').length;
  // How an element is labelled + its instruction placeholder.
  const elMeta = (id: string): { emoji: string; name: string; ph: string } => {
    const it = studioItem(id);
    const ph = id === 'reading' ? 'How should the AI write this paragraph? (optional)'
      : SUP_IDS.includes(id) ? 'What should this show? (optional)'
      : EVAL_IDS.includes(id) ? 'What should this question test? (optional)'
      : 'Instruction for the AI (optional)';
    return { emoji: it?.emoji || '•', name: it?.name || id, ph };
  };

  // ---- Presentation "Suggest / Edit with AI" (mirrors the repository flow) ----
  // Map the designer's simple pages [{components:[id|{id,instr}], length, paragraphs}]
  // into editable StudioPage[] (one layout per slide), and back for edit context.
  const designToPages = (raw: any[]): StudioPage[] => (Array.isArray(raw) ? raw : []).map((pg: any) => ({
    layouts: [{ template: 'auto', components: (Array.isArray(pg?.components) ? pg.components : []).map((c: any) => {
      const id = typeof c === 'string' ? c : String(c?.id || '');
      const instr = typeof c === 'object' ? String(c?.instr || '') : '';
      const it = studioItem(id);
      const opt = it?.sizes ? ANNOTATION_SIZES[1] : it?.button ? 'ask' : undefined;
      return { id, uid: mkUid(), instr, opt };
    }).filter((c: any) => c.id) }],
    length: ['brief', 'medium', 'detailed'].includes(pg?.length) ? pg.length : 'medium',
    paragraphs: Math.max(1, Math.min(4, parseInt(pg?.paragraphs, 10) || 1)),
  })).filter((p: StudioPage) => ((p.layouts?.[0]?.components.length) || 0) > 0);
  const pagesToDesign = (ps: StudioPage[]) => ps.map((p) => ({
    components: layoutsOf(p).flatMap((l) => l.components).map((c: any) => ({ id: c.id, ...(c.instr ? { instr: c.instr } : {}) })),
    length: p.length, paragraphs: p.paragraphs,
  }));
  // Once the AI has proposed slides, the button flips to "Edit with AI": the next
  // request MODIFIES the existing slides (and can add more) instead of a fresh deck.
  const [presSuggested, setPresSuggested] = useState(false);
  const suggestPresentation = async () => {
    if (suggesting || busy) return;
    setSuggesting(true); setErr('');
    try {
      const editing = presSuggested && !nextCard;
      const r: any = await API.post('/api/tools/studio-design', {
        subject: subject || title, title, tone, provider, context, docs: docsPayload(),
        mode: nextCard ? 'next' : editing ? 'edit' : 'suggest',
        existing: (nextCard || editing) ? pagesToDesign(pages) : undefined,
      }, { retries: 1 });
      const mapped = designToPages(r?.pages || []);
      if (mapped.length) {
        if (nextCard) setPages((ps) => [...ps, ...mapped]);   // append the new slide(s)
        else setPages(mapped);                                 // fresh or fully-edited deck
        // Fill the title/subject the AI proposed when the author left them blank.
        if (!title.trim() && r?.title) setTitle(String(r.title));
        if (!subject.trim() && r?.subject) setSubject(String(r.subject));
        setPresSuggested(true);
      } else setErr('The AI did not return slides — add a subject or some detail, then try again.');
    } catch (e: any) { setErr(e?.message || 'Could not build a suggestion.'); }
    setSuggesting(false);
  };

  const config = (): StudioConfig => artifact === 'presentation'
    ? { artifact, title, subject, tone, context, pages }
    : { artifact, title, subject, tone, context, sourcePrompt, cards: repoCards, imageGen: false };

  // Publish the finished definition — either UPDATE the tool we're editing
  // (editSlug set, via the settings PUT) or CREATE a new one. Either way we stash
  // the editable studio config on the definition so "✏️ Edit tool" can reload the
  // exact card state later, then open the resulting tool.
  const publishDef = async (def: any, aiGenerated: boolean, cfgOverride?: StudioConfig) => {
    def.studioConfig = cfgOverride || config();
    if (editSlug) {
      await API.put('/api/tools/settings', { slug: editSlug, definition: def });
      const one = await API.get(`/api/tools?slug=${encodeURIComponent(editSlug)}`);
      if (one?.tool) { appState.activeTool = one.tool; app.nav('tool'); return; }
      app.nav('tools'); return;
    }
    const pub = await API.post('/api/tools', { definition: def, visibility, aiGenerated });
    const one = await API.get(`/api/tools?slug=${encodeURIComponent(pub.slug)}`);
    if (one?.tool) { appState.activeTool = one.tool; app.nav('tool'); return; }
    app.nav('tools');
  };

  // Button copy reflects create vs. update.
  const genLabel = editSlug ? '✅ Update the tool →' : '✨ Generate the tool →';
  const genBusyLabel = editSlug ? 'Updating…' : 'Generating…';

  const generate = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      // A repository is user-authored (no AI): publish the layered card tree directly.
      if (artifact === 'repository') {
        await publishDef(assembleDefinition(config()), false);
        return;
      }
      const assembled = assembleDefinition(config());
      const r = await API.post('/api/tools/studio-build', { definition: assembled, messages }, { retries: 1 });
      await publishDef(r?.definition || assembled, true);
    } catch (e: any) { setErr(e?.message || (editSlug ? 'Could not update the tool.' : 'Could not generate the tool.')); }
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
  // Field-label row that can carry inline tool buttons (🎨 / 🎲) next to the title.
  const labelRow = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const;
  const miniBtn = { padding: '0 6px', fontSize: 12, lineHeight: 1.6 } as const;
  const paletteBtn = (kind: 'title' | 'subject' | 'tone') => {
    const val = kind === 'title' ? title : kind === 'subject' ? subject : tone;
    return <button type="button" className="btn small ghost" style={miniBtn} disabled={!val.trim() || !!rewording} title="Reword with AI — a similar but different phrasing" onClick={() => rewordField(kind)}>{rewording === kind ? '…' : '🎨'}</button>;
  };
  const repoPrompt = (sourcePrompt || context || `A layered collection of links & resources: ${subject || title}`).trim();

  return (
    <>
      <PageHeaderBar
        pageKey="toolbuilder"
        title={editSlug ? 'Edit tool' : 'Build a tool'}
        subtitle="Compose it visually."
      />
      {editSlug && (
        <p className="view-sub" style={{ marginTop: -12, fontSize: 13, opacity: 0.8 }}>
          ✏️ Editing an existing tool — the card settings below are loaded from it, and publishing <b>updates the same tool</b> (it won’t create a new one).
        </p>
      )}

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
            {/* Lesson Path: both artifacts were pre-built — nudge the owner to review
                each with the toggle above, then publish. */}
            {lessonPathSeed && (
              <div style={{ marginTop: 10, fontSize: 12, background: 'rgba(127,176,105,0.14)', border: '1.5px solid var(--ink,#2d2a26)', borderRadius: 8, padding: '8px 10px' }}>
                🎬 <b>Learning path pre-built.</b> Both the <b>🗂️ Repository</b> cards and the <b>📊 Presentation</b> slides were drafted from your prompt — use the toggle above to review and edit each, then publish. {suggesting && <em>Still drafting…</em>}
              </div>
            )}
          </div>

          {/* Global settings — the SAME Title / Subject-topic / Tone layout for
              both presentations and repositories. The 🎨 palette rewords a field
              (a similar-but-different phrasing) and the AI fills them in when it
              suggests slides. */}
          <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 8 }}>OVERALL</div>
            <div style={gridCol}>
              <div className="field">
                <span style={labelRow}>Title {paletteBtn('title')}</span>
                <input type="text" value={title} placeholder="Name your tool" onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="field">
                <span style={labelRow}>Subject / topic {paletteBtn('subject')}</span>
                <input type="text" value={subject} placeholder={artifact === 'presentation' ? 'e.g. Trigonometry' : 'e.g. Small Payment System'} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="field">
                <span style={labelRow}>Tone
                  <button type="button" className="btn small ghost" style={miniBtn}
                    title={toneCustom ? 'Pick from the list' : 'Type a custom tone'}
                    onClick={() => setToneCustom((c) => { const next = !c; if (!next && !TONES.includes(tone)) setTone(TONES[0]); return next; })}>{toneCustom ? '▾' : '✎'}</button>
                  <button type="button" className="btn small ghost" style={miniBtn} title="Roll a random tone" onClick={randomTone}>🎲</button>
                  {paletteBtn('tone')}
                </span>
                {toneCustom
                  ? <input type="text" value={tone} placeholder="Type a custom tone…" onChange={(e) => setTone(e.target.value)} />
                  : <select value={TONES.includes(tone) ? tone : TONES[0]} onChange={(e) => setTone(e.target.value)}>
                      {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>}
              </div>
            </div>
          </div>

          {artifact === 'presentation' ? (
            <>
              {/* SLIDES — each slide is a STACK of elements you add with ＋: reading
                  paragraphs (each with its own writing instruction), support/visuals,
                  and evaluations. Every slide keeps at least one reading paragraph. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 2px 8px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>SLIDES ({pages.length}) — stack reading paragraphs, support and evaluations with ＋</div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {pages.map((pg, i) => {
                  const stack = stackOf(pg);
                  const rc = readingCount(pg);
                  return (
                  <div key={i} className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong>📄 Slide {i + 1}</strong>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <button className="btn small ghost" title="Move slide up" disabled={i === 0} onClick={() => movePage(i, -1)} style={{ padding: '0 8px' }}>↑</button>
                        <button className="btn small ghost" title="Move slide down" disabled={i === pages.length - 1} onClick={() => movePage(i, 1)} style={{ padding: '0 8px' }}>↓</button>
                        <button className="btn small ghost" disabled={pages.length <= 1} title="Remove slide" onClick={() => removePage(i)} style={{ padding: '0 8px' }}>🗑</button>
                      </span>
                    </div>

                    {/* The slide's element stack (reading paragraphs / support / evaluation). */}
                    <div style={{ display: 'grid', gap: 8 }}>
                      {stack.map((c) => {
                        const uid = c.uid || c.id; const m = elMeta(c.id);
                        const canRemove = !(c.id === 'reading' && rc <= 1);
                        return (
                          <div key={uid} className="card alt" style={{ padding: '8px 10px', borderStyle: 'dashed' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{m.emoji} {m.name}</span>
                              <span style={{ display: 'inline-flex', gap: 4 }}>
                                <button className="btn small ghost" title="Move up" onClick={() => moveEl(i, uid, -1)} style={{ padding: '0 7px' }}>↑</button>
                                <button className="btn small ghost" title="Move down" onClick={() => moveEl(i, uid, 1)} style={{ padding: '0 7px' }}>↓</button>
                                <button className="btn small ghost" disabled={!canRemove} title={canRemove ? 'Remove' : 'Every slide keeps at least one reading paragraph'} onClick={() => rmEl(i, uid)} style={{ padding: '0 7px' }}>✕</button>
                              </span>
                            </div>
                            <input value={c.instr || ''} onChange={(e) => setElInstr(i, uid, e.target.value)} placeholder={m.ph}
                              style={{ width: '100%', fontSize: 12, marginTop: 5, padding: '5px 8px', borderRadius: 8, border: '1.5px solid var(--ink)' }} maxLength={2000} />
                          </div>
                        );
                      })}
                    </div>

                    {/* ＋ Add — reading paragraph / support / evaluation. */}
                    <div style={{ marginTop: 8 }}>
                      {addMenu === i ? (
                        <div className="card alt" style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <b style={{ fontSize: 12 }}>Add to slide {i + 1}</b>
                            <button className="btn small ghost" onClick={() => setAddMenu(null)}>✕</button>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>Text</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                            <span onClick={() => addEl(i, 'reading')} style={chipSt(false)}>📖 Reading paragraph</span>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>Support / visuals</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                            {SUPPORT_CHIPS.map((s) => <span key={s.id} onClick={() => addEl(i, s.id)} style={chipSt(false)}>{s.label}</span>)}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>Evaluation (question)</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {EVAL_CHIPS.map((s) => <span key={s.id} onClick={() => addEl(i, s.id)} style={chipSt(false)}>{s.label}</span>)}
                          </div>
                        </div>
                      ) : (
                        <button className="btn small" onClick={() => setAddMenu(i)}>＋ Add reading · support · evaluation</button>
                      )}
                    </div>

                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, margin: '10px 0 2px' }}>Slide context — overall instruction for the AI (optional)</div>
                    <textarea value={slideNote(pg)} onChange={(e) => setSlideNote(i, e.target.value)}
                      placeholder="e.g. Welcome slide: greet ESL learners and introduce fashion design."
                      style={{ width: '100%', fontSize: 12, minHeight: 40, padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--ink)' }} maxLength={2000} />
                  </div>
                  );
                })}
              </div>
              <div style={{ textAlign: 'center', margin: '12px 0' }}>
                <button className="btn" onClick={addPage}>＋ Add slide ({pages.length + 1})</button>
              </div>
            </>
          ) : (
            /* REPOSITORY — a collection of saved link/resource cards. Each card unit
               (styled like a slide) holds a Name, an attachment / Drive link and a
               description. Published, they show as cards on the page and viewers can
               add their own. */
            <>
              <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 6 }}>ORIGINAL REPO PROMPT</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>This is the prompt or brief saved with the repo. Edit it to change the source that generated this collection.</div>
                <textarea value={sourcePrompt} placeholder="Describe the repository, the topics it should cover, and the structure of the cards..." onChange={(e) => setSourcePrompt(e.target.value)} style={{ minHeight: 76, width: '100%' }} />
                <div style={{ fontSize: 11, opacity: 0.68, marginTop: 6 }}>Saved prompt preview: {repoPrompt}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 2px 8px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>CARDS ({repoCards.length}) — name · link · description, nest cards inside cards</div>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {repoCards.map((c, i) => (
                  <RepoCardNode key={i} card={c} depth={0} canRemove={repoCards.length > 1}
                    onChange={(nc) => { markCardsEdited(); setRepoCards((cs) => cs.map((x, j) => (j === i ? nc : x))); }}
                    onRemove={() => { markCardsEdited(); setRepoCards((cs) => (cs.length > 1 ? cs.filter((_, j) => j !== i) : cs)); }} />
                ))}
              </div>
              <div style={{ textAlign: 'center', margin: '12px 0' }}>
                <button className="btn" onClick={addCard}>＋ Add card</button>
              </div>
              <p style={{ fontSize: 12, opacity: 0.7, textAlign: 'center', margin: '0 0 4px' }}>
                Each card holds a name, a link/attachment and a description — and can nest more cards inside it. Fill them in by hand, or type a goal below and hit <b>🤖 Suggest with AI</b> to have the AI propose the plan (up to 20 cards) for you to edit.
              </p>
            </>
          )}

          {/* Free context — for a repository this is the GOAL box that drives
              "Suggest with AI", and the document to consider is attached here. */}
          <div className="card alt" style={{ padding: '12px 14px', margin: '12px 0' }}>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>{artifact === 'repository' ? 'What should the plan achieve? / Anything else for the AI to consider (optional)' : 'What should the lesson teach? / What to build or change (optional)'}</span>
              <textarea value={context}
                placeholder={artifact === 'repository' ? 'e.g. “A 12-week plan to pass Physics I”, “Steps to launch a podcast”, constraints, your goal…' : 'e.g. “Intro to fractions for grade 5”. After suggesting, describe a change: “add multiple-choice questions about bananas on a harder level”.'}
                onChange={(e) => setContext(e.target.value)} style={{ minHeight: 52 }} /></label>
            {/* Attached-document chips: their own row, directly under the input. */}
            {docs.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                {docs.map((d, i) => (
                  <span key={i} style={{ fontSize: 12, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--card-alt, rgba(0,0,0,0.04))', borderRadius: 6, padding: '2px 8px' }}>
                    📄 {d.name} <button className="btn small ghost" style={{ padding: '0 6px' }} title="Remove document" onClick={() => removeDoc(i)}>✕</button>
                  </span>
                ))}
              </div>
            )}
            {/* One row of controls: attach a document, the toggles, and the
                Suggest/Edit-with-AI action — for BOTH presentations and repos. A
                presentation proposes SLIDES you can review & edit before generating;
                after the first suggestion the button becomes "Edit with AI" and the
                next request modifies the existing slides (and can add more). */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <label className="btn small blue" style={{ cursor: 'pointer' }}>
                📎 {docs.length ? 'Add another document' : 'Attach a document (optional)'}
                <input type="file" accept=".pdf,.txt,.md,.csv,.doc,.docx,.rtf,text/*,application/pdf" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onConsiderDoc(f); e.currentTarget.value = ''; }} />
              </label>
              {artifact === 'repository' && (
                <button type="button" className={`btn small ${withLinks ? 'green' : 'ghost'}`} onClick={() => setWithLinks((v) => !v)}
                  title="When on, Suggest with AI also adds a reference link (website / image / Wikipedia) to each card's Poster button.">
                  🔗 Link suggestion: {withLinks ? 'On' : 'Off'}
                </button>
              )}
              <button type="button" className={`btn small ${nextCard ? 'green' : 'ghost'}`} onClick={() => setNextCard((v) => !v)}
                title={artifact === 'presentation'
                  ? 'When ON, Suggest adds ONE next slide that follows the slides already on the page. When OFF, it proposes / edits the whole deck.'
                  : 'When ON, Suggest with AI adds ONE next card that follows the cards already on the page. When OFF, it regenerates a whole fresh batch.'}>
                ➕ Next {artifact === 'presentation' ? 'slide' : 'card'}: {nextCard ? 'On' : 'Off'}
              </button>
              {artifact === 'presentation' ? (
                <button type="button" className="btn small blue" disabled={busy || suggesting} onClick={suggestPresentation}
                  title={nextCard ? 'Add ONE next slide after the current deck.'
                    : presSuggested ? 'Edit the slides above with AI — describe your change in the box (e.g. “add multiple-choice questions about bananas on a harder level”) and it rewrites/adds slides.'
                    : 'Let the AI propose a full slide deck into the editor above — then edit it and Generate.'}>
                  {suggesting ? '🤖 Thinking…' : nextCard ? '🤖 Suggest next slide' : presSuggested ? '🤖 Edit with AI' : '🤖 Suggest with AI'}
                </button>
              ) : (
                <button type="button" className="btn small blue" disabled={busy || suggesting} onClick={suggestWithAI}
                  title={nextCard
                    ? 'Add ONE next card that follows the cards already on the page — it considers your chat, title & description.'
                    : 'Let the AI propose a fresh plan into the cards above — it considers your goal, chat, documents and the cards so far. Then edit them and Post.'}>
                  {suggesting ? '🤖 Thinking…' : (nextCard ? '🤖 Suggest next card' : '🤖 Suggest with AI')}
                </button>
              )}
            </div>
            {messages.some((m) => m.role === 'user') && <small style={{ fontSize: 11, opacity: 0.65, display: 'block', marginTop: 6 }}>💬 Your chat answers are also considered.</small>}
          </div>

          {err && <p style={{ color: 'var(--danger,#e4572e)', textAlign: 'center' }}>{err}</p>}
          <div className="slide-actions" style={{ justifyContent: 'center', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Visibility</span>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
              </select></label>
            {/* Model picker — same style as Visibility. Lists the API models that are
                configured; "Auto" tries them in order (and falls over on a 503). */}
            {textProviders.length > 0 && (
              <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Model</span>
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="auto">Auto</option>
                  {textProviders.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select></label>
            )}
            {artifact === 'repository' ? (
              <>
                {/* AI builds the whole plan from your goal/chat/document and publishes it. */}
                <button className="btn ghost" disabled={busy || suggesting} onClick={generateWithAI}
                  title="Let the AI build the whole plan from your goal, chat and document — and publish it.">{busy ? genBusyLabel : genLabel}</button>
                {/* Publishes EXACTLY the current cards — no AI changes. */}
                <button className="btn green" disabled={busy || suggesting} onClick={generate}
                  title="Publish exactly what is in the cards above right now (no AI changes).">{editSlug ? '📮 Update' : '📮 Post'}</button>
              </>
            ) : (
              <button className="btn green" disabled={busy || suggesting} onClick={generate}>{busy ? genBusyLabel : genLabel}</button>
            )}
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
            <button className="btn green" disabled={busy} onClick={generate}>{busy ? genBusyLabel : genLabel}</button>
          </div>
        </div>
      )}
    </>
  );
}
