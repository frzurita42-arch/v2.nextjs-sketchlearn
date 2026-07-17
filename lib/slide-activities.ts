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
export const ENGAGING_SUPPORT = { images: true, code: true, tables: true, formulas: true, geogebra: true, audio: false };

// Build a lesson tool definition from a repo (its title/description/context),
// wired to use all the engaging activities and NO tooltips.
export function buildStudyToolDefinition(opts: { title: string; context?: string; slides?: number }): any {
  const base = (opts.title || 'Study').trim().slice(0, 60);
  const context = (opts.context || '').trim().slice(0, 400);
  return {
    version: 1,
    archetype: 'lesson',
    title: `${base} — Slide Activities`,
    description: `Slide generator for “${base}”. Uses ${SLIDE_ACTIVITIES.length} engaging activity types (no tooltips).`,
    tags: ['study-path', 'generated'],
    lesson: {
      subject: base,
      subjectKind: 'general',
      totalSlides: Math.max(3, Math.min(15, opts.slides || 8)),
      translateTo: 'English',
      paragraphsPerSlide: 1,
      paragraphLength: 'medium',
      support: ENGAGING_SUPPORT,
      activityTypes: ENGAGING_ACTIVITY_TYPES,
      style: [
        `Teach one idea per slide, then check it with a VARIED, engaging activity — rotate through: ${SLIDE_ACTIVITIES.map((a) => a.label).join(', ')}.`,
        'Never rely on tooltips or hover-hints (some students can’t use them).',
        context ? `Base the content on this study path: ${context}` : '',
      ].filter(Boolean).join(' '),
      viewMode: 'replica',
    },
  };
}
