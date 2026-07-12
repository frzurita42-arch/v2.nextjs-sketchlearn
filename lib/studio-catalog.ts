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
}

export interface StudioCategory { id: string; label: string; for: ArtifactKind | 'both'; items: StudioItem[]; }

export const ANNOTATION_SIZES = ['Large (full 9:16)', 'Medium (half screen)', 'Small (quarter)', 'Customizable (± on the fly)'];

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
      { id: 'image', emoji: '🖼️', name: 'AI image / diagram', desc: 'A generated picture or labelled diagram (triangle, free-body sketch…).', support: 'images' },
      { id: 'table', emoji: '📊', name: 'Table', desc: 'A table of data, steps, or comparisons.', support: 'tables' },
      { id: 'wolfram', emoji: '⚡', name: 'Wolfram step-by-step', desc: 'Solve equations with worked steps (uses the Wolfram key).', support: 'formulas' },
      { id: 'latex', emoji: '∑', name: 'LaTeX formula', desc: 'A cleanly typeset formula.', support: 'formulas' },
      { id: 'codeblock', emoji: '🧾', name: 'Code snippet', desc: 'A code / pseudocode block (great for math working).', support: 'code' },
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

export interface StudioComponent { id: string; instr?: string; opt?: string; }
export interface StudioConfig {
  artifact: ArtifactKind;
  title?: string;
  subject?: string;
  slides?: number;
  paragraphs?: number;
  length?: 'brief' | 'medium' | 'detailed';
  tone?: string;
  components: StudioComponent[];
  context?: string;
  display?: 'cards' | 'list' | 'table';
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
    const fields = cfg.components.map((c) => studioItem(c.id)?.field).filter(Boolean) as any[];
    if (!fields.length) fields.push({ id: 'title', label: 'Title', type: 'text' }, { id: 'description', label: 'Description', type: 'textarea' });
    return {
      version: 1, archetype: 'app', title: `Repository — ${title}`.slice(0, 70),
      description: context || `A collection: ${cfg.subject || title}`,
      tags: ['repository', 'studio'], settings: [],
      app: { entryFields: fields, display: cfg.display || 'cards', review: false },
    };
  }

  // presentation -> lesson
  const activities: string[] = [];
  const support: any = { images: false, code: false, tables: false, formulas: false, audio: false };
  let language = false;
  const lines: string[] = [];
  for (const c of cfg.components) {
    const it = studioItem(c.id); if (!it) continue;
    if (it.activity) activities.push(it.activity);
    if (it.support) support[it.support] = true;
    if (it.language) language = true;
    const size = it.sizes && c.opt ? ` [${c.opt}]` : '';
    const how = String(c.instr || '').trim();
    lines.push(`• ${it.name}${size}${how ? `: ${how}` : ''}`);
  }
  const acts = Array.from(new Set(activities.length ? activities : ['mcq']));
  const subject = String(cfg.subject || title);
  const subjectKind = inferKind(subject, language);
  const slides = Math.max(1, Math.min(15, cfg.slides || 5));
  const paragraphs = Math.max(1, Math.min(4, cfg.paragraphs || 1));
  const length = cfg.length || 'medium';
  const style = [
    context ? `Extra context: ${context}` : '',
    lines.length ? `Use these components as the maker specified:\n${lines.join('\n')}` : '',
  ].filter(Boolean).join('\n').slice(0, 500);

  return {
    version: 1, archetype: 'lesson', title: `Presentation — ${title}`.slice(0, 70),
    description: context || `A ${subject} lesson.`,
    tags: [subjectKind === 'general' ? 'lesson' : subjectKind, 'lesson', 'studio'],
    settings: [
      { id: 'topic', label: 'Topic', type: 'text', default: cfg.subject || '' },
      { id: 'difficulty', label: 'Level', type: 'select-or-custom', options: ['Beginner', 'Intermediate', 'Advanced'] },
      { id: 'tone', label: 'Tone', type: 'select-or-custom', options: ['Friendly', 'Formal', 'Playful', 'Socratic', 'Storytelling'], default: cfg.tone || 'Friendly' },
      { id: 'slides', label: 'Slides', type: 'number', default: slides },
      { id: 'length', label: 'Paragraph length', type: 'select', options: ['brief', 'medium', 'detailed'], default: length },
      { id: 'paragraphs', label: 'Paragraphs / slide', type: 'number', default: paragraphs },
    ],
    lesson: {
      subject, subjectKind, mode: 'slides', totalSlides: slides,
      paragraphsPerSlide: paragraphs, paragraphLength: length,
      language: language ? subject : undefined, translateTo: 'English',
      support, activityTypes: acts, style,
    },
  };
}
