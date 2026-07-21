/* The catalogue of engaging slide activities a generated presentation tool can
 * use — the "templates & activities" that build a slide-generator page. It is the
 * single record of what a study-path tool is built from, and deliberately EXCLUDES
 * tooltip/hint-style activities (some students can't use tooltips).
 *
 * `question` kinds map to a lesson's activityTypes; `content` kinds are enabled via
 * the lesson support flags. Together they give ~10 varied activities per deck. */

export interface SlideActivity {
  key: string;
  label: string;
  kind: 'question' | 'content';
  description: string;
}

export const SLIDE_ACTIVITIES: SlideActivity[] = [
  { key: 'mcq', label: 'Multiple choice', kind: 'question', description: 'Pick the correct option; instant right/wrong feedback with an explanation.' },
  { key: 'fill-blank', label: 'Fill in the blank', kind: 'question', description: 'Complete a sentence/equation by typing the missing word or value.' },
  { key: 'input', label: 'Short answer', kind: 'question', description: 'A free-text answer graded leniently by the AI.' },
  { key: 'code', label: 'Code exercise', kind: 'question', description: 'Write/complete a code snippet; AI-checked against the goal.' },
  { key: 'annotation', label: 'Draw / annotate', kind: 'question', description: 'Mark up a paper pad with pen + text; AI grades the annotation.' },
  { key: 'writing', label: 'Handwriting practice', kind: 'question', description: 'Trace/write characters or words on a canvas; AI drawing check.' },
  { key: 'table', label: 'Data table', kind: 'content', description: 'A structured table to compare, sort or read values.' },
  { key: 'chart', label: 'Chart / graph', kind: 'content', description: 'An inline SVG bar/line/donut chart of the slide’s data.' },
  { key: 'diagram', label: 'Labeled diagram', kind: 'content', description: 'An SVG diagram/illustration with labels for the concept.' },
  { key: 'stickynote', label: 'Key-takeaway note', kind: 'content', description: 'A sticky note highlighting one punchy takeaway, warning or mnemonic.' },
];

// Lesson activityTypes for the generated tool (the interactive question kinds).
export const ENGAGING_ACTIVITY_TYPES = SLIDE_ACTIVITIES.filter((a) => a.kind === 'question').map((a) => a.key);

// Lesson support flags that switch on the engaging CONTENT activities (tables,
// charts/diagrams via images, code, math). `audio` stays off (not an activity).
// `geogebra` stays OFF: an interactive coordinate graph is only useful on the rare
// slide that actually plots a function/construction, so blanket-adding it to every
// slide just yields a generic, repeated graph. Enable it per-slide when needed.
export const ENGAGING_SUPPORT = { images: true, code: true, tables: true, formulas: true, geogebra: false, audio: false };

// Difficulty options a study tool can default to (matches the app's LEVELS).
export const STUDY_LEVELS = ['Beginner', 'Lower Intermediate', 'Upper Intermediate', 'Advanced', 'PhD'];
// "Length" = how much text sits on each slide.
export const STUDY_LENGTHS: { key: 'brief' | 'medium' | 'detailed'; label: string }[] = [
  { key: 'brief', label: 'Brief' },
  { key: 'medium', label: 'Medium' },
  { key: 'detailed', label: 'Detailed' },
];

// Build a lesson tool definition from a repo (its title/description/context),
// wired to use all the engaging activities and NO tooltips. `subject` overrides
// the auto subject; `level` sets the default difficulty; `slides` the deck length;
// `length` the per-slide text depth; `tone` the teaching voice.
export function buildStudyToolDefinition(opts: { title: string; context?: string; subject?: string; slides?: number; level?: string; length?: 'brief' | 'medium' | 'detailed'; tone?: string; topics?: string[] }): any {
  const base = (opts.title || 'Study').trim().slice(0, 60);
  const subject = (opts.subject || base).trim().slice(0, 60) || base;
  const context = (opts.context || '').trim().slice(0, 400);
  const tone = (opts.tone || '').trim().slice(0, 40);
  const topics = (Array.isArray(opts.topics) ? opts.topics : [])
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .slice(0, 16);
  const level = STUDY_LEVELS.includes(opts.level || '') ? opts.level : 'Beginner';
  const length = (['brief', 'medium', 'detailed'] as const).includes(opts.length as any) ? opts.length : 'medium';
  const slides = Math.max(3, Math.min(15, opts.slides || 8));
  return {
    version: 1,
    archetype: 'lesson',
    title: `${base} — Slide Activities`,
    description: `Slide generator for “${base}”. ${slides} slides · ${level} · ${length}${tone ? ` · ${tone}` : ''}. Uses ${SLIDE_ACTIVITIES.length} engaging activity types (no tooltips).`,
    tags: ['study-path', 'generated'],
    lesson: {
      subject,
      subjectKind: 'general',
      level,
      totalSlides: slides,
      translateTo: 'English',
      ...(tone ? { tone } : {}),
      paragraphsPerSlide: length === 'detailed' ? 2 : 1,
      paragraphLength: length,
      support: ENGAGING_SUPPORT,
      activityTypes: ENGAGING_ACTIVITY_TYPES,
      style: [
        `Teach one idea per slide at a ${level} level, then check it with a VARIED, engaging activity — rotate through: ${SLIDE_ACTIVITIES.map((a) => a.label).join(', ')}.`,
        tone ? `Tone: ${tone}.` : '',
        topics.length ? `Topics to cover across the lesson: ${topics.join('; ')}.` : '',
        'Never rely on tooltips or hover-hints (some students can’t use them).',
        context ? `Base the content on this study path: ${context}` : '',
      ].filter(Boolean).join(' '),
      viewMode: 'replica',
    },
  };
}
