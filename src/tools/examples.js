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
  // Chinese character TRACING lesson: each slide shows a character and asks you to
  // trace/write it on a canvas — the AI checks your handwriting (the 'writing'
  // activity). A guided beginner path, playable right away.
  exLesson({ slug: 'example-chinese-characters', title: 'Chinese Characters — Trace & Learn', subject: 'Chinese Characters', kind: 'language', language: 'Chinese', levels: ['HSK 1', 'HSK 2', 'HSK 3'], tags: ['language', 'chinese'], support: { images: true, audio: true }, acts: ['writing', 'mcq', 'input'], style: 'Teach common Chinese characters. On most slides ask the learner to TRACE/write the character on the canvas (the writing activity), showing the character, its pinyin and meaning as support. Mix in a few multiple-choice or typed recall questions.', desc: 'Learn Chinese characters by tracing them on a canvas — the AI checks your handwriting. Shows the character, pinyin and meaning, then you write it. A guided beginner path, ready to play.' }),
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

// ---------------------------------------------------------------------------
// Rich SAVED example presentation. A tiny inline SVG (data URL) stands in for a
// generated diagram / chart so the saved deck shows real visuals with NO image
// model. The deck carries text content, a table, a formula, two images (a diagram
// + a bar chart), multiple-choice + fill-blank questions with the answer key, the
// finished-run RESULTS (a full score) and the CONFIG used to make it (topic,
// level, theme, style, density — the "prompt"). Open the tool and press
// "📖 View original (with answers)" to see all of it.
function svgUri(svg) { return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace(/\n\s*/g, ' ')); }
const LEAF_SVG = svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='190'>
  <rect width='320' height='190' fill='#f7f3e9'/>
  <circle cx='55' cy='45' r='22' fill='#f6c453'/>
  <g stroke='#e0a800' stroke-width='3'><line x1='55' y1='10' x2='55' y2='20'/><line x1='55' y1='70' x2='55' y2='80'/><line x1='20' y1='45' x2='30' y2='45'/><line x1='80' y1='45' x2='90' y2='45'/></g>
  <path d='M150 150 C108 120 120 58 205 55 C208 120 192 146 150 150 Z' fill='#7fb069' stroke='#2d6a4f' stroke-width='3'/>
  <path d='M156 145 C166 110 182 84 200 60' stroke='#2d6a4f' stroke-width='2' fill='none'/>
  <text x='236' y='58' font-family='sans-serif' font-size='12' fill='#2d2a26'>O2 out</text>
  <text x='236' y='140' font-family='sans-serif' font-size='12' fill='#2d2a26'>CO2 in</text>
  <text x='36' y='108' font-family='sans-serif' font-size='12' fill='#2d2a26'>sunlight</text>
