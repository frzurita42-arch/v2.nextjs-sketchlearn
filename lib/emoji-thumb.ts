/* Emoji "thumbnails". A tool's thumbnail is normally an image URL/data-URL, but
 * repos & presentations get a DEFAULT emoji instead (changeable with the 🎲 die
 * or replaced with a real image via 📎). An emoji thumbnail is stored in the same
 * `thumbnail` field with an "emoji:" prefix so nothing else in the pipeline needs
 * to change. This module is pure (no DOM) so both the server and client use it. */

export const EMOJI_POOL = [
  '📘', '🧠', '🔬', '📐', '🧪', '🧬', '🌍', '🎨', '🎵', '💡', '⚙️', '📊', '🧭', '🚀',
  '🌱', '🔎', '📝', '🎯', '🏛️', '⚗️', '🧮', '🌡️', '🔭', '📚', '✏️', '💻', '📈', '🗣️',
  '❤️', '🍽️', '📖', '🎲', '🏗️', '🧩', '🎬', '🪐', '🧲', '📀', '🖼️', '🗺️',
];

export function randomEmoji(not?: string): string {
  let e = not;
  for (let i = 0; i < 8 && (!e || e === not); i++) e = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
  return e || '💡';
}

// True when the thumbnail is an emoji sentinel ("emoji:🚀").
export function isEmojiThumb(s?: string | null): boolean {
  return typeof s === 'string' && s.startsWith('emoji:');
}

// The emoji itself, or '' when `s` is not an emoji thumbnail.
export function emojiOf(s?: string | null): string {
  return isEmojiThumb(s) ? String(s).slice(6) : '';
}

// Wrap an emoji as a thumbnail value.
export const emojiThumb = (e: string): string => `emoji:${e}`;

// Keyword → emoji so a fresh tool gets a topic-appropriate default (falls back
// to a stable pick derived from the text, so the same title keeps the same emoji).
const KEYWORDS: [RegExp, string][] = [
  [/\bmath|algebra|calculus|geometry|trigonom/i, '📐'],
  [/\bphysics|kinematic|mechanic|quantum|force|energy/i, '🔬'],
  [/\bchem|reaction|molecul/i, '🧪'],
  [/\bbio|cell|genetic|organism|anatom/i, '🧬'],
  [/\bhistory|ancient|empire|war\b|revolution/i, '🏛️'],
  [/\bgeograph|map|country|climate|earth/i, '🌍'],
  [/\bfrench|spanish|english|german|language|vocab|grammar/i, '🗣️'],
  [/\bmusic|song|melody|instrument/i, '🎵'],
  [/\bart\b|paint|draw|design|sketch/i, '🎨'],
  [/\bprogram|code|coding|software|python|javascript|web\b/i, '💻'],
  [/\beconom|business|market|finance|invest|startup|plan\b/i, '📈'],
  [/\bastronom|space|planet|galaxy|star\b/i, '🔭'],
  [/\bpsycholog|brain|mind|behav/i, '🧠'],
  [/\bhealth|medic|body|fitness|nutri/i, '❤️'],
  [/\bfood|menu|recipe|dish|cook|restaurant|cuisine/i, '🍽️'],
  [/\bwrit|essay|story|poem|novel/i, '✏️'],
  [/\bread|book|literat/i, '📖'],
  [/\bengineer|build|construct|machine/i, '⚙️'],
  [/\bdata|statistic|analytic|chart/i, '📊'],
];

export function defaultEmojiFor(text: string, tags?: string[]): string {
  const hay = `${text || ''} ${(tags || []).join(' ')}`;
  for (const [re, e] of KEYWORDS) if (re.test(hay)) return e;
  // Deterministic fallback from the text so it stays stable across reloads.
  let h = 0; for (let i = 0; i < hay.length; i++) h = (h * 31 + hay.charCodeAt(i)) >>> 0;
  return EMOJI_POOL[h % EMOJI_POOL.length];
}
