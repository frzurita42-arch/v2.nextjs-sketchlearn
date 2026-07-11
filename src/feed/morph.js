/* The "10% nudge" morph engine. When a user has ALREADY seen a post, the next
 * time it surfaces we serve a variant that's slightly different — same core
 * message, a fresh angle — so the feed feels alive instead of static.
 *
 * Deterministic by design: keyed on postId + how many times it's been seen, so a
 * given post morphs the same way for everyone and never churns randomly. It
 * reframes the LEAD and swaps a closing nudge (~10-15% of the text), preserving
 * the body's meaning. Every morphed post is flagged so the UI can label it
 * "freshened variant — AI-generated". (An AI-backed morph can be dropped in
 * later behind the same signature; this keyless version keeps the feature
 * working with zero latency and no key.) */

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

// Reframers that keep the message but shift the angle. Chosen by (hash + seenCount).
const REFRAMES = [
  (t) => `Another angle on this: ${lowerFirst(t)}`,
  (t) => `Still stands a bit later — ${lowerFirst(t)}`,
  (t) => `Coming back to this with fresh eyes: ${lowerFirst(t)}`,
  (t) => `Same idea, said differently — ${lowerFirst(t)}`,
  (t) => `Worth a second look: ${lowerFirst(t)}`,
  (t) => `One more way to frame it — ${lowerFirst(t)}`,
];
const CLOSERS = [
  ' (What would you cut first?)',
  ' — curious how others approach it.',
  ' Small steps, still counts.',
  ' The version that ships wins.',
  ' Anyway — build the thing.',
];

function morphText(text, seed) {
  if (!text) return text;
  const reframe = REFRAMES[seed % REFRAMES.length];
  const closer = CLOSERS[(seed >> 3) % CLOSERS.length];
  return `${reframe(text)}${closer}`;
}

// Return a morphed copy of a post if the viewer has seen it (seenCount > 0),
// otherwise the post unchanged.
function morphPost(post, seenCount) {
  const n = parseInt(seenCount, 10) || 0;
  if (n <= 0) return post;
  const seed = (hashStr(post.id) + n) >>> 0;
  return {
    ...post,
    body: morphText(post.body, seed),
    morphed: true,
    morphCount: n,
  };
}

module.exports = { morphPost, morphText };
