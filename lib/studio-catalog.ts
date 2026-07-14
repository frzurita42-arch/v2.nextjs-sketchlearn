/* The Studio component catalog: the palette a user visually assembles a tool
 * from. Each component maps declaratively to the existing Tool Definition —
 * an activity type, a support-material flag, an app entry field, or a language
 * feature — plus a free-text "how to use it" instruction that is compiled into
 * the lesson's style so the generator honours it. assembleDefinition() turns a
 * Studio config into a valid ToolDefinition (a slide presentation OR a
 * repository/collection). */

export type ArtifactKind = 'presentation' | 'repository';

export interface StudioItem {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  activity?: string;                 // -> lesson.activityTypes
  support?: 'images' | 'code' | 'tables' | 'formulas' | 'audio' | 'geogebra';   // -> lesson.support
  language?: boolean;                // marks the lesson as a language lesson
  field?: { id: string; label: string; type: string; options?: string[] };  // repository entry field
  sizes?: boolean;                   // component offers a size choice (annotation pad)
  note?: boolean;                    // pure custom instruction (a comment for the AI)
  linkField?: boolean;              // shows a reference image/link input (e.g. image gen)
  requires?: string;                // capability path in /api/config caps (e.g. 'music', 'providers.grok')
  deco?: boolean;                   // a decoration (link / personalized message), not an activity
  reading?: boolean;                // a reading passage (its length follows the slide's paragraph settings)
  tmpl?: boolean;                   // a custom layout template ("1x2(2x2)") typed into instr
  button?: boolean;                 // an action button; instr = label/message, opt = action
}

// What a Button component does when tapped.
export const BUTTON_ACTIONS: { key: string; label: string }[] = [
  { key: 'ask', label: 'Ask the AI (about this lesson)' },
  { key: 'results', label: 'Show my results' },
  { key: 'action', label: 'Custom action / open a link' },
];

// Parse a custom template spec like "1x2(2x2)": rows×cols, optionally followed by
// parenthesised sub-templates that fill successive cells (recursively). Returns a
// human description for the generator, and whether it's valid. Kept small: rows/
// cols 1..6, nesting depth <= 3.
export function parseTemplateSpec(spec: string, depth = 0): { ok: boolean; desc: string } {
  const s = String(spec || '').trim();
  const m = s.match(/^(\d+)\s*[x×]\s*(\d+)/i);
  if (!m) return { ok: false, desc: '' };
  const rows = +m[1], cols = +m[2];
  if (rows < 1 || rows > 6 || cols < 1 || cols > 6 || depth > 3) return { ok: false, desc: '' };
  let rest = s.slice(m[0].length).trim();
  const subs: string[] = [];
  while (rest.startsWith('(')) {
    let d = 0, i = 0;
    for (; i < rest.length; i++) { if (rest[i] === '(') d++; else if (rest[i] === ')') { d--; if (d === 0) { i++; break; } } }
    if (d !== 0) return { ok: false, desc: '' };            // unbalanced
    const sub = parseTemplateSpec(rest.slice(1, i - 1), depth + 1);
    if (!sub.ok) return { ok: false, desc: '' };
    subs.push(sub.desc);
    rest = rest.slice(i).trim();
  }
  if (rest) return { ok: false, desc: '' };                 // trailing junk
  let desc = `${rows}×${cols} grid (${rows} row${rows > 1 ? 's' : ''} × ${cols} column${cols > 1 ? 's' : ''})`;
  if (subs.length) desc += `, with a nested layout in ${subs.length} cell${subs.length > 1 ? 's' : ''} — ${subs.map((d2, i) => `cell ${i + 1}: ${d2}`).join('; ')}`;
  return { ok: true, desc };
}

// Read a dotted capability path from the /api/config caps object.
export function capAvailable(caps: any, path?: string): boolean {
  if (!path) return true;
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), caps) === true;
}

export interface StudioCategory { id: string; label: string; for: ArtifactKind | 'both'; items: StudioItem[]; }

