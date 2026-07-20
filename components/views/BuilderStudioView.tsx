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
import { type WizardStep } from '@/components/ui/StepWizard';
import { WizardGridTemplate } from '@/components/ui/WizardGridTemplate';
import { SetupWizardCard, SETUP_CARD_WIDTH } from '@/components/ui/SetupWizardCard';
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

// The slide-component toolbox — grouped exactly like the "Add to slide" menu, used
// in the presentation config popup so the author picks which components the AI may
// use, and which slide templates it should follow.
// Every component the AI can drop on a slide. `label` is the menu wording, `short`
// is the compact chip used in template diagrams. Text has TWO flavours now: a long
// reading paragraph AND a short "statement / task" (a prompt that explains or asks
// the learner to complete something) — the AI may stack more text under either.
const SLIDE_TOOL_SECTIONS: { title: string; items: { id: string; label: string; short: string }[] }[] = [
  { title: 'Text', items: [
    { id: 'reading', label: '📖 Reading paragraph', short: '📖 Text' },
    { id: 'statement', label: '💬 Statement / task', short: '💬 Statement' },
  ] },
  { title: 'Support / visuals', items: [
    { id: 'image', label: '🖼 Image', short: '🖼 Image' }, { id: 'table', label: '▦ Table', short: '▦ Table' },
    { id: 'formula', label: '∑ Formula', short: '∑ Formula' }, { id: 'code', label: '{ } Code', short: '{ } Code' },
    { id: 'audio', label: '🔊 Audio', short: '🔊 Audio' }, { id: 'graph', label: '📈 Graph', short: '📈 Graph' },
  ] },
  { title: 'Evaluation (question)', items: [
    { id: 'mcq', label: '☑️ Multiple choice', short: '☑️ Multiple choice' },
    { id: 'multiselect', label: '✅ Multiple selection', short: '✅ Multi-select' },
    { id: 'truefalse', label: '⚖️ True / false', short: '⚖️ True/false' },
    { id: 'fill', label: '␣ Fill the blank', short: '␣ Fill blank' },
    { id: 'typed', label: '⌨️ Typed answer', short: '⌨️ Typed' },
    { id: 'askai', label: '🤖 Ask-AI (3 tries)', short: '🤖 Ask-AI' },
    { id: 'codebox', label: '{_} Code box (input)', short: '{_} Code box' },
    { id: 'handwriting', label: '✍️ Handwriting', short: '✍️ Handwriting' },
    { id: 'annotation', label: '📝 Annotation pad', short: '📝 Annotate' },
  ] },
];
const SLIDE_TOOL_ITEMS = SLIDE_TOOL_SECTIONS.flatMap((s) => s.items);
const COMP_BY_ID: Record<string, { id: string; label: string; short: string }> = Object.fromEntries(SLIDE_TOOL_ITEMS.map((i) => [i.id, i]));
const TOOL_SHORT = (id: string) => COMP_BY_ID[id]?.short || id;

// ★ SUPER-COMPONENTS: interchangeable groups. A template slot can name a group
// ('@visual') instead of a single component; the AI then picks the ONE member that
// best fits the subject (a graph, table, formula or image for "@visual"). This lets
// a handful of templates cover a huge combination space instead of enumerating each.
const SUPER_GROUPS: Record<string, { label: string; hint: string; members: string[] }> = {
  text:     { label: '📝 Text',      hint: 'a reading paragraph or a short statement/task', members: ['reading', 'statement'] },
  visual:   { label: '🎨 Visual',    hint: 'pick image, table, formula or graph — whatever fits the subject', members: ['image', 'table', 'formula', 'graph'] },
  question: { label: '❓ Question',   hint: 'DEFAULT to multiple choice; fall back to multi-select, true/false, fill-the-blank, typed, or 🤖 Ask-AI (lenient, 3 tries — passes if essentially right) when the answer is open-ended', members: ['mcq', 'multiselect', 'truefalse', 'fill', 'typed', 'askai'] },
  handson:  { label: '🛠 Hands-on',  hint: 'code box, typed answer, handwriting, annotation or ask-AI', members: ['codebox', 'typed', 'handwriting', 'annotation', 'askai'] },
  audio:    { label: '🔊 Audio',     hint: 'a listening clip', members: ['audio'] },
};
const isGroupSlot = (slot: string) => slot.startsWith('@');
const groupOf = (slot: string) => SUPER_GROUPS[slot.slice(1)];
// Chip label for a template slot (component short label, or the super-group label).
const SLOT_LABEL = (slot: string) => (isGroupSlot(slot) ? groupOf(slot)?.label || slot : TOOL_SHORT(slot));
// The "pick one of…" member list shown under a super-group slot.
const SLOT_MEMBERS = (slot: string) => (isGroupSlot(slot) ? (groupOf(slot)?.members || []).map(TOOL_SHORT).join(' / ') : '');
// Plain-text description of a slot for the AI prompt.
const SLOT_NOTE = (slot: string) => (isGroupSlot(slot) ? `${groupOf(slot)?.label}{${(groupOf(slot)?.members || []).map(TOOL_SHORT).join('/')}}` : TOOL_SHORT(slot));

