// Lenient matching for typed answers in language/lesson challenges.
//
// Learners shouldn't need the exact spelling, accents or full wording to be
// marked right: "cafe" should count for "una taza de café" (with a note that a
// fuller answer exists), and a one-letter typo shouldn't fail a spelling item.
// This is accent-insensitive, tolerant of minor typos, and — for vocabulary —
// accepts a partial phrase that covers the key word(s).

// Lowercase, strip accents/diacritics, drop punctuation, collapse whitespace.
export function normalize(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Levenshtein edit distance (small strings, so the simple DP is fine).
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// Common articles/particles across the taught languages — ignored so a missing
// "una"/"the"/"le" never fails an otherwise-correct answer.
const STOP = new Set([
  'a', 'an', 'the', 'of', 'to', 'and',
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'uno', 'y', 'e',
  'le', 'les', 'du', 'des', 'un', 'une', 'et',
  'il', 'lo', 'gli', 'i', 'di', 'da',
  'der', 'die', 'das', 'ein', 'eine', 'und',
]);

function contentWords(s: string): string[] {
  return normalize(s).split(' ').filter((w) => w && !STOP.has(w));
}

// Numbers in a string, normalized (thousands separators dropped, decimals kept).
function numbersOf(s: string): string[] {
  return (String(s || '').match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
}
function sameNumbers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort(); const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export type MatchResult = { accept: boolean; close: boolean };

// Decide whether `guess` should be accepted against any of `accepted`.
//  • mode 'spelling' — exact letters matter, so only accent-folding + a 1–2
//    character typo is forgiven.
//  • mode 'vocab' (default) — also accepts a partial phrase that covers the key
//    word(s); `close` marks an accepted-but-not-full answer so the UI can note
//    that a more complete answer exists.
export function matchAnswer(
  guess: string,
  accepted: string[],
  mode: 'vocab' | 'spelling' = 'vocab',
): MatchResult {
  const g = normalize(guess);
  if (!g) return { accept: false, close: false };
  // Pair each accepted answer with its raw form so we can check numbers exactly.
  const cands = accepted.map((raw) => ({ raw, norm: normalize(raw) })).filter((c) => c.norm);
  const gNums = numbersOf(guess);

  for (const { raw, norm: a } of cands) {
    if (!a) continue;
    // NUMBERS MUST BE EXACT: if either side has numbers, they must match exactly
    // (so "11" is never accepted for "12", and "$12.50" needs the right figure).
    // A grammar/spelling slip in the words is still fine.
    const aNums = numbersOf(raw);
    if ((aNums.length || gNums.length) && !sameNumbers(aNums, gNums)) continue;
    if (a === g) return { accept: true, close: false };
    const d = lev(g, a);
    if (mode === 'spelling') {
      if (d <= 1) return { accept: true, close: false };
      if (d <= 2) return { accept: true, close: true };
      continue;
    }
    // vocab
    const ratio = 1 - d / Math.max(g.length, a.length);
    if (ratio >= 0.85) return { accept: true, close: false };
    const gw = contentWords(guess);
    const aw = contentWords(a);
    if (gw.length && aw.length) {
      const near = (w: string, list: string[]) => list.some((x) => x === w || lev(w, x) <= 1);
      const gInA = gw.every((w) => near(w, aw));       // every typed word is in the answer
      const aInG = aw.every((w) => near(w, gw));       // every answer word is present
      if (aInG) return { accept: true, close: false };  // said everything (maybe + extra)
      if (gInA) return { accept: true, close: true };   // partial phrase, e.g. "café" ⊂ "una taza de café"
      // shares the main (last) content word — the noun in most phrases
      if (near(aw[aw.length - 1], gw)) return { accept: true, close: true };
    }
    if (ratio >= 0.6) return { accept: true, close: true };
  }
  return { accept: false, close: false };
}

// A progressive, spoiler-light hint: reveal a growing prefix and mask the rest,
// keeping word spacing. `tries` is how many misses so far (1-based).
export function answerHint(answer: string, tries: number): string {
  const a = String(answer || '').trim();
  if (!a) return '';
  const reveal = Math.min(Math.max(1, tries + 1), a.length - 1);
  return a
    .split('')
    .map((ch, i) => (ch === ' ' ? ' ' : i < reveal ? ch : '·'))
    .join('');
}
