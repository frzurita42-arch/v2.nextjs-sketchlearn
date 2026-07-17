/* Realistic EXAMPLE "component usage" rows so the dashboard's Component-usage
 * table + chart show data before real runs accrue. Each row is ONE component
 * instance used on ONE slide of a played lesson, capturing what the user asked
 * for: the component type, the date it was used, HOW it was used (the field /
 * role on the slide), whether the learner got it right (for question components),
 * and which slide TEMPLATE displayed it — plus context (tool, topic, level,
 * subjectKind) that helps analyse which tools/lessons are being built so the AI
 * can compose better decks.
 *
 * Every row is marked meta.example = true and its tool title ends "(example)", so
 * it's clearly sample data and mixes cleanly with real derived rows. */

const BASE = Date.parse('2026-01-05T00:00:00.000Z');
const at = (min) => new Date(BASE + min * 60000).toISOString();
let seq = 0;

// The component "palette" a slide can be composed from — content blocks + the
// interactive question kinds. Kept in sync (by name) with the ui/ renderers and
// the lesson activityTypes.
const CONTENT = ['text', 'keypoints', 'definition', 'example', 'table', 'latex', 'code', 'svg', 'image', 'stickynote', 'chart'];
const QUESTIONS = ['mcq', 'fill-blank', 'input', 'writing', 'annotation', 'code'];

// Slide layout templates (the "template display" the component sat in).
const TEMPLATES = ['title-image', 'two-column', 'full-bleed-image', 'quiz-card', 'reading-passage', 'canvas-pad', 'code-box'];

function row({ component, role, tool, slug, user, topic, level, subjectKind, template, correct = null, t }) {
  return {
    id: `ex-cu-${(seq++).toString(36)}`,
    component,                 // e.g. 'mcq', 'table', 'stickynote'
    role,                      // HOW it was used: 'question' | 'teaching' | 'support' | 'visual'
    correct,                   // true/false for question components, null otherwise
    template,                  // the slide template that displayed it
    tool: `${tool} (example)`,
    slug,
    user,
    topic,
    level,
    subjectKind,               // general | math | programming | language
    createdAt: at(t),
    meta: { example: true },
  };
}

const roleOf = (c) => QUESTIONS.includes(c) ? 'question'
  : (c === 'image' || c === 'svg' || c === 'chart') ? 'visual'
  : (c === 'table' || c === 'code' || c === 'latex') ? 'support' : 'teaching';

// One played lesson → pick a template per slide and lay down a few components,
// with plausible correctness on the question components.
function lessonRun({ tool, slug, user, topic, level, subjectKind, slides, correctness, t0 = 0 }) {
  const out = [];
  let t = t0;
  // A subject-appropriate content mix (mirrors the generator's leanings).
  const contentMix = subjectKind === 'math' ? ['latex', 'chart', 'stickynote', 'keypoints']
    : subjectKind === 'programming' ? ['code', 'table', 'keypoints', 'stickynote']
    : subjectKind === 'language' ? ['text', 'image', 'definition', 'stickynote']
    : ['text', 'image', 'keypoints', 'table', 'stickynote'];
  const qMix = subjectKind === 'programming' ? ['mcq', 'code', 'fill-blank']
    : subjectKind === 'language' ? ['mcq', 'writing', 'fill-blank']
    : subjectKind === 'math' ? ['mcq', 'input', 'fill-blank']
    : ['mcq', 'input', 'annotation'];
  for (let i = 0; i < slides; i++) {
    const template = TEMPLATES[(i + (subjectKind === 'programming' ? 6 : 0)) % TEMPLATES.length];
    // 2 content components + 1 question per slide.
    const c1 = contentMix[i % contentMix.length];
    const c2 = contentMix[(i + 1) % contentMix.length];
    const q = qMix[i % qMix.length];
    out.push(row({ component: c1, role: roleOf(c1), tool, slug, user, topic, level, subjectKind, template, t: t++ }));
    if (c2 !== c1) out.push(row({ component: c2, role: roleOf(c2), tool, slug, user, topic, level, subjectKind, template, t: t++ }));
    const correct = Math.random() < correctness;
    out.push(row({ component: q, role: 'question', tool, slug, user, topic, level, subjectKind, template, correct, t: t++ }));
  }
  return out;
}

const EXAMPLE_COMPONENT_USAGE = [
  ...lessonRun({ tool: 'Cybersecurity Foundations', slug: 'presentation-cybersecurity-foundations-interactive-study-tool', user: 'frzurita', topic: 'CIA triad & threat modelling', level: 'Beginner', subjectKind: 'general', slides: 6, correctness: 0.72, t0: 0 }),
  ...lessonRun({ tool: 'Cybersecurity Foundations', slug: 'presentation-cybersecurity-foundations-interactive-study-tool', user: 'ala', topic: 'Ransomware attack vectors', level: 'Lower Intermediate', subjectKind: 'general', slides: 5, correctness: 0.6, t0: 120 }),
  ...lessonRun({ tool: 'Algebra Explorer', slug: 'algebra-explorer', user: 'maria', topic: 'Quadratic equations', level: 'Upper Intermediate', subjectKind: 'math', slides: 5, correctness: 0.55, t0: 300 }),
  ...lessonRun({ tool: 'Python Basics', slug: 'python-basics', user: 'kenji', topic: 'Loops & list comprehensions', level: 'Beginner', subjectKind: 'programming', slides: 6, correctness: 0.8, t0: 480 }),
  ...lessonRun({ tool: 'Spanish A1', slug: 'spanish-a1', user: 'sam', topic: 'Ser vs estar', level: 'A1', subjectKind: 'language', slides: 4, correctness: 0.5, t0: 720 }),
  ...lessonRun({ tool: 'Cell Biology', slug: 'cell-biology', user: 'maria', topic: 'The eukaryotic cell', level: 'Beginner', subjectKind: 'general', slides: 5, correctness: 0.68, t0: 900 }),
];

module.exports = { EXAMPLE_COMPONENT_USAGE, COMPONENT_PALETTE: [...CONTENT, ...QUESTIONS], SLIDE_TEMPLATES: TEMPLATES };