type SlideTemplate = { id: string; name: string; tags: string[]; slots: string[] };
// ★ The curated template library. Every template opens with TEXT (reading or a
// statement) and carries 5 hashtags so the AI can match it to a subject fast. Slots
// use super-groups ('@visual', '@question', '@handson') wherever the choice is
// interchangeable, so these patterns cover most lesson shapes. Hard-to-grade
// exercises append 🤖 Ask-AI as a lenient verbal/typed fallback (3 tries).
const TEMPLATE_LIBRARY: SlideTemplate[] = [
  // Universal
  { id: 'read-see-check',   name: 'Read → See → Check',     tags: ['#general', '#intro', '#science', '#history', '#any'],           slots: ['reading', '@visual', '@question'] },
  { id: 'deep-explain',     name: 'Deep explanation',       tags: ['#advanced', '#theory', '#science', '#history', '#reading'],     slots: ['reading', '@visual', 'reading', '@question'] },
  { id: 'scholar-explain',  name: 'Scholar explanation',    tags: ['#advanced', '#scholar', '#dense', '#theory', '#university'],    slots: ['statement', 'reading', 'reading', '@visual', 'reading', '@question', '@question'] },
  { id: 'statement-drill',  name: 'Statement → Practice',   tags: ['#practice', '#exercise', '#quick', '#assessment', '#any'],      slots: ['statement', '@question'] },
  { id: 'statement-visual', name: 'Statement → Visual → Check', tags: ['#practice', '#general', '#exercise', '#visual', '#any'],    slots: ['statement', '@visual', '@question'] },
  { id: 'explain-visual',   name: 'Explain → Visual → Check', tags: ['#explain', '#general', '#science', '#history', '#any'],       slots: ['statement', 'reading', '@visual', '@question'] },
  { id: 'quick-tf',         name: 'Quick true / false',     tags: ['#review', '#quick', '#warmup', '#assessment', '#any'],          slots: ['statement', 'truefalse'] },
  { id: 'concept-multi',    name: 'Concept → Multi-select', tags: ['#review', '#concepts', '#recap', '#assessment', '#any'],        slots: ['reading', '@visual', 'multiselect'] },
  // Programming / CS
  { id: 'code-walk',        name: 'Code walkthrough',       tags: ['#programming', '#cs', '#coding', '#software', '#logic'],        slots: ['reading', 'code', 'reading', '@question'] },
  { id: 'code-challenge',   name: 'Coding challenge',       tags: ['#programming', '#cs', '#coding', '#handson', '#assessment'],    slots: ['statement', 'codebox', 'askai'] },
  { id: 'debug-explain',    name: 'Debug & explain',        tags: ['#programming', '#debugging', '#cs', '#advanced', '#handson'],   slots: ['statement', 'code', '@question', 'askai'] },
  // Math / physics / data
  { id: 'math-concept',     name: 'Math concept',           tags: ['#math', '#algebra', '#physics', '#engineering', '#formula'],    slots: ['reading', 'formula', '@question'] },
  { id: 'math-solve',       name: 'Solve the problem',      tags: ['#math', '#physics', '#calculation', '#problem', '#exercise'],   slots: ['statement', 'formula', '@question'] },
  { id: 'worked-solution',  name: 'Worked solution',        tags: ['#math', '#physics', '#worked', '#stepbystep', '#problem'],      slots: ['statement', 'formula', 'reading', 'typed', 'askai'] },
  { id: 'scholar-stem',     name: 'Scholar STEM (dense)',   tags: ['#math', '#physics', '#advanced', '#dense', '#university'],      slots: ['statement', 'reading', 'reading', '@visual', 'reading', 'reading', '@question'] },
  { id: 'data-graph',       name: 'Read the graph',         tags: ['#math', '#statistics', '#economics', '#science', '#data'],      slots: ['reading', 'graph', '@question'] },
  { id: 'graph-analysis',   name: 'Graph analysis (deep)',  tags: ['#data', '#statistics', '#economics', '#analysis', '#science'],  slots: ['statement', 'reading', 'graph', 'reading', '@question'] },
  // History / humanities
  { id: 'history-narrative',name: 'History narrative',      tags: ['#history', '#humanities', '#timeline', '#culture', '#reading'], slots: ['statement', 'reading', 'image', 'reading', '@question'] },
  { id: 'source-analysis',  name: 'Source analysis (hard)', tags: ['#history', '#advanced', '#analysis', '#critical', '#humanities'],slots: ['statement', 'reading', 'image', 'reading', '@question', 'askai'] },
  // Language / ESL
  { id: 'simple-esl',       name: 'Simple ESL',             tags: ['#esl', '#beginner', '#simple', '#vocabulary', '#language'],     slots: ['reading', 'image', 'mcq'] },
  { id: 'esl-reading',      name: 'ESL reading + audio',    tags: ['#esl', '#language', '#vocabulary', '#reading', '#beginner'],    slots: ['statement', 'image', 'reading', 'audio', '@question'] },
  { id: 'listening',        name: 'Listening comprehension',tags: ['#esl', '#language', '#listening', '#audio', '#comprehension'],  slots: ['statement', 'audio', '@question'] },
  { id: 'grammar-table',    name: 'Grammar with a table',   tags: ['#grammar', '#language', '#esl', '#writing', '#rules'],          slots: ['reading', 'table', '@question'] },
  { id: 'script-practice',  name: 'Character practice',     tags: ['#language', '#japanese', '#chinese', '#handwriting', '#characters'],slots: ['statement', 'image', 'handwriting'] },
  { id: 'vocab-drill',      name: 'Vocabulary drill',       tags: ['#vocabulary', '#language', '#esl', '#memory', '#quick'],        slots: ['statement', 'image', 'audio', 'mcq'] },
  // Design / DIY / practical
  { id: 'design-critique',  name: 'Design critique',        tags: ['#design', '#art', '#ux', '#creative', '#visual'],              slots: ['statement', 'image', '@question', 'askai'] },
  { id: 'diy-howto',        name: 'DIY how-to',             tags: ['#diy', '#howto', '#practical', '#crafts', '#steps'],            slots: ['statement', 'image', 'reading', '@question'] },
  { id: 'menu-item',        name: 'Menu / catalog item',    tags: ['#menu', '#culinary', '#business', '#catalog', '#description'],  slots: ['statement', 'image', 'reading', 'action'] },
];

