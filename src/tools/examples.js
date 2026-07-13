/* Built-in EXAMPLE tools. A couple are featured in the gallery so people can see
 * a working, easy lesson; the fuller set backfills the "Top picks for you"
 * suggestion carousel so it always has recommendations for a new user. Served
 * virtually by the /api/tools route (not stored in the DB); fully playable. */

const CREATED = '2026-01-01T00:00:00.000Z';

function lessonSettings(levels, slides) {
  return [
    { id: 'topic', label: 'Topic (optional)', type: 'text', placeholder: 'e.g. greetings, food' },
    { id: 'difficulty', label: 'Difficulty', type: 'select-or-custom', options: levels, default: levels[0] },
    { id: 'slides', label: 'Number of slides', type: 'number', default: slides },
    { id: 'length', label: 'Paragraph length', type: 'select', options: ['brief', 'medium', 'detailed'], default: 'brief' },
  ];
}

// Compact factory for an example lesson tool.
function exLesson(o) {
  const levels = o.levels || ['Beginner', 'Intermediate', 'Advanced'];
  const tags = ['example', ...(o.tags || [])];
  const support = { images: false, audio: false, code: false, tables: false, formulas: false, geogebra: false, ...(o.support || {}) };
  const acts = o.acts || ['mcq', 'fill-blank', 'input'];
  return {
    id: o.slug, slug: o.slug, owner: 'sketchlearn',
    title: o.title, description: o.desc,
    archetype: 'lesson', visibility: 'public', tags,
    thumbnail: null, likeCount: 0, aiGenerated: true, createdAt: CREATED, updatedAt: CREATED,
    definition: {
      version: 1, archetype: 'lesson', title: o.title, description: o.desc, tags,
      settings: lessonSettings(levels, 4),
      lesson: {
        subject: o.subject, subjectKind: o.kind, totalSlides: 4, translateTo: 'English',
        ...(o.language ? { language: o.language } : {}),
        ...(o.style ? { style: o.style } : {}),
        paragraphsPerSlide: 1, paragraphLength: 'brief',
        support, activityTypes: acts,
      },
    },
  };
}

const EXAMPLE_TOOLS = [
  exLesson({ slug: 'example-easy-french', title: 'Easy French — Example Lesson', subject: 'French', kind: 'language', language: 'French', levels: ['A1', 'A2', 'B1'], tags: ['language', 'french'], support: { images: true, audio: true }, desc: 'A ready-made beginner French lesson you can play right now. Hit “Generate & play” to see how lesson tools work.' }),
  exLesson({ slug: 'example-easy-math', title: 'Easy Math — Example Lesson', subject: 'Basic Math', kind: 'math', levels: ['Beginner', 'Intermediate'], tags: ['math'], support: { tables: true, formulas: true }, desc: 'A ready-made beginner math lesson with formulas and quick questions. A simple example of a playable lesson tool.' }),
  exLesson({ slug: 'example-spanish', title: 'Spanish Starter — Example Lesson', subject: 'Spanish', kind: 'language', language: 'Spanish', levels: ['A1', 'A2', 'B1'], tags: ['language', 'spanish'], support: { images: true, audio: true }, desc: 'Everyday Spanish phrases you can hear, translate and practice — a friendly example lesson.' }),
  exLesson({ slug: 'example-biology', title: 'Intro Biology — Example Lesson', subject: 'Biology', kind: 'general', tags: ['science', 'biology'], support: { images: true, tables: true }, desc: 'Cells, life and the basics of biology, one clear idea per slide with quick checks.' }),
  exLesson({ slug: 'example-world-history', title: 'World History — Example Lesson', subject: 'World History', kind: 'general', tags: ['history'], support: { images: true, tables: true }, desc: 'A tour through key moments in world history, told simply with quick questions.' }),
  exLesson({ slug: 'example-python', title: 'Python Basics — Example Lesson', subject: 'Python Programming', kind: 'programming', tags: ['technology', 'programming', 'python'], support: { code: true }, acts: ['mcq', 'code', 'input'], desc: 'Variables, loops and functions in Python — learn to code with worked, AI-checked snippets.' }),
  exLesson({ slug: 'example-chemistry', title: 'Chemistry 101 — Example Lesson', subject: 'Chemistry', kind: 'math', tags: ['science', 'chemistry'], support: { images: true, formulas: true, tables: true }, desc: 'Atoms, reactions and the periodic table — a clear starter chemistry lesson.' }),
  exLesson({ slug: 'example-music-theory', title: 'Music Theory — Example Lesson', subject: 'Music Theory', kind: 'general', tags: ['arts', 'music'], support: { images: true, audio: true }, desc: 'Notes, scales and rhythm — the building blocks of music, made approachable.' }),
  exLesson({ slug: 'example-personal-finance', title: 'Personal Finance — Example Lesson', subject: 'Personal Finance', kind: 'general', tags: ['business', 'finance'], support: { tables: true }, desc: 'Budgeting, saving and simple investing basics — practical money skills to start with.' }),
  exLesson({ slug: 'example-creative-writing', title: 'Creative Writing — Example Lesson', subject: 'Creative Writing', kind: 'general', tags: ['writing', 'arts'], acts: ['input', 'mcq'], desc: 'Spark ideas, build characters and shape a scene — a gentle creative-writing warm-up.' }),
  exLesson({ slug: 'example-geography', title: 'World Geography — Example Lesson', subject: 'Geography', kind: 'general', tags: ['history', 'geography'], support: { images: true, tables: true }, desc: 'Continents, capitals and landscapes — explore the world one slide at a time.' }),
  exLesson({ slug: 'example-study-skills', title: 'Study Skills — Example Lesson', subject: 'Study Skills', kind: 'general', tags: ['productivity'], desc: 'Focus, note-taking and memory techniques to learn anything more effectively.' }),
];

