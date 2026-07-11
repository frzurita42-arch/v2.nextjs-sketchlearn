/* Built-in EXAMPLE tools, always shown in the gallery so people can see a
 * working, easy lesson and how a tool is put together. Served virtually by the
 * /api/tools route (not stored in the DB); fully playable. */

const CREATED = '2026-01-01T00:00:00.000Z';

function lessonSettings(levels, slides) {
  return [
    { id: 'topic', label: 'Topic (optional)', type: 'text', placeholder: 'e.g. greetings, food' },
    { id: 'difficulty', label: 'Difficulty', type: 'select-or-custom', options: levels, default: levels[0] },
    { id: 'slides', label: 'Number of slides', type: 'number', default: slides },
    { id: 'length', label: 'Paragraph length', type: 'select', options: ['brief', 'medium', 'detailed'], default: 'brief' },
  ];
}

const EXAMPLE_TOOLS = [
  {
    id: 'example-easy-french', slug: 'example-easy-french', owner: 'sketchlearn',
    title: 'Easy French — Example Lesson',
    description: 'A ready-made beginner French lesson you can play right now. Hit “Generate & play” to see how lesson tools work.',
    archetype: 'lesson', visibility: 'public', tags: ['example', 'language', 'french'],
    thumbnail: null, likeCount: 0, aiGenerated: true, createdAt: CREATED, updatedAt: CREATED,
    definition: {
      version: 1, archetype: 'lesson', title: 'Easy French — Example Lesson',
      description: 'A beginner French lesson: short phrases you can hear and translate, with quick questions.',
      tags: ['example', 'language', 'french'],
      settings: lessonSettings(['A1', 'A2', 'B1'], 4),
      lesson: {
        subject: 'French', subjectKind: 'language', totalSlides: 4, language: 'French', translateTo: 'English',
        paragraphsPerSlide: 1, paragraphLength: 'brief',
        support: { images: true, audio: true, code: false, tables: false, formulas: false },
        activityTypes: ['mcq', 'fill-blank', 'input'],
      },
    },
  },
  {
    id: 'example-easy-math', slug: 'example-easy-math', owner: 'sketchlearn',
    title: 'Easy Math — Example Lesson',
    description: 'A ready-made beginner math lesson with formulas and quick questions. A simple example of a playable lesson tool.',
    archetype: 'lesson', visibility: 'public', tags: ['example', 'math'],
    thumbnail: null, likeCount: 0, aiGenerated: true, createdAt: CREATED, updatedAt: CREATED,
    definition: {
      version: 1, archetype: 'lesson', title: 'Easy Math — Example Lesson',
      description: 'A beginner math lesson: one idea per slide with a formula and a quick question.',
      tags: ['example', 'math'],
      settings: lessonSettings(['Beginner', 'Intermediate'], 4),
      lesson: {
        subject: 'Basic Math', subjectKind: 'math', totalSlides: 4, translateTo: 'English',
        paragraphsPerSlide: 1, paragraphLength: 'brief',
        support: { images: false, audio: false, code: false, tables: true, formulas: true },
        activityTypes: ['mcq', 'fill-blank', 'input'],
      },
    },
  },
];

function exampleBySlug(slug) {
  return EXAMPLE_TOOLS.find(t => t.slug === slug) || null;
}

module.exports = { EXAMPLE_TOOLS, exampleBySlug };