// The three annotation-pad sizes, each a full pad with pen/colours/text.
// (The old cramped "Small (quarter)" option was dropped — it had no room for the
// colour + text toolbar.) The label's leading keyword maps to a pad size below.
export const ANNOTATION_SIZES = ['Large (full page)', 'Medium (half height)', 'Adaptive (taller / shorter)'];

// Map an ANNOTATION_SIZES label to the AnnotationPad size key.
export function annotationSizeKey(label?: string): 'large' | 'medium' | 'adaptive' {
  const s = String(label || '').toLowerCase();
  if (s.startsWith('large')) return 'large';
  if (s.startsWith('medium')) return 'medium';
  return 'adaptive';
}

export const STUDIO_CATEGORIES: StudioCategory[] = [
  {
    id: 'activities', label: '🎯 Activities (how the learner answers)', for: 'presentation', items: [
      { id: 'reading', emoji: '📖', name: 'Reading passage', desc: 'A passage to read; its length follows this slide’s paragraph settings.', reading: true },
      { id: 'mcq4', emoji: '🔘', name: 'Multiple choice — 4 options', desc: 'One question with 4 options (one correct). Add several for several questions.', activity: 'mcq4' },
      { id: 'mcq2', emoji: '⚖️', name: 'Multiple choice — 2 options', desc: 'One question with 2 options (e.g. true/false). Add several for several questions.', activity: 'mcq2' },
      { id: 'fill-blank', emoji: '✏️', name: 'Fill in the blank', desc: 'A sentence with a missing word to type.', activity: 'fill-blank' },
      { id: 'input', emoji: '⌨️', name: 'Typed answer (AI-checked)', desc: 'The learner types their own answer; the AI judges it.', activity: 'input' },
      { id: 'annotation', emoji: '📝', name: 'Annotation / worked answers', desc: 'Write the full answer by hand on a paper pad; the AI grades it.', activity: 'annotation', sizes: true },
      { id: 'code', emoji: '💻', name: 'Code / text box (AI-checked)', desc: 'Answer in a code/text box; the AI grades it.', activity: 'code' },
      { id: 'writing', emoji: '🖊️', name: 'Handwriting a character', desc: 'Trace/write a single character; the AI checks it.', activity: 'writing' },
    ],
  },
  {
    id: 'media', label: '🧮 Math & media (what the slide shows)', for: 'presentation', items: [
      { id: 'image', emoji: '🖼️', name: 'AI image / diagram', desc: 'A generated picture or labelled diagram (triangle, free-body sketch…).', support: 'images', linkField: true },
      { id: 'table', emoji: '📊', name: 'Table', desc: 'A table of data, steps, or comparisons.', support: 'tables' },
      { id: 'wolfram', emoji: '⚡', name: 'Wolfram step-by-step', desc: 'Solve equations with worked steps (uses the Wolfram key).', support: 'formulas', requires: 'wolfram' },
      { id: 'latex', emoji: '∑', name: 'LaTeX formula', desc: 'A cleanly typeset formula.', support: 'formulas' },
      { id: 'geogebra', emoji: '📐', name: 'GeoGebra graph', desc: 'An interactive GeoGebra plot / math visual (functions, geometry, vectors…).', support: 'geogebra' },
      { id: 'codeblock', emoji: '🧾', name: 'Code snippet', desc: 'A code / pseudocode block (great for math working).', support: 'code' },
      { id: 'music', emoji: '🎵', name: 'Music / sound (ElevenLabs)', desc: 'Generate background music or a sound clip. Needs the music integration.', requires: 'music' },
      { id: 'news', emoji: '📰', name: 'Latest news', desc: 'Pull recent headlines into the slide. Needs a news API key.', requires: 'news' },
    ],
  },
  {
    id: 'ai', label: '🤖 AI endpoint (which model writes it)', for: 'both', items: [
      { id: 'ai-grok', emoji: '🐦', name: 'Grok (xAI)', desc: 'Use Grok to generate. Enabled via OpenRouter or an xAI key.', requires: 'providers.grok' },
      { id: 'ai-gemini', emoji: '✨', name: 'Gemini (Google)', desc: 'Use Gemini to generate.', requires: 'providers.gemini' },
      { id: 'ai-anthropic', emoji: '📚', name: 'Claude (Anthropic)', desc: 'Use Claude to generate.', requires: 'providers.anthropic' },
      { id: 'ai-openai', emoji: '🟢', name: 'GPT (OpenAI)', desc: 'Use GPT to generate.', requires: 'providers.openai' },
      { id: 'ai-deepseek', emoji: '🐋', name: 'DeepSeek', desc: 'Use DeepSeek to generate.', requires: 'providers.deepseek' },
      { id: 'ai-kimi', emoji: '🌙', name: 'Kimi (Moonshot)', desc: 'Use Kimi to generate.', requires: 'providers.kimi' },
    ],
  },
  {
    id: 'layout', label: '🧩 Layout & actions', for: 'both', items: [
      { id: 'custom-template', emoji: '🧩', name: 'Custom template', desc: 'Type a grid like 1x2(2x2): rows×cols, with an optional nested (rows×cols) inside a cell.', tmpl: true },
      { id: 'button', emoji: '🔳', name: 'Button (action)', desc: 'A button that shows results, asks the AI, or runs a custom action. Set its label/message and pick what it does.', button: true },
    ],
  },
  {
    id: 'extras', label: '💬 Extras', for: 'both', items: [
      { id: 'note', emoji: '💬', name: 'Custom instruction (comment)', desc: 'A free note telling the AI exactly what to do on this slide.', note: true },
    ],
  },
  {
    id: 'decorations', label: '🎨 Decorations (links & messages)', for: 'both', items: [
      { id: 'deco-coffee', emoji: '☕', name: 'Coffee cup (donation link)', desc: 'A clickable coffee cup that opens your donation / support link.', deco: true, linkField: true },
      { id: 'deco-note', emoji: '🗒️', name: 'Sticky note (message)', desc: 'A sticky note showing a personalized message.', deco: true },
      { id: 'deco-banner', emoji: '🎌', name: 'Banner (headline message)', desc: 'A banner across the slide with your message.', deco: true },
      { id: 'deco-hint', emoji: '✏️', name: 'Hint pencil', desc: 'A pencil the learner taps to reveal a hint message.', deco: true },
      { id: 'deco-tv', emoji: '📺', name: 'Mini-TV (YouTube embed)', desc: 'A small embedded YouTube video from a link.', deco: true, linkField: true },
    ],
  },
  {
    id: 'language', label: '🗣️ Language', for: 'presentation', items: [
      { id: 'audio', emoji: '🔊', name: 'Listening / speak aloud', desc: 'The content is spoken aloud (text-to-speech).', support: 'audio', language: true },
      { id: 'translate', emoji: '🌐', name: 'Translation', desc: 'A translate button on the content.', language: true },
    ],
  },
  {
    id: 'fields', label: '🗂️ Items (what each entry holds)', for: 'repository', items: [
      { id: 'f-image', emoji: '🖼️', name: 'Photo / image', desc: 'Upload a picture (stored in the blob store).', field: { id: 'image', label: 'Photo', type: 'image' } },
      { id: 'f-file', emoji: '📎', name: 'PDF / file link', desc: 'A link to a PDF or file.', field: { id: 'file', label: 'File / PDF link', type: 'text' } },
      { id: 'f-title', emoji: '🔤', name: 'Title', desc: 'A short title.', field: { id: 'title', label: 'Title', type: 'text' } },
      { id: 'f-desc', emoji: '📝', name: 'Description', desc: 'A longer text description.', field: { id: 'description', label: 'Description', type: 'textarea' } },
      { id: 'f-link', emoji: '🔗', name: 'Link', desc: 'A URL.', field: { id: 'link', label: 'Link', type: 'text' } },
      { id: 'f-category', emoji: '🏷️', name: 'Category / tag', desc: 'A category the poster picks.', field: { id: 'category', label: 'Category', type: 'select-or-custom', options: ['General', 'A', 'B', 'C'] } },
      { id: 'f-date', emoji: '📅', name: 'Date', desc: 'A date field.', field: { id: 'date', label: 'Date', type: 'date' } },
      { id: 'f-sketch', emoji: '✍️', name: 'Saved drawing / annotation', desc: 'A sketch saved from the annotation pad.', field: { id: 'sketch', label: 'Sketch', type: 'drawing' } },
    ],
  },
];