</svg>`);
const CHART_SVG = svgUri(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='190'>
  <rect width='320' height='190' fill='#f7f3e9'/>
  <line x1='42' y1='160' x2='300' y2='160' stroke='#2d2a26' stroke-width='2'/>
  <line x1='42' y1='24' x2='42' y2='160' stroke='#2d2a26' stroke-width='2'/>
  <rect x='72' y='112' width='42' height='48' fill='#5c80bc'/>
  <rect x='142' y='72' width='42' height='88' fill='#7fb069'/>
  <rect x='212' y='42' width='42' height='118' fill='#f6c453'/>
  <text x='74' y='176' font-family='sans-serif' font-size='11' fill='#2d2a26'>Low</text>
  <text x='142' y='176' font-family='sans-serif' font-size='11' fill='#2d2a26'>Med</text>
  <text x='210' y='176' font-family='sans-serif' font-size='11' fill='#2d2a26'>High</text>
  <text x='96' y='18' font-family='sans-serif' font-size='12' fill='#2d2a26'>Light vs. O2 output</text>
</svg>`);
const PHOTOSYNTHESIS_DECK = {
  savedBy: 'sketchlearn', savedAt: CREATED,
  config: { topic: 'Photosynthesis', difficulty: 'Beginner', level: 'Beginner', theme: 'Biology', imageStyle: 'Infographic', imageProvider: '', density: 'Medium', slides: 3, category: 'Science', score: 100, custom: 'Explain photosynthesis simply with a diagram, a data table, a formula and a chart.' },
  slides: [
    {
      title: 'What is photosynthesis?',
      content: 'Photosynthesis is how green plants make their own food. Using sunlight, water and carbon dioxide, a leaf builds sugar and releases oxygen. It happens mostly in the leaves, inside tiny green parts called chloroplasts.',
      translation: '',
      _supports: [{ type: 'image', url: LEAF_SVG, caption: 'A leaf takes in sunlight and CO2, and releases O2', by: 'example' }],
      questions: [{ kind: 'mcq', prompt: 'What gas does a plant RELEASE during photosynthesis?', options: [{ text: 'Oxygen', correct: true, explanation: 'Plants release oxygen as a by-product.' }, { text: 'Carbon dioxide' }, { text: 'Nitrogen' }, { text: 'Hydrogen' }] }],
    },
    {
      title: 'The ingredients',
      content: 'A plant needs three things to make sugar: water from its roots, carbon dioxide from the air, and light energy from the sun. The table lines up what goes IN and what comes OUT.',
      translation: '',
      _supports: [{ type: 'table', headers: ['Goes in', 'Comes out'], rows: [['Water (H2O)', 'Sugar (glucose)'], ['Carbon dioxide (CO2)', 'Oxygen (O2)'], ['Sunlight', '—']] }],
      questions: [{ kind: 'fill-blank', prompt: 'Plants take in water and carbon dioxide and give out sugar and ____.', answer: 'oxygen', accept: ['oxygen', 'o2'], explanation: 'Oxygen is released into the air.' }],
    },
    {
      title: 'More light, more food',
      content: 'Up to a point, the more light a plant gets, the faster it photosynthesises and the more oxygen it produces. The formula sums up the whole reaction, and the chart shows how oxygen output rises with light.',
      translation: '',
      _supports: [
        { type: 'formula', latex: '6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2', caption: 'The overall photosynthesis reaction' },
        { type: 'image', url: CHART_SVG, caption: 'Oxygen output rises with light level', by: 'example' },
      ],
      questions: [{ kind: 'mcq', prompt: 'According to the chart, when is oxygen output HIGHEST?', options: [{ text: 'In high light', correct: true }, { text: 'In low light' }, { text: 'In the dark' }] }],
    },
  ],
  results: { 0: { answers: { 0: { correct: true } } }, 1: { answers: { 0: { correct: true } } }, 2: { answers: { 0: { correct: true } } } },
};
// An example lesson that already carries a saved deck (a finished, scored run).
function exDeckLesson(o) {
  const base = exLesson(o);
  base.definition.lesson.savedDeck = o.deck;
  base.definition.lesson.totalSlides = o.deck.slides.length;
  return base;
}
const DECK_EXAMPLES = [
  exDeckLesson({ slug: 'example-photosynthesis', title: 'Photosynthesis — Example Presentation', subject: 'Photosynthesis', kind: 'general', tags: ['science', 'biology'], support: { images: true, tables: true, formulas: true }, deck: PHOTOSYNTHESIS_DECK, desc: 'A ready-made 3-slide presentation with a diagram, a data table, a formula and a chart. Open it and press “📖 View original (with answers)” to see the full slides, questions, images and score.' }),
];