// The platform's own "admin-made" tools: the built-in learning activities exposed
// as full tools so they get the standard tool page (input box + generations feed
// with results & new-generation + comments + filter). A `style` steers the shared
// lesson generator toward each activity's flavour.
const ADMIN_TOOLS = [
  exLesson({ slug: 'admin-learning-path', title: 'Learning Path', subject: 'Learning Path', kind: 'general', tags: ['admin', 'learning-path'], support: { images: true, tables: true }, style: 'Build a step-by-step LEARNING PATH: each slide is the next milestone that builds on the previous, from fundamentals toward mastery of the chosen topic.', desc: 'Pick any subject and get a guided, step-by-step path of slides from basics to mastery.' }),
  exLesson({ slug: 'admin-suggested-topic', title: 'Suggested Topic', subject: 'Suggested Topic', kind: 'general', tags: ['admin', 'suggested'], support: { images: true }, style: 'Teach an interesting, well-chosen topic the learner might not have thought of — a delightful "did you know" style mini-lesson.', desc: 'A surprise, well-chosen topic to explore — a delightful mini-lesson each time.' }),
  exLesson({ slug: 'admin-time-travel', title: 'Time Travel', subject: 'Time Travel', kind: 'general', tags: ['admin', 'history'], support: { images: true, tables: true }, style: 'Teach the topic through the lens of HISTORY and vivid "what-if" news-style headlines from different eras — travel through time to understand how ideas evolved.', desc: 'Learn any topic by travelling through time — history and “what-if” headlines from every era.' }),
  exLesson({ slug: 'admin-structured-explanations', title: 'Structured Explanations', subject: 'Structured Explanations', kind: 'general', tags: ['admin'], support: { images: true, tables: true }, style: 'Give a clearly STRUCTURED, sectioned explanation: definition → why it matters → how it works → example → common pitfalls. Keep each slide one clean section.', desc: 'A clean, sectioned breakdown of any concept: definition, why, how, example, pitfalls.' }),
  exLesson({ slug: 'admin-language-learning', title: 'Language Learning', subject: 'Spanish', kind: 'language', language: 'Spanish', levels: ['A1', 'A2', 'B1', 'B2'], tags: ['admin', 'language'], support: { images: true, audio: true }, style: 'A proper LANGUAGE lesson: short phrases to hear, translate and practice, with grammar and vocabulary appropriate to the level.', desc: 'Practice a language with hear-and-translate phrases, grammar and vocabulary by level.' }),
];

// The gallery features just a couple so it stays uncluttered; the full set backs
// the suggestion carousel and slug resolution.
const GALLERY_EXAMPLES = EXAMPLE_TOOLS.slice(0, 2);
// Everything resolvable by slug (opened / edited): subject examples + admin tools.
const ALL_EXAMPLES = [...EXAMPLE_TOOLS, ...ADMIN_TOOLS];

function exampleBySlug(slug) {
  return ALL_EXAMPLES.find(t => t.slug === slug) || null;
}

function isExampleSlug(slug) {
  return !!exampleBySlug(slug);
}

// Merge an admin override (title / description / thumbnail) onto an example tool.
function applyOverride(tool, ov) {
  if (!tool || !ov) return tool;
  const t = { ...tool, definition: { ...(tool.definition || {}) } };
  if (typeof ov.title === 'string' && ov.title) { t.title = ov.title; t.definition.title = ov.title; }
  if (typeof ov.description === 'string' && ov.description) { t.description = ov.description; t.definition.description = ov.description; }
  if (typeof ov.thumbnail === 'string') t.thumbnail = ov.thumbnail;
  return t;
}

// Apply a whole overrides map onto a list of example tools.
function applyOverrides(tools, overrides) {
  if (!overrides) return tools;
  return (tools || []).map(t => (overrides[t.slug] ? applyOverride(t, overrides[t.slug]) : t));
}

module.exports = { EXAMPLE_TOOLS, ADMIN_TOOLS, GALLERY_EXAMPLES, exampleBySlug, isExampleSlug, applyOverride, applyOverrides };