export function studioItem(id: string): StudioItem | undefined {
  for (const c of STUDIO_CATEGORIES) { const it = c.items.find((i) => i.id === id); if (it) return it; }
  return undefined;
}

// `id` is the catalog item id (e.g. "reading"); `uid` is a unique per-placement
// instance id so the SAME component can be added multiple times to a section.
export interface StudioComponent { id: string; uid?: string; instr?: string; opt?: string; link?: string; }
// A LAYOUT block is a templated area (a suggested rows×cols arrangement) that
// holds one or more components. A slide is built from a STACK of layout blocks,
// so the user can scroll down a slide through several templated sections.
export interface StudioLayout { template?: string; components: StudioComponent[]; }
// A presentation is a list of PAGES; each page = one slide made of stacked
// layout blocks plus its text density. (Legacy pages may carry a flat
// `components` list + single `template`; the assembler still reads those.)
export interface StudioPage { layouts?: StudioLayout[]; components?: StudioComponent[]; length?: 'brief' | 'medium' | 'detailed'; paragraphs?: number; template?: string; }

// Suggested rows×columns layouts for a slide/section. It's only a SUGGESTION —
// the generator arranges for best readability on the activity screen.
export const LAYOUT_TEMPLATES: { key: string; label: string }[] = [
  { key: 'auto', label: 'Auto (AI decides)' },
  { key: '1x1', label: '1×1 — single block' },
  { key: '2x1', label: '2×1 — two rows (stacked)' },
  { key: '1x2', label: '1×2 — two columns (side by side)' },
  { key: '2x2', label: '2×2 — grid' },
  { key: '3x1', label: '3×1 — three rows' },
];
export function layoutHint(key?: string): string {
  const map: Record<string, string> = {
    '1x1': 'Suggested layout: 1×1 — one component filling the section.',
    '2x1': 'Suggested layout: 2×1 — two components stacked in one column (e.g. text above, annotation below).',
    '1x2': 'Suggested layout: 1×2 — two components side by side in one row (e.g. an image next to text).',
    '2x2': 'Suggested layout: 2×2 — a grid of four components.',
    '3x1': 'Suggested layout: 3×1 — three components stacked in one column.',
  };
  const h = map[String(key || '')];
  return h ? `${h} This is only a suggestion — arrange the section for the clearest, most usable display on the activity screen, adding more sections below if needed.` : '';
}
// A repository is a tree of saved link/resource cards. Each card has a name, an
// attachment / Drive link and a description — and may nest child cards inside it
// (the same logic, one layer deeper), so the owner can build layered collections.
export interface RepoCard { name: string; link: string; description: string; children?: RepoCard[]; }
export interface StudioConfig {
  artifact: ArtifactKind;
  title?: string;
  subject?: string;
  tone?: string;
  pages?: StudioPage[];              // presentation: one entry per slide
  components?: StudioComponent[];    // (legacy) repository item fields
  cards?: RepoCard[];                // repository: the starter link/resource cards
  context?: string;
  display?: 'cards' | 'list' | 'table';
}