// Map a template slot (a component id OR a '@super-group') to the concrete Studio
// catalog id the per-slide editor materializes. Super-groups pick a sensible default
// (Question → multiple choice) that the creator can then swap; the slot's intent is
// carried into the component's instruction so the machine still knows the options.
const TPL_TO_CATALOG: Record<string, string> = {
  reading: 'reading', statement: 'reading', image: 'image', table: 'table', formula: 'latex',
  code: 'codeblock', audio: 'audio', graph: 'geogebra', mcq: 'mcq4', multiselect: 'mcq4',
  truefalse: 'mcq2', fill: 'fill-blank', typed: 'input', askai: 'input', codebox: 'code',
  handwriting: 'writing', annotation: 'annotation', action: 'button',
  '@text': 'reading', '@visual': 'image', '@question': 'mcq4', '@handson': 'code', '@audio': 'audio',
};
// Compact label for the per-slide "how it will be built" plan strip.
const CATALOG_SHORT: Record<string, string> = {
  reading: '📖 Text', image: '🖼 Image', table: '▦ Table', latex: '∑ Formula', codeblock: '{ } Code',
  audio: '🔊 Audio', geogebra: '📈 Graph', mcq4: '☑️ Multiple choice', mcq2: '⚖️ 2-option', 'fill-blank': '␣ Fill blank',
  input: '⌨️ Typed', code: '{_} Code box', writing: '✍️ Handwriting', annotation: '📝 Annotate', button: '🔳 Button', note: '💬 Note',
};
const planChip = (id: string) => CATALOG_SHORT[id] || (studioItem(id) ? `${studioItem(id)!.emoji} ${studioItem(id)!.name}` : id);
// Preset labels for the menu / navigation "action buttons".
const ACTION_PRESETS = ['Next', 'Back', 'Order', 'Skip', 'Continue', 'Add to cart'];

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
  // Title / Subject / Tone are kept SEPARATELY per artifact so a learning path can
  // give its Repository and its Presentation their own overall settings. The active
  // `title`/`subject`/`tone` (and setters) resolve to whichever artifact is selected,
  // so all downstream code keeps using them unchanged.
  const [repoTitle, setRepoTitle] = useState(seed?.title || '');
  const [presTitle, setPresTitle] = useState(seed?.title || '');
  const [repoSubject, setRepoSubject] = useState(seed?.subject || '');
  const [presSubject, setPresSubject] = useState(seed?.subject || '');
  const [repoTone, setRepoTone] = useState(seed?.tone || 'Friendly');
  const [presTone, setPresTone] = useState(seed?.tone || 'Friendly');
  const isRepo = artifact === 'repository';
  const title = isRepo ? repoTitle : presTitle;
  const setTitle = isRepo ? setRepoTitle : setPresTitle;
  const subject = isRepo ? repoSubject : presSubject;
  const setSubject = isRepo ? setRepoSubject : setPresSubject;
  const tone = isRepo ? repoTone : presTone;
  const setTone = isRepo ? setRepoTone : setPresTone;
  // The ⚙️ "overall settings" popup (per-artifact: shows whichever artifact is active).
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Tone is ONE field: a dropdown by default, flipped to a free-text box by the ✎
  // pencil (and back by ▾). It starts in custom mode only if the seeded tone isn't
  // one of the presets, so a hand-typed tone stays editable.
  const [toneCustom, setToneCustom] = useState(!!(seed?.tone && !TONES.includes(seed.tone)));
  const randomTone = () => setTone(TONES[Math.floor(Math.random() * TONES.length)]);
  // 🎨 palette "diffuser" — reword a field to a similar but different phrasing so
  // the author can shuffle it to taste.
  const [rewording, setRewording] = useState<'' | 'title' | 'subject' | 'tone'>('');
  // Rewords the DRAFT field inside the settings popup (applied on Update).
  const rewordField = async (kind: 'title' | 'subject' | 'tone') => {
    const cur = kind === 'title' ? dTitle : kind === 'subject' ? dSubject : dTone;
    if (!cur.trim() || rewording) return;
    setRewording(kind);
    try {
      const r: any = await API.post('/api/tools/reword', { text: cur, kind: kind === 'tone' ? 'generic' : kind, context: `${dTitle} ${dSubject}`.trim() });
      if (r?.text) { if (kind === 'title') setDTitle(r.text); else if (kind === 'subject') setDSubject(r.text); else setDTone(r.text); }
    } catch { /* ignore */ }
    setRewording('');
  };
  // A topic pick can hand us an AI-designed slide plan (seed.pages) to prefill the
  // Studio so the user reviews/edits the preset slides before generating.
  const [pages, setPages] = useState<StudioPage[]>(seed?.pages && seed.pages.length ? (seed.pages as StudioPage[]) : [newPage()]);
  const [addMenu, setAddMenu] = useState<number | null>(null);   // which slide's "＋ Add" menu is open
  useEffect(() => { appState.builderSeed = null; }, []);   // consume the seed once
  const [sourcePrompt, setSourcePrompt] = useState(seed?.sourcePrompt || seed?.context || '');
  // The ⚙️ settings popup edits a DRAFT (per artifact), applied only when the user
  // presses Update — so it reads like the paginated create wizard. Snapshot the
  // active values when it opens; write them back on Update; discard on close.
  const [setStep, setSetStep] = useState(0);
  const [dTitle, setDTitle] = useState('');
  const [dSubject, setDSubject] = useState('');
  const [dTone, setDTone] = useState('Friendly');
  const [dToneCustom, setDToneCustom] = useState(false);
  const [dPrompt, setDPrompt] = useState('');
  // Which slide components the AI may use and which template sequences it may follow.
  // Each template is an ordered list of component labels. These persist across opens
  // (they're a config, not a one-shot draft). On Update they become a config note fed
  // to the slide designer. `tplSeq` is the sequence currently being assembled from the
  // dropdown (Text first) before it's saved into the list.
  const [dTools, setDTools] = useState<string[]>([]);
  const [dTemplates, setDTemplates] = useState<SlideTemplate[]>(TEMPLATE_LIBRARY);
  const [tplSeq, setTplSeq] = useState<string[]>(['reading']); // slot tokens (Text first)
  const [configNote, setConfigNote] = useState('');
  const openSettings = () => {
    setDTitle(title); setDSubject(subject); setDTone(tone); setDToneCustom(toneCustom); setDPrompt(sourcePrompt);
    setSetStep(0); setSettingsOpen(true);
  };
  const applySettings = () => {
    setTitle(dTitle); setSubject(dSubject); setTone(dTone); setToneCustom(dToneCustom); setSourcePrompt(dPrompt);
    // Teach the generator HOW we compose presentations: text-first, super-components,
    // and the template library keyed by hashtags so it can match a pattern to the topic.
    const toolNote = dTools.length ? `Build the slides using ONLY these components: ${dTools.map(TOOL_SHORT).join(', ')}.` : '';
    const superNote = `SUPER-COMPONENTS — when a template slot names a group, pick the ONE member that best fits the subject: ${Object.values(SUPER_GROUPS).map((g) => `${g.label} = ${g.hint}`).join('; ')}.`;
    const tplNote = dTemplates.length
      ? `SLIDE TEMPLATES you MAY follow — match a template's #hashtags to the topic/level and adapt freely. RULES: every slide opens with text (a reading paragraph or a short statement/task); DEFAULT every check to multiple choice; use 🤖 Ask-AI as a lenient fallback for hard-to-grade or explain-style answers — the learner types OR says their answer with up to 3 tries and it PASSES if it is essentially correct even with minor errors; typed answers work as a fallback too; never use a code box outside programming; use audio for language/listening lessons; use a table to organize grammar/rules; use handwriting for character/sign practice; true/false and multi-select suit any subject; for dense/scholar topics stack more text and add extra questions to evaluate long passages. Templates: ${dTemplates.map((t) => `${t.name} [${t.tags.join(' ')}]: ${t.slots.map(SLOT_NOTE).join(' → ')}`).join(' | ')}`
      : '';
    setConfigNote([toolNote, superNote, tplNote].filter(Boolean).join('\n'));
    setSettingsOpen(false);
  };
  // The template library handed to the slide designer on every generation (not just
  // after Update), so the AI always builds slides FROM the templates — or a custom
  // one composed from the components when none fits.
  const templateGuideText = () => (dTemplates.length
    ? dTemplates.map((t) => `${t.name} [${t.tags.join(' ')}]: ${t.slots.map(SLOT_NOTE).join(' → ')}`).join(' | ')
    : '');
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
          docs: docsPayload(), cards: cardsToAi(repoCards), messages, lessonPath: lessonPathSeed,
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
          docs: docsPayload(), cards: cardsToAi(seed), messages, lessonPath: lessonPathSeed,
        }, { retries: 1 });
        const mapped = mapAiCards(r?.cards || []);
        if (mapped.length) setRepoCards(mapped);
        else setErr(r?.error || 'The AI did not return a plan. Add a goal, a document, or a card or two, then try again.');
      }
    } catch (e: any) { setErr(e?.message || 'Could not build a suggestion.'); }
    setSuggesting(false);
  };
  const [context, setContext] = useState(seed?.context || '');
  // Pre-build once when arriving from the chat composer: fill the editable cards via
  // Suggest-with-AI (no publish) so the owner can edit and confirm.
  const didAutoSuggest = useRef(false);
  useEffect(() => {
    if (!autoSuggestSeed || didAutoSuggest.current) return;
    if (artifact !== 'repository' || !context.trim()) return;
    didAutoSuggest.current = true;
    (async () => {
      await suggestWithAI();                          // pre-build the repo cards
      if (lessonPathSeed) await suggestPresentation(true);   // + the presentation slides
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggestSeed, artifact, context]);
  const [visibility] = useState('unlisted');
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
      : id === 'button' ? 'Button label (e.g. Next, Back, Order, Skip)'
      : SUP_IDS.includes(id) ? 'What should this show? (optional)'
      : EVAL_IDS.includes(id) ? 'What should this question test? (optional)'
      : 'Instruction for the AI (optional)';
    return { emoji: it?.emoji || '•', name: it?.name || id, ph };
  };
  // Materialize a template into a slide's stack: map each slot to a concrete
  // component and carry the slot's intent (short statement, lenient check, the
  // super-group's options) into that component's instruction so nothing is lost.
  const applyTemplate = (i: number, tplId: string) => {
    const tpl = TEMPLATE_LIBRARY.find((t) => t.id === tplId); if (!tpl) return;
    const comps: StudioComponent[] = tpl.slots.map((slot) => {
      const id = TPL_TO_CATALOG[slot] || 'reading';
      const it = studioItem(id);
      const opt = it?.sizes ? ANNOTATION_SIZES[1] : it?.button ? 'action' : undefined;
      let instr = '';
      if (slot === 'statement') instr = 'Short statement or task (1–2 sentences) — not a long paragraph.';
      else if (slot === 'action') instr = 'Next';
      else if (slot === 'multiselect') instr = 'Allow more than one correct option.';
      else if (slot === 'askai') instr = 'Lenient AI check: accept an answer that is essentially correct, up to 3 tries.';
      else if (slot.startsWith('@')) { const g = SUPER_GROUPS[slot.slice(1)]; if (g) instr = `The machine may use any of: ${g.members.map(TOOL_SHORT).join(' / ')} — swap below to pin one.`; }
      return { id, uid: mkUid(), instr, opt };
    });
    writeStack(i, comps);
  };
  // Add one menu / navigation action button (its label doubles as its instruction).
  const addButtonPreset = (i: number, label: string) => {
    writeStack(i, [...stackOf(pages[i]), { id: 'button', uid: mkUid(), instr: label, opt: 'action' }]);
    setAddMenu(null);
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
  // Targets the PRESENTATION bucket explicitly (not the active accessor), so it fills
  // the presentation's own title/subject even while the Repository view is active
  // during a Lesson-Path dual pre-build. `alsoSeedRepoTitle` copies the AI title to a
  // still-blank repo title so both artifacts arrive named.
  const suggestPresentation = async (alsoSeedRepoTitle = false) => {
    if (suggesting || busy) return;
    setSuggesting(true); setErr('');
    try {
      const editing = presSuggested && !nextCard;
      const r: any = await API.post('/api/tools/studio-design', {
        subject: presSubject || presTitle, title: presTitle, tone: presTone, provider,
        context: [context, configNote].filter(Boolean).join('\n'), docs: docsPayload(),
        templateGuide: templateGuideText(),
        mode: nextCard ? 'next' : editing ? 'edit' : 'suggest',
        existing: (nextCard || editing) ? pagesToDesign(pages) : undefined,
      }, { retries: 1 });
      const mapped = designToPages(r?.pages || []);
      if (mapped.length) {
        if (nextCard) setPages((ps) => [...ps, ...mapped]);   // append the new slide(s)
        else setPages(mapped);                                 // fresh or fully-edited deck
        // Fill the title/subject the AI proposed when the author left them blank.
        if (!presTitle.trim() && r?.title) { setPresTitle(String(r.title)); if (alsoSeedRepoTitle && !repoTitle.trim()) setRepoTitle(String(r.title)); }
        if (!presSubject.trim() && r?.subject) setPresSubject(String(r.subject));
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
  // Explicit per-artifact configs, so the bottom bar can publish the presentation,
  // the repository, or BOTH regardless of which tab is currently active.
  const presConfig = (): StudioConfig => ({ artifact: 'presentation', title: presTitle || repoTitle, subject: presSubject || repoSubject, tone: presTone, context, pages });
  const repoConfig = (): StudioConfig => ({ artifact: 'repository', title: repoTitle || presTitle, subject: repoSubject || presSubject, tone: repoTone, context, sourcePrompt, cards: repoCards, imageGen: false });
  // Publish the SLIDES as a playable presentation (runs studio-build for polish).
  const generatePresentation = async () => {
    if (busy || suggesting) return; setBusy(true); setErr('');
    try {
      const assembled = assembleDefinition(presConfig());
      const r = await API.post('/api/tools/studio-build', { definition: assembled, messages }, { retries: 1 });
      await publishDef(r?.definition || assembled, true, presConfig());
    } catch (e: any) { setErr(e?.message || 'Could not generate the presentation.'); }
    setBusy(false);
  };
  // Publish the CARDS as a repository (no AI — exactly what's in the tree).
  const generateRepository = async () => {
    if (busy || suggesting) return; setBusy(true); setErr('');
    try { await publishDef(assembleDefinition(repoConfig()), false, repoConfig()); }
    catch (e: any) { setErr(e?.message || 'Could not generate the repository.'); }
    setBusy(false);
  };
  // Publish BOTH (a lesson path): the repository first (no nav), then the
  // presentation (which navigates to the finished tool).
  const generateBoth = async () => {
    if (busy || suggesting) return; setBusy(true); setErr('');
    try {
      const repoDef: any = assembleDefinition(repoConfig()); repoDef.studioConfig = repoConfig();
      await API.post('/api/tools', { definition: repoDef, visibility, aiGenerated: false });
      const presAssembled = assembleDefinition(presConfig());
      const built = await API.post('/api/tools/studio-build', { definition: presAssembled, messages }, { retries: 1 });
      await publishDef(built?.definition || presAssembled, true, presConfig());
    } catch (e: any) { setErr(e?.message || 'Could not generate both.'); }
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
    const val = kind === 'title' ? dTitle : kind === 'subject' ? dSubject : dTone;
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>WHAT ARE YOU MAKING?</div>
              <button type="button" title={`${isRepo ? 'Repository' : 'Presentation'} settings — title, subject, tone, prompt`} aria-label="Overall settings"
                onClick={openSettings} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>⚙️</button>
            </div>
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

          {/* The OVERALL settings (title / subject / tone / prompt) now live in the ⚙️
              popup opened from the artifact selector — per artifact. */}
          {settingsOpen && (
            <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '4vh 12px' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: SETUP_CARD_WIDTH, maxWidth: '100%', margin: '4vh 0' }}>
                {/* Paginated — one setting per page in the SAME fixed-dimension card
                    (photo spot + buttons + inputs) as the create wizard; changes apply
                    only when you press Update on the last page. */}
                {(() => {
                  const fieldWrap: React.CSSProperties = { width: '100%', margin: 0 };
                  // Same input sizing/padding as the slide-tool wizard fields.
                  const ctl: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: '1.05rem', lineHeight: 1.2 };
                  const chip = (active: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '4px 10px', borderRadius: 999, border: '2px solid var(--ink,#2d2a26)', background: active ? 'var(--green,#7fb069)' : 'transparent', color: active ? '#fff' : 'var(--ink,#2d2a26)' });
                  const titleField = (
                    <label className="field" style={fieldWrap}><span style={labelRow}>Title {paletteBtn('title')}</span>
                      <input type="text" value={dTitle} placeholder="Name your tool" onChange={(e) => setDTitle(e.target.value)} style={ctl} />
                    </label>
                  );
                  const subjectField = (
                    <label className="field" style={fieldWrap}><span style={labelRow}>Subject / topic {paletteBtn('subject')}</span>
                      <input type="text" value={dSubject} placeholder={isRepo ? 'e.g. Small Payment System' : 'e.g. Trigonometry'} onChange={(e) => setDSubject(e.target.value)} style={ctl} />
                    </label>
                  );
                  const toneField = (
                    <label className="field" style={fieldWrap}><span style={labelRow}>Tone
                      <button type="button" className="btn small ghost" style={miniBtn}
                        title={dToneCustom ? 'Pick from the list' : 'Type a custom tone'}
                        onClick={() => setDToneCustom((c) => { const next = !c; if (!next && !TONES.includes(dTone)) setDTone(TONES[0]); return next; })}>{dToneCustom ? '▾' : '✎'}</button>
                      <button type="button" className="btn small ghost" style={miniBtn} title="Roll a random tone" onClick={() => setDTone(TONES[Math.floor(Math.random() * TONES.length)])}>🎲</button>
                      {paletteBtn('tone')}
                    </span>
                      {dToneCustom
                        ? <input type="text" value={dTone} placeholder="Type a custom tone…" onChange={(e) => setDTone(e.target.value)} style={ctl} />
                        : <select value={TONES.includes(dTone) ? dTone : TONES[0]} onChange={(e) => setDTone(e.target.value)} style={ctl}>
                            {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>}
                    </label>
                  );
                  const promptField = (
                    <label className="field" style={fieldWrap}><span style={labelRow}>Original prompt</span>
                      <textarea value={dPrompt} placeholder={isRepo ? 'Describe the repository, the topics it should cover, and the structure of the cards…' : 'Describe the lesson / deck this presentation should teach…'} onChange={(e) => setDPrompt(e.target.value)} style={{ ...ctl, minHeight: 150, resize: 'vertical' }} />
                    </label>
                  );
                  // Grouped, multi-select component picker (the "Add to slide" menu).
                  const toolsField = (
                    <div style={{ width: '100%' }}>
                      <span style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>🧰 Components the AI may use{dTools.length ? ` (${dTools.length})` : ''}</span>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {SLIDE_TOOL_SECTIONS.map((sec) => (
                          <div key={sec.title}>
                            <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 4px' }}>{sec.title}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {sec.items.map((it) => {
                                const on = dTools.includes(it.id);
                                return <button key={it.id} type="button" style={chip(on)} onClick={() => setDTools((cur) => on ? cur.filter((x) => x !== it.id) : [...cur, it.id])}>{it.label}</button>;
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                  // A template slot chip. Super-component slots (dashed) show the members
                  // the AI may pick from; single-component slots are a solid chip.
                  const slotChip = (slot: string) => {
                    const grp = isGroupSlot(slot);
                    return (
                      <span title={grp ? `Pick one: ${SLOT_MEMBERS(slot)}` : undefined}
                        style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15, textAlign: 'center',
                          fontSize: 11, border: grp ? '1.5px dashed var(--ink,#2d2a26)' : '1.5px solid var(--ink,#2d2a26)',
                          borderRadius: 6, padding: '2px 6px', background: grp ? 'rgba(45,42,38,0.06)' : 'transparent' }}>
                        <span style={{ fontWeight: grp ? 700 : 400 }}>{SLOT_LABEL(slot)}</span>
                        {grp && <span style={{ fontSize: 8.5, opacity: 0.6, whiteSpace: 'nowrap' }}>{SLOT_MEMBERS(slot)}</span>}
                      </span>
                    );
                  };
                  const arrow = (last: boolean) => (!last ? <span style={{ opacity: 0.5 }}>→</span> : null);
                  const seqDiagram = (slots: string[]) => (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {slots.map((s, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{slotChip(s)}{arrow(i === slots.length - 1)}</span>)}
                    </div>
                  );
                  const templatesField = (
                    <div style={{ width: '100%' }}>
                      <span style={{ display: 'block', marginBottom: 3, fontWeight: 700 }}>🧩 Slide templates the AI can follow{dTemplates.length ? ` (${dTemplates.length})` : ''}</span>
                      <div style={{ fontSize: 10.5, opacity: 0.62, marginBottom: 6 }}>Dashed slots are super-components — the AI picks the member that best fits the subject. The #hashtags tell it when each template is a good fit.</div>
                      {/* Build your own: pick components OR super-components; they chain in order (Text first). */}
                      <select value="" onChange={(e) => { if (e.target.value) { setTplSeq((s) => [...s, e.target.value]); e.target.value = ''; } }} style={{ ...ctl, marginBottom: 6 }}>
                        <option value="">＋ Add a step to a new template…</option>
                        <optgroup label="Super-components (AI picks one)">
                          {Object.keys(SUPER_GROUPS).map((k) => <option key={k} value={`@${k}`}>{SUPER_GROUPS[k].label} — {SUPER_GROUPS[k].members.map(TOOL_SHORT).join(' / ')}</option>)}
                        </optgroup>
                        {SLIDE_TOOL_SECTIONS.map((sec) => (
                          <optgroup key={sec.title} label={sec.title}>
                            {sec.items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', minHeight: 32 }}>
                        {tplSeq.length === 0
                          ? <span style={{ fontSize: 11, opacity: 0.5 }}>Pick steps above — they chain in order. Start with text.</span>
                          : tplSeq.map((s, i) => (
                              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                {slotChip(s)}
                                <button type="button" onClick={() => setTplSeq((cur) => cur.filter((_, j) => j !== i))} title="Remove" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10, opacity: 0.6, padding: 0 }}>✕</button>
                                {arrow(i === tplSeq.length - 1)}
                              </span>
                            ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, margin: '6px 0 10px' }}>
                        <button type="button" className="btn small green" disabled={tplSeq.length === 0} onClick={() => { const n = dTemplates.filter((t) => t.id.startsWith('custom-')).length + 1; setDTemplates((cur) => [...cur, { id: `custom-${Date.now()}`, name: `Custom ${n}`, tags: [], slots: tplSeq }]); setTplSeq(['reading']); }}>＋ Add template</button>
                        {tplSeq.length > 0 && <button type="button" className="btn small ghost" onClick={() => setTplSeq([])}>Clear</button>}
                      </div>
                      {/* The library — every pattern handed to the AI. Delete any with ✕. */}
                      <div style={{ display: 'grid', gap: 6 }}>
                        {dTemplates.map((t) => (
                          <div key={t.id} style={{ border: '2px solid var(--ink,#2d2a26)', borderRadius: 8, padding: '6px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 0 }}>{t.name}</span>
                              <button type="button" className="btn small ghost" style={{ minWidth: 28, padding: '0 6px' }} title="Delete template" onClick={() => setDTemplates((cur) => cur.filter((x) => x.id !== t.id))}>✕</button>
                            </div>
                            {t.tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>{t.tags.map((tag) => <span key={tag} style={{ fontSize: 9.5, opacity: 0.72, border: '1px solid var(--ink,#2d2a26)', borderRadius: 20, padding: '0 6px' }}>{tag}</span>)}</div>}
                            {seqDiagram(t.slots)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                  const updateBtn = <button className="btn small green" style={{ width: 96, height: 40, whiteSpace: 'nowrap' }} onClick={applySettings}>✓ Update</button>;
                  const LAST = 4;
                  const goN = () => setSetStep((s) => Math.min(LAST, s + 1));
                  const goB = () => setSetStep((s) => Math.max(0, s - 1));
                  const sSteps: WizardStep[] = [
                    { key: 'basics', title: 'Title & subject', render: () => <WizardGridTemplate top={titleField} bottom={subjectField} onNext={goN} onBack={goB} backDisabled={setStep === 0} /> },
                    { key: 'tone', title: 'Tone', render: () => <WizardGridTemplate top={toneField} onNext={goN} onBack={goB} backDisabled={setStep === 0} /> },
                    { key: 'tools', title: 'Slide components', render: () => <WizardGridTemplate tall top={toolsField} onNext={goN} onBack={goB} backDisabled={setStep === 0} /> },
                    { key: 'templates', title: 'Slide templates', render: () => <WizardGridTemplate tall top={templatesField} onNext={goN} onBack={goB} backDisabled={setStep === 0} /> },
                    { key: 'prompt', title: 'Original prompt', render: () => <WizardGridTemplate tall top={promptField} onBack={goB} backDisabled={setStep === 0} rightTop={updateBtn} /> },
                  ];
                  return (
                    <SetupWizardCard
                      title={<span style={{ fontSize: 15 }}>⚙️ {isRepo ? '🗂️ Repository' : '📊 Presentation'} settings</span>}
                      onClose={() => setSettingsOpen(false)}
                      steps={sSteps}
                      stepIndex={setStep}
                      onStepChange={setSetStep}
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {artifact === 'presentation' ? (
            <>
              {/* SLIDES — each slide is an ORDERED sequence of components the lesson
                  machine fills from the prompt. Start a slide from a subject-matched
                  template, read the plan strip to see how it will be built, then
                  customize: swap components, reorder, or add menu action buttons. */}
              <div style={{ margin: '0 2px 6px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>SLIDES ({pages.length}) — how the lesson machine will build each slide</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>Every slide is a sequence of components filled from your prompt. Start from a template (matched to your subject by #hashtags), then customize. Text always comes first.</div>
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

                    {/* Built from — apply a subject-matched template to lay out this slide. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.6 }}>Built from</span>
                      <select value="" onChange={(e) => { if (e.target.value) { applyTemplate(i, e.target.value); e.currentTarget.value = ''; } }}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1.5px solid var(--ink)', maxWidth: 280 }}>
                        <option value="">✦ Apply a template…</option>
                        {TEMPLATE_LIBRARY.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.tags.slice(0, 3).join(' ')}</option>)}
                      </select>
                    </div>

                    {/* Plan strip — the exact order the machine will assemble this slide. */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginBottom: 8, padding: '6px 8px', borderRadius: 8, background: 'rgba(45,42,38,0.05)' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.55, marginRight: 2 }}>🛠 Machine will build:</span>
                      {stack.length === 0
                        ? <span style={{ fontSize: 11, opacity: 0.5 }}>empty — add components or apply a template</span>
                        : stack.map((c, k) => (
                            <span key={c.uid || c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10.5, border: '1.5px solid var(--ink)', borderRadius: 6, padding: '1px 6px', background: 'var(--paper,#fbf7ee)' }}>{planChip(c.id)}</span>
                              {k < stack.length - 1 && <span style={{ opacity: 0.4 }}>→</span>}
                            </span>
                          ))}
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
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                            {EVAL_CHIPS.map((s) => <span key={s.id} onClick={() => addEl(i, s.id)} style={chipSt(false)}>{s.label}</span>)}
                          </div>
                          {/* Menu / navigation buttons — e.g. Next · Back · Order · Skip
                              (great for menus and choose-your-path slides, not a graded quiz). */}
                          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>Menu / action buttons</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {ACTION_PRESETS.map((label) => <span key={label} onClick={() => addButtonPreset(i, label)} style={chipSt(false)}>🔳 {label}</span>)}
                            <span onClick={() => addButtonPreset(i, '')} style={chipSt(false)}>🔳 Custom button…</span>
                          </div>
                        </div>
                      ) : (
                        <button className="btn small" onClick={() => setAddMenu(i)}>＋ Add reading · support · evaluation · buttons</button>
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
                <button type="button" className="btn small blue" disabled={busy || suggesting} onClick={() => suggestPresentation()}
                  title={nextCard ? 'Add ONE next slide after the current deck.'
                    : presSuggested ? 'Modify the slides with AI — type an instruction (and/or attach a document) and it reloads the slides. It can change ONE slide (“make slide 3 harder”), add to ALL (“add a hint to every slide”), add/remove slides, rebuild from other components, or redesign the whole deck.'
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
            {/* Model picker — "Auto" tries the configured models in order (falls over on a 503). */}
            {textProviders.length > 0 && (
              <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Model</span>
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="auto">Auto</option>
                  {textProviders.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select></label>
            )}
            {editSlug ? (
              /* Editing an existing tool: one Update button for the active artifact. */
              <button className="btn green" disabled={busy || suggesting} onClick={generate}>{busy ? genBusyLabel : genLabel}</button>
            ) : (
              /* Choose WHAT to publish — the repository, the presentation, or both
                 (a lesson path: a repo plus its playable slide deck). */
              <>
                <button className="btn ghost" disabled={busy || suggesting} onClick={generateRepository}
                  title="Publish the cards above as a repository / collection.">{busy ? genBusyLabel : '📁 Generate repository'}</button>
                <button className="btn green" disabled={busy || suggesting} onClick={generatePresentation}
                  title="Publish the slides above as a playable presentation.">{busy ? genBusyLabel : '📊 Generate presentation'}</button>
                <button className="btn blue" disabled={busy || suggesting} onClick={generateBoth}
                  title="Publish BOTH — a repository AND its presentation (a lesson path).">{busy ? genBusyLabel : '🎬 Generate both'}</button>
              </>
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
