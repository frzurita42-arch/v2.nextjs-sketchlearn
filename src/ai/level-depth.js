/* Generic, subject-agnostic depth guidance per level. Unlike the language-only
 * CEFR objectives, this steers HOW DEEP and HOW TECHNICAL the explanation is for
 * ANY subject (math, science, history, coding, general). The key idea: as the
 * level rises you don't just write MORE — you explain in more depth and with more
 * precise, technical language. Paragraph length/count control the AMOUNT of text;
 * the level controls the DEPTH and TECHNICALITY. */

// The general academic depth scale used for tool generation (Zero → PhD). Language
// tools keep their own CEFR scale; this steers HOW DEEP/TECHNICAL for any subject.
const LEVELS = [
  'Zero', 'Lower Beginner', 'Beginner', 'Upper Beginner',
  'Lower Intermediate', 'Intermediate', 'Upper Intermediate',
  'Lower Advanced (Undergrad)', 'Advanced (Graduate)', 'Upper Advanced (PhD level)',
];

const DEPTH = {
  'Zero': 'EXTRA EASY. Only a few words or one very short sentence per idea. Dead simple: no jargon at all, define anything in the plainest everyday words, concrete familiar examples. Assume zero prior knowledge.',
  'Lower Beginner': 'VERY SIMPLE, first steps. Short sentences, one tiny idea at a time, lots of everyday analogies; introduce only the most essential word or two, always explained.',
  'Beginner': 'SIMPLE. A few short sentences per idea; plain language and everyday analogies; avoid technical terms, or immediately explain any you must use.',
  'Upper Beginner': 'SIMPLE but a little fuller. Introduce basic terminology gently, always with a concrete example; start connecting two ideas.',
  'Lower Intermediate': 'ROUTINE, fuller. Explain the simple "why" behind facts and use core terms; still mostly concrete, with some real detail.',
  'Intermediate': 'MODERATE depth. Explain mechanisms and reasons, use correct terminology, and connect ideas together; include genuine detail.',
  'Upper Intermediate': 'DETAILED and more TECHNICAL. Precise terminology, underlying principles, compare/contrast cases and edge cases, justify claims.',
  'Lower Advanced (Undergrad)': 'ADVANCED, undergraduate. Technical vocabulary, formal definitions, derivations/mechanisms, stated assumptions and limitations, nuanced trade-offs.',
  'Advanced (Graduate)': 'GRADUATE-level rigour. Full precision, formalism and (where relevant) proofs/derivations, subtle distinctions, connections to broader theory; assume a strong background.',
  'Upper Advanced (PhD level)': 'EXPERT / near-specialist (doctoral). Complete precision and nuance, formal proofs/derivations where relevant, open questions, references to deeper and current theory; assume a specialist background.',
};

function levelDepthGuidance(level) {
  const g = DEPTH[level] || DEPTH['Beginner'];
  return `${g} As the level rises, increase conceptual DEPTH and TECHNICAL precision across every field (reading, captions, tables, worked steps) — NOT merely word count. The requested paragraph length/count set the amount of text; this level sets how deep and technical the explanation is.`;
}

module.exports = { LEVELS, levelDepthGuidance };
