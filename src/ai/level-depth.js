/* Generic, subject-agnostic depth guidance per level. Unlike the language-only
 * CEFR objectives, this steers HOW DEEP and HOW TECHNICAL the explanation is for
 * ANY subject (math, science, history, coding, general). The key idea: as the
 * level rises you don't just write MORE — you explain in more depth and with more
 * precise, technical language. Paragraph length/count control the AMOUNT of text;
 * the level controls the DEPTH and TECHNICALITY. */

const LEVELS = ['Zero', 'Beginner', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const DEPTH = {
  Zero: 'EXTRA EASY. Use only a few words or a single very short sentence per idea — though you may use several short lines. Every line must be dead simple: no jargon at all, define anything in the plainest everyday words, use concrete familiar examples. Assume zero prior knowledge.',
  Beginner: 'VERY SIMPLE. A few short sentences. One idea at a time, plain language and everyday analogies; avoid technical terms, or immediately explain any you must use.',
  A1: 'SIMPLE and concrete. Short sentences; introduce the most basic terminology gently, always with a concrete example.',
  A2: 'ROUTINE, slightly fuller. Explain the simple "why" behind facts and introduce core terms; still mostly concrete.',
  B1: 'MODERATE depth. Explain mechanisms and reasons, use correct terminology, and connect ideas together; include some real detail.',
  B2: 'DETAILED and more TECHNICAL. Use precise terminology, cover the underlying principles, compare/contrast cases and edge cases, and justify claims.',
  C1: 'ADVANCED and RIGOROUS. Technical vocabulary, formal definitions, derivations/mechanisms, stated assumptions and limitations, and nuanced trade-offs.',
  C2: 'EXPERT / near-specialist. Full precision and nuance, formalism and (where relevant) proofs or derivations, subtle distinctions and references to deeper theory; assume a strong background.',
};

function levelDepthGuidance(level) {
  const g = DEPTH[level] || DEPTH.A1;
  return `${g} As the level rises, increase conceptual DEPTH and TECHNICAL precision across every field (reading, captions, tables, worked steps) — NOT merely word count. The requested paragraph length/count set the amount of text; this level sets how deep and technical the explanation is.`;
}

module.exports = { LEVELS, levelDepthGuidance };
