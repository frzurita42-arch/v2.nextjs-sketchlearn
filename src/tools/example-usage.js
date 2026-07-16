/* Realistic EXAMPLE token-usage rows so the dashboard's Token-usage / Cost tables
 * and charts show data before real generations accrue. Numbers use the SAME
 * estimate the live logger uses (~4 chars/token) at representative prompt/output
 * sizes, and the same rough per-provider rates. Every row is marked (example) in
 * its subject and meta.example = true, so it's clearly sample data. */
const BASE = Date.parse('2026-01-02T00:00:00.000Z');
const at = (min) => new Date(BASE + min * 60000).toISOString();
let seq = 0;

// Rough rates (must match lib/usage-log.ts). Text: USD / 1K tokens (in/out).
const TEXT = { deepseek: { in: 0.00027, out: 0.0011 }, gemini: { in: 0.000075, out: 0.0003 } };
const IMG = { openai: 0.04, gemini: 0.03, grok: 0.07, replicate: 0.003, leonardo: 0.01, pollinations: 0 };
const round = (n) => Math.round(n * 1e6) / 1e6;

function textRow({ user, kind, provider = 'deepseek', pt, ct, subject, prompt, t }) {
  const price = TEXT[provider] || TEXT.deepseek;
  return {
    id: `ex-au-${(seq++).toString(36)}`, username: user, kind, provider, model: 'text',
    promptTokens: pt, completionTokens: ct, totalTokens: pt + ct,
    costUsd: round((pt / 1000) * price.in + (ct / 1000) * price.out),
    subject: `${subject} (example)`, meta: { example: true, prompt }, createdAt: at(t),
  };
}
function imageRow({ user, kind, provider, subject, prompt, t }) {
  return {
    id: `ex-au-${(seq++).toString(36)}`, username: user, kind, provider, model: 'image',
    promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: IMG[provider] ?? 0.02,
    subject: `${subject} (example)`, meta: { example: true, prompt }, createdAt: at(t),
  };
}

// One lesson generation = a studio design + (per slide) a slide + a support image,
// plus a thumbnail. Mirrors what the live endpoints log.
function lessonUsage({ user, subject, slides, textProvider = 'deepseek', imgProvider = 'openai', t0 = 0 }) {
  const out = [];
  let t = t0;
  out.push(textRow({ user, kind: 'studio-design', provider: textProvider, pt: 1000, ct: 520, subject, prompt: `Design a ${slides}-slide presentation that teaches ${subject} and checks comprehension…`, t: t++ }));
  for (let i = 1; i <= slides; i++) {
    out.push(textRow({ user, kind: 'slide', provider: textProvider, pt: 900, ct: 320, subject: `${subject} — slide ${i}`, prompt: `Generate slide ${i} of ${slides} for a ${subject} lesson at Beginner level. Teach one idea then produce the questions…`, t: t++ }));
    out.push(imageRow({ user, kind: 'support-image', provider: imgProvider, subject: `${subject} — slide ${i} image`, prompt: `A clear, labelled infographic representing ${subject}. No text.`, t: t++ }));
  }
  out.push(imageRow({ user, kind: 'thumbnail', provider: imgProvider, subject, prompt: `An AI-startup style thumbnail representing ${subject}.`, t: t++ }));
  return out;
}

// A few lessons across two authors, with different image backends so the cost
// mix (images dominate) is visible.
const EXAMPLE_USAGE = [
  ...lessonUsage({ user: 'sketchlearn', subject: 'Photosynthesis', slides: 3, imgProvider: 'openai', t0: 0 }),
  ...lessonUsage({ user: 'sketchlearn', subject: 'French A1 — Greetings', slides: 5, textProvider: 'deepseek', imgProvider: 'gemini', t0: 30 }),
  ...lessonUsage({ user: 'demo_teacher', subject: 'Python Basics', slides: 4, imgProvider: 'replicate', t0: 70 }),
  ...lessonUsage({ user: 'demo_teacher', subject: 'World History', slides: 5, imgProvider: 'pollinations', t0: 110 }),
];

module.exports = { EXAMPLE_USAGE };
