// Art styles for AI-generated lesson images. Chosen as a per-tool preset and/or
// overridden per slide in the player. "Any" lets the AI pick. The default (no
// style set) leans mature/tasteful so images aren't childish unless asked.

export const IMAGE_STYLES = [
  'Any',
  'Cinematic',
  'Photorealistic',
  'Editorial photo',
  'Vintage 1950s',
  'Theatrical',
  'Watercolor',
  'Oil painting',
  'Comic book',
  'Anime',
  'Minimalist',
  'Soviet propaganda posters',
  'Childish cartoon',
] as const;

const STYLE_PROMPT: Record<string, string> = {
  Cinematic: 'a cinematic film still — dramatic lighting, shallow depth of field, filmic colour',
  Photorealistic: 'a photorealistic, natural-light photograph',
  'Editorial photo': 'a clean editorial / magazine photograph',
  'Vintage 1950s': 'a 1950s vintage illustration / retro advertisement look',
  Theatrical: 'a theatrical, stage-lit, dramatically composed scene',
  Watercolor: 'a soft watercolour painting',
  'Oil painting': 'a classical oil painting',
  'Comic book': 'a bold comic-book / graphic-novel ink illustration',
  Anime: 'a clean anime / manga illustration',
  Minimalist: 'a minimalist flat-vector illustration',
  'Soviet propaganda posters': 'a bold Soviet-style propaganda poster — flat graphic shapes, heroic idealized figures, strong diagonal constructivist composition, a limited red / gold / cream palette, dramatic low-angle heroism',
  'Childish cartoon': 'a playful, colourful cartoon aimed at young children',
};

// Every generated image should be a picture only — never a poster with text.
export const NO_TEXT_RULE = 'IMPORTANT: the image must contain NO text, words, letters, numbers, labels, captions or writing of any kind — just the picture itself.';

// A directive appended to an image-generation prompt to steer its art style.
export function imageStyleDirective(style?: string): string {
  const s = String(style || '').trim();
  if (!s || s === 'Any') {
    return `Art style: choose the style that best fits the subject for an ADULT / general audience — tasteful and mature, NOT a childish cartoon (unless the lesson is clearly meant for young children). ${NO_TEXT_RULE}`;
  }
  const desc = STYLE_PROMPT[s] || s;
  const adult = s === 'Childish cartoon' ? '' : ' Keep it tasteful and suited to an adult / general audience.';
  return `Art style: render it as ${desc}.${adult} ${NO_TEXT_RULE}`;
}