// ---------------------------------------------------------------------------
// Example REPOSITORIES (collections of link/resource cards) so the Repos gallery
// has ready content. Each card is a name + description + link; one card carries a
// status chip to show the Assignment feature.
function exRepo(o) {
  const tags = ['example', 'collection', ...(o.tags || [])];
  return {
    id: o.slug, slug: o.slug, owner: 'sketchlearn',
    title: o.title, description: o.desc,
    archetype: 'repo', visibility: 'public', tags,
    thumbnail: null, likeCount: 0, aiGenerated: false, createdAt: CREATED, updatedAt: CREATED,
    definition: {
      version: 1, archetype: 'repo', title: o.title, description: o.desc, tags,
      settings: [],
      repo: { layout: 'post', display: 'bars', offlineExport: false, imageGen: false, showDates: true,
        ...(o.studyMode ? { studyMode: true } : {}), ...(o.studyToolSlug ? { studyToolSlug: o.studyToolSlug } : {}),
        cards: o.cards },
    },
  };
}
const REPO_EXAMPLES = [
  // A guided STUDY-PATH repo: study-path mode is on, so each 🔵 prompt card gets a
  // 🎬 button that opens the Chinese tracing lesson tool preset with that unit's
  // prompt. The clearest example of "a repo that guides you through learning
  // something, feeding prompts into a lesson tool."
  exRepo({
    slug: 'example-chinese-study-path', title: 'Chinese Characters — Study Path', tags: ['language', 'chinese', 'education'],
    studyMode: true, studyToolSlug: 'example-chinese-characters',
    desc: 'A guided path to learn Chinese characters. Each 🔵 unit card opens the tracing lesson tool with that unit preset — trace the characters and the AI checks your handwriting.',
    cards: [
      { id: 'u1', kind: 'card', title: 'Unit 1 — Numbers 一 二 三', text: '🔵 Teach the Chinese characters for numbers 1–10 (一 二 三 四 五 六 七 八 九 十). Show each character with its pinyin and meaning, then have me trace/write it on the canvas.' },
      { id: 'u2', kind: 'card', title: 'Unit 2 — People 人 大 小', text: '🔵 Teach basic people & size characters (人 大 小 男 女 子). Show pinyin and meaning for each, then have me trace it.' },
      { id: 'u3', kind: 'card', title: 'Unit 3 — Nature 日 月 水 火', text: '🔵 Teach nature characters (日 月 水 火 山 木 土). Trace each one, with pinyin and meaning shown as support.' },
      { id: 'u4', kind: 'card', title: 'How to use this study path', text: 'Tap a 🔵 unit card’s 🎬 button to open the tracing lesson with that unit preset, then play through — tracing each character as the AI checks your handwriting.', mode: 'approved' },
    ],
  }),
  exRepo({
    slug: 'example-study-hub', title: 'Study Resources Hub — Example Repository', tags: ['education'],
    desc: 'A ready-made collection of free study resources — open it to see how a repository of link cards works.',
    cards: [
      { id: 'c1', kind: 'card', title: 'Khan Academy — Biology', text: 'Free video lessons and practice on cells, genetics and ecology.', links: [{ label: 'Open', url: 'https://www.khanacademy.org/science/biology' }] },
      { id: 'c2', kind: 'card', title: 'OpenStax — Free Textbooks', text: 'Peer-reviewed, openly-licensed textbooks for science, math and the humanities.', links: [{ label: 'Open', url: 'https://openstax.org' }] },
      { id: 'c3', kind: 'card', title: 'Project Gutenberg', text: 'Over 70,000 free eBooks — classic literature in the public domain.', links: [{ label: 'Open', url: 'https://www.gutenberg.org' }] },
      { id: 'c4', kind: 'card', title: 'Weekly study checklist', text: 'Review notes, do 10 practice questions, then summarise one page from memory.', mode: 'approved' },
    ],
  }),
  exRepo({
    slug: 'example-reading-list', title: 'Beginner Reading List — Example Repository', tags: ['reading'],
    desc: 'A short, curated reading list — a repository of recommended books with links and notes.',
    cards: [
      { id: 'r1', kind: 'card', title: 'Sapiens — Yuval Noah Harari', text: 'A sweeping, readable history of humankind. Great for big-picture thinkers.', links: [{ label: 'Learn more', url: 'https://en.wikipedia.org/wiki/Sapiens:_A_Brief_History_of_Humankind' }] },
      { id: 'r2', kind: 'card', title: 'A Short History of Nearly Everything — Bill Bryson', text: 'Science made fun and clear, from atoms to the cosmos.', links: [{ label: 'Learn more', url: 'https://en.wikipedia.org/wiki/A_Short_History_of_Nearly_Everything' }] },
      { id: 'r3', kind: 'card', title: 'Reading goal', text: 'One chapter a night, and jot down a single sentence about what you learned.', mode: 'assigned' },
    ],
  }),
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

// Featured in the galleries so BOTH pages have ready content: the Repos page
// shows the repository examples; the Slides page shows the saved presentation and
// a couple of playable lesson examples. (ToolsView filters featured by archetype.)
const GALLERY_EXAMPLES = [...REPO_EXAMPLES, ...DECK_EXAMPLES, ...EXAMPLE_TOOLS.slice(0, 2)];
// Everything resolvable by slug (opened / edited): subjects, decks, repos + admin.
const ALL_EXAMPLES = [...EXAMPLE_TOOLS, ...DECK_EXAMPLES, ...REPO_EXAMPLES, ...ADMIN_TOOLS];

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
