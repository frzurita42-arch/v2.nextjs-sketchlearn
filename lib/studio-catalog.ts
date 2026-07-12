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
  support?: 'images' | 'code' | 'tables' | 'formulas' | 'audio';   // -> lesson.support
  language?: boolean;                // marks the lesson as a language lesson
  field?: { id: string; label: string; type: string; options?: string[] };  // repository entry field
  sizes?: boolean;                   // component offers a size choice (annotation pad)
  note?: boolean;                    // pure custom instruction (a comment for the AI)
  linkField?: boolean;              // shows a reference image/link input (e.g. image gen)
  requires?: string;                // capability path in /api/config caps (e.g. 'music', 'providers.grok')
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
export const ANNOTATION_SIZES = ['Large (full page)', 'Medium (half screen)', 'Adaptive (grows by height)'];

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
      { id: 'mcq', emoji: '📖', name: 'Reading + multiple choice', desc: 'A short read, then 2- or 4-option questions.', activity: 'mcq' },
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
    id: 'extras', label: '💬 Extras', for: 'both', items: [
      { id: 'note', emoji: '💬', name: 'Custom instruction (comment)', desc: 'A free note telling the AI exactly what to do on this slide.', note: true },
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

export interface StudioComponent { id: string; instr?: string; opt?: string; link?: string; }
// A presentation is a list of PAGES; each page = one slide with its own
// components and text density.
export interface StudioPage { components: StudioComponent[]; length?: 'brief' | 'medium' | 'detailed'; paragraphs?: number; }
export interface StudioConfig {
  artifact: ArtifactKind;
  title?: string;
  subject?: string;
  tone?: string;
  pages?: StudioPage[];              // presentation: one entry per slide
  components?: StudioComponent[];    // repository: the item fields
  context?: string;
  display?: 'cards' | 'list' | 'table';
}

// Compile a page's components into { activityTypes, support, language, styleLines }.
function compilePage(comps: StudioComponent[]) {
  const activities: string[] = [];
  const support: any = { images: false, code: false, tables: false, formulas: false, audio: false };
  let language = false;
  let padSize: 'large' | 'medium' | 'adaptive' | undefined;
  const lines: string[] = [];
  const providers: string[] = [];
  for (const c of comps) {
    const it = studioItem(c.id); if (!it) continue;
    if (it.activity) activities.push(it.activity);
    if (it.support) support[it.support] = true;
    if (it.language) language = true;
    const how = String(c.instr || '').trim();
    if (it.note) { if (how) lines.push(`• Note: ${how}`); continue; }
    if (it.id.startsWith('ai-')) { providers.push(it.name); continue; }
    const size = it.sizes && c.opt ? ` [${c.opt}]` : '';
    if (it.sizes) padSize = annotationSizeKey(c.opt);   // the pad size for this slide
    const link = String(c.link || '').trim();
    const ref = it.linkField && link ? ` (reference: ${link})` : '';
    lines.push(`• ${it.name}${size}${ref}${how ? `: ${how}` : ''}`);
  }
  if (providers.length) lines.push(`• Preferred AI model: ${providers.join(', ')}`);
  return { activities: Array.from(new Set(activities)), support, language, lines, padSize };
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
    const fields = (cfg.components || []).map((c) => studioItem(c.id)?.field).filter(Boolean) as any[];
    if (!fields.length) fields.push({ id: 'title', label: 'Title', type: 'text' }, { id: 'description', label: 'Description', type: 'textarea' });
    return {
      version: 1, archetype: 'app', title: `Repository — ${title}`.slice(0, 70),
      description: context || `A collection: ${cfg.subject || title}`,
      tags: ['repository', 'studio'], settings: [],
      app: { entryFields: fields, display: cfg.display || 'cards', review: false },
    };
  }

  // presentation -> lesson, one slide per page.
  const rawPages = cfg.pages && cfg.pages.length ? cfg.pages : [{ components: [], length: 'medium' as const, paragraphs: 1 }];
  const clamp = (n: any, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, parseInt(n, 10) || d));
  let anyLang = false;
  const unionActs = new Set<string>();
  const unionSupport: any = { images: false, code: false, tables: false, formulas: false, audio: false };
  const allLines: string[] = [];
  const pages = rawPages.map((pg, i) => {
    const c = compilePage(pg.components || []);
    if (c.language) anyLang = true;
    const acts = c.activities.length ? c.activities : ['mcq'];
    acts.forEach((a) => unionActs.add(a));
    for (const k of Object.keys(unionSupport)) if (c.support[k]) unionSupport[k] = true;
    if (c.lines.length) allLines.push(`Slide ${i + 1}: ${c.lines.join('; ')}`);
    return {
      activityTypes: acts,
      support: c.support,
      paragraphsPerSlide: clamp(pg.paragraphs, 1, 4, 1),
      paragraphLength: (pg.length || 'medium') as 'brief' | 'medium' | 'detailed',
      style: c.lines.length ? c.lines.join('\n').slice(0, 400) : undefined,
      padSize: c.padSize,   // annotation pad size for this slide, if it has one
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
