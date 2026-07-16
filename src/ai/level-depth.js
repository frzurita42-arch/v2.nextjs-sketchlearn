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

// A hard LENGTH cap per level, so the amount of text is proportional to the level
// (a Zero/Beginner reading must be short — a couple of sentences — not a wall of
// text). Authoritative: it overrides any larger paragraph setting at low levels.
// Vocabulary / comprehension difficulty scales separately via levelDepthGuidance.
const LENGTH = {
  'Zero': 'LENGTH (STRICT): at most 2 very short, very simple sentences in TOTAL — no more, even if a longer length was requested.',
  'Lower Beginner': 'LENGTH (STRICT): at most 3 short, simple sentences in TOTAL.',
  'Beginner': 'LENGTH (STRICT): at most 4 short sentences (a few lines) in TOTAL — keep it brief.',
  'Upper Beginner': 'LENGTH: about 4–5 short sentences (one small paragraph).',
  'Lower Intermediate': 'LENGTH: about one paragraph (roughly 5–6 sentences).',
  'Intermediate': 'LENGTH: one to two short paragraphs.',
  'Upper Intermediate': 'LENGTH: about two paragraphs.',
  'Lower Advanced (Undergrad)': 'LENGTH: two to three paragraphs.',
  'Advanced (Graduate)': 'LENGTH: about three paragraphs, dense.',
  'Upper Advanced (PhD level)': 'LENGTH: three to four dense paragraphs.',
};

function levelLengthGuidance(level) {
  return LENGTH[level] || LENGTH['Beginner'];
}

// Paragraph DENSITY — an INDEPENDENT amount-of-text control the learner can set,
// separate from the level. Level sets the vocabulary / comprehension difficulty;
// density sets HOW MUCH text. Together they let e.g. advanced vocabulary appear in
// a short, low-density reading. When a density is chosen it drives the amount
// (overriding the level's default length); when it isn't, length follows the level.
const PARA_DENSITIES = ['Low', 'Low-Medium', 'Medium', 'Medium-High', 'High'];
const PARA_DENSITY = {
  'Low': 'TEXT DENSITY = LOW: very little text — only 1 to 2 sentences total. Minimal.',
  'Low-Medium': 'TEXT DENSITY = LOW-MEDIUM: a little text — about 2 to 3 sentences total.',
  'Medium': 'TEXT DENSITY = MEDIUM: a short paragraph — about 4 to 5 sentences.',
  'Medium-High': 'TEXT DENSITY = MEDIUM-HIGH: one to two paragraphs.',
  'High': 'TEXT DENSITY = HIGH: two to three fuller paragraphs.',
};

function paragraphDensityGuidance(density) {
  return PARA_DENSITY[String(density || '')] || '';
}

// The combined text-amount instruction: density controls the AMOUNT (if chosen),
// otherwise the level's own length cap does; the level always controls difficulty.
function textAmountGuidance(level, density) {
  const d = paragraphDensityGuidance(density);
  const amount = d || levelLengthGuidance(level);
  return `${amount} IMPORTANT: the AMOUNT of text is set by the density above; the LEVEL "${level}" sets the vocabulary / comprehension DIFFICULTY (simpler words at low levels, richer at high) — treat these TWO independently, so advanced vocabulary can appear in a short low-density text and simple words in a longer one.`;
}

module.exports = { LEVELS, levelDepthGuidance, levelLengthGuidance, PARA_DENSITIES, paragraphDensityGuidance, textAmountGuidance };