// Compile a page's components into { activityTypes, support, language, styleLines }.
function compilePage(comps: StudioComponent[]) {
  const activities: string[] = [];
  const support: any = { images: false, code: false, tables: false, formulas: false, audio: false };
  let language = false;
  let reading = false;
  let padSize: 'large' | 'medium' | 'adaptive' | undefined;
  const decorations: { kind: string; message: string; link: string; action?: string }[] = [];
  const lines: string[] = [];
  const providers: string[] = [];
  for (const c of comps) {
    const it = studioItem(c.id); if (!it) continue;
    // NOTE: activities are kept in order WITH duplicates — each placed question
    // component becomes its own question on the slide (two MCQ-4 → two questions).
    if (it.activity) activities.push(it.activity);
    if (it.reading) reading = true;
    if (it.support) support[it.support] = true;
    if (it.language) language = true;
    const how = String(c.instr || '').trim();
    const link = String(c.link || '').trim();
    if (it.note) { if (how) lines.push(`• Note: ${how}`); continue; }
    if (it.tmpl) {
      const t = parseTemplateSpec(how);
      if (t.ok) lines.push(`• LAYOUT TEMPLATE — arrange this section as a ${t.desc}. Place the section's other components into these cells in order; keep it readable on the activity screen.`);
      else if (how) lines.push(`• Note (layout): the author asked for a template "${how}".`);
      continue;
    }
    if (it.button) { decorations.push({ kind: 'button', message: how, link, action: String(c.opt || 'ask') }); lines.push(`• Button — ${how ? `“${how}”` : 'action button'} (${c.opt || 'ask'}).`); continue; }
    if (it.deco) { decorations.push({ kind: it.id.replace('deco-', ''), message: how, link }); lines.push(`• Decoration — ${it.name}${how ? `: “${how}”` : ''}${link ? ` (${link})` : ''}`); continue; }
    if (it.id.startsWith('ai-')) { providers.push(it.name); continue; }
    const size = it.sizes && c.opt ? ` [${c.opt}]` : '';
    if (it.sizes) padSize = annotationSizeKey(c.opt);   // the pad size for this slide
    const ref = it.linkField && link ? ` (reference: ${link})` : '';
    lines.push(`• ${it.name}${size}${ref}${how ? `: ${how}` : ''}`);
  }
  if (providers.length) lines.push(`• Preferred AI model: ${providers.join(', ')}`);
  return { activities, support, language, reading, lines, padSize, decorations };
}

function inferKind(subject: string, language: boolean): string {
  const s = subject.toLowerCase();
  if (/\b(math|algebra|calculus|geometry|trig|physics|chemistry|chemical|equation|mechanics)\b/.test(s)) return 'math';
  if (/\b(program|coding|code|python|javascript|java|software|algorithm|sql|rust)\b/.test(s)) return 'programming';
  if (language || /\b(french|spanish|german|italian|japanese|chinese|mandarin|arabic|hindi|english|language)\b/.test(s)) return 'language';
  return 'general';
}

// Turn a Studio config into a ToolDefinition-shaped object (validate before use).
export function assembleDefinition(cfg: StudioConfig): any {
  const title = String(cfg.title || cfg.subject || 'My tool').slice(0, 70);
  const context = String(cfg.context || '').trim();

  if (cfg.artifact === 'repository') {
    // A repository is a TREE of link/resource cards. Each card the owner designs
    // (name + attachment/Drive link + description) becomes a repo card; cards may
    // nest child cards inside them (the same shape, one layer inward). Published as
    // the `repo` archetype, RepoView renders the layered cards with link buttons.
    let seq = 0;
    const toRepoCard = (c: RepoCard): any => {
      const links = c.link && c.link.trim() ? [{ label: 'Attachment', url: c.link.trim() }] : [];
      const kids = (c.children || []).filter((k) => (k.name || k.link || k.description || (k.children || []).length)).map(toRepoCard);
      return {
        id: `c${(seq++).toString(36)}`, kind: 'card',
        title: (c.name || 'Untitled').trim().slice(0, 120),
        text: (c.description || '').trim().slice(0, 2000),
        links, children: kids.length ? kids : undefined,
      };
    };
    const cards = (cfg.cards || []).filter((c) => (c.name || c.link || c.description || (c.children || []).length)).map(toRepoCard);
    return {
      version: 1, archetype: 'repo', title: `Collection — ${title}`.slice(0, 70),
      description: context || `A layered collection of links & resources: ${cfg.subject || title}`,
      tags: ['collection', 'repository', 'studio'], settings: [],
      // Collections always stack vertically (bars) — no grid — and the page shows a
      // gallery-style filter toolbar over the cards.
      repo: {
        layout: 'post', display: 'bars',
        cards: cards.length ? cards : [{ id: 'c0', kind: 'card', title: title || 'Card 1', links: [] }],
      },
    };
  }

  // presentation -> lesson, one slide per page.
  const rawPages = cfg.pages && cfg.pages.length ? cfg.pages : [{ components: [], length: 'medium' as const, paragraphs: 1 }];
  const clamp = (n: any, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, parseInt(n, 10) || d));
  let anyLang = false;
  const unionActs = new Set<string>();
  const unionSupport: any = { images: false, code: false, tables: false, formulas: false, audio: false, geogebra: false };
  const allLines: string[] = [];
  const pages = rawPages.map((pg, i) => {
    // A page is a STACK of layout blocks; legacy pages carry a flat component
    // list, which we treat as a single block using the page's old template.
    const blocks: StudioLayout[] = (Array.isArray(pg.layouts) && pg.layouts.length)
      ? pg.layouts
      : [{ template: pg.template, components: pg.components || [] }];
    const pageActs: string[] = [];
    const pageSupport: any = { images: false, code: false, tables: false, formulas: false, audio: false, geogebra: false };
    let pageReading = false;
    let pagePad: 'large' | 'medium' | 'adaptive' | undefined;
    const pageDecos: { kind: string; message: string; link: string }[] = [];
    const sections: string[] = [];
    blocks.forEach((ly, li) => {
      const c = compilePage(ly.components || []);
      if (c.language) anyLang = true;
      pageActs.push(...c.activities);   // ordered, duplicates kept, ACROSS blocks
      for (const k of Object.keys(c.support)) if (c.support[k]) pageSupport[k] = true;
      if (c.reading) pageReading = true;
      if (c.padSize) pagePad = c.padSize;
      pageDecos.push(...c.decorations);
      const sec = [layoutHint(ly.template), ...c.lines].filter(Boolean).join('\n');
      if (sec) sections.push(`Section ${li + 1}: ${sec}`);
    });
    pageActs.forEach((a) => unionActs.add(a));
    for (const k of Object.keys(unionSupport)) if (pageSupport[k]) unionSupport[k] = true;
    if (sections.length) allLines.push(`Slide ${i + 1}:\n${sections.join('\n')}`);
    return {
      activityTypes: pageActs,
      support: pageSupport,
      reading: pageReading || undefined,
      paragraphsPerSlide: clamp(pg.paragraphs, 1, 4, 1),
      paragraphLength: (pg.length || 'medium') as 'brief' | 'medium' | 'detailed',
      // Each templated section is described in order, dotted-line separated, so the
      // generator lays the slide out top-to-bottom the way the user stacked them.
      style: sections.length ? sections.join('\n┄┄┄\n').slice(0, 700) : undefined,
      padSize: pagePad,
      decorations: pageDecos.length ? pageDecos : undefined,
    };
  });
  const subject = String(cfg.subject || title);
  const subjectKind = inferKind(subject, anyLang);
  const totalSlides = Math.max(1, Math.min(75, pages.length));
  const style = [
    context ? `Extra context: ${context}` : '',
    allLines.length ? `Per-slide component plan:\n${allLines.join('\n')}` : '',
  ].filter(Boolean).join('\n').slice(0, 500);

  return {
    version: 1, archetype: 'lesson', title: `Presentation — ${title}`.slice(0, 70),
    description: context || `A ${subject} lesson.`,
    tags: [subjectKind === 'general' ? 'lesson' : subjectKind, 'lesson', 'studio'],
    settings: [
      { id: 'topic', label: 'Topic', type: 'text', default: cfg.subject || '' },
      { id: 'difficulty', label: 'Level', type: 'select-or-custom', options: ['Beginner', 'Intermediate', 'Advanced'] },
      { id: 'tone', label: 'Tone', type: 'select-or-custom', options: ['Friendly', 'Formal', 'Playful', 'Socratic', 'Storytelling'], default: cfg.tone || 'Friendly' },
      { id: 'slides', label: 'Slides', type: 'number', default: totalSlides },
    ],
    lesson: {
      subject, subjectKind, mode: 'slides', totalSlides,
      paragraphsPerSlide: pages[0]?.paragraphsPerSlide || 1, paragraphLength: pages[0]?.paragraphLength || 'medium',
      language: anyLang ? subject : undefined, translateTo: 'English',
      support: unionSupport, activityTypes: Array.from(unionActs.size ? unionActs : new Set(['mcq'])), style,
      pages,
    },
  };
}
