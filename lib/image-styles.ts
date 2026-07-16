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
  'Hand-drawn (coloured pencils & markers)',
  'Soviet propaganda posters',
  'Childish cartoon',
] as const;

const STYLE_PROMPT: Record<string, string> = {
  Cinematic: 'a cinematic film still — a real photographic frame with dramatic lighting, shallow depth of field and filmic colour grading',
  Photorealistic: 'a photorealistic, natural-light photograph shot on a real camera — lifelike skin, real materials and true-to-life lighting',
  'Editorial photo': 'a clean editorial / magazine photograph shot on a real camera',
  'Vintage 1950s': 'a 1950s vintage colour photograph — retro film grain, period wardrobe and cars',
  Theatrical: 'a theatrical, stage-lit, dramatically composed photographic scene',
  Watercolor: 'a soft watercolour painting',
  'Oil painting': 'a classical oil painting',
  'Comic book': 'a bold comic-book / graphic-novel ink illustration',
  Anime: 'a clean anime / manga illustration',
  Minimalist: 'a minimalist flat-vector illustration',
  'Hand-drawn (coloured pencils & markers)': 'a hand-drawn illustration made with coloured pencils and felt-tip markers — visible pencil strokes and marker texture on paper, warm and personal, like a sketchbook drawing',
  'Soviet propaganda posters': 'a bold Soviet-style propaganda poster — flat graphic shapes, heroic idealized figures, strong diagonal constructivist composition, a limited red / gold / cream palette, dramatic low-angle heroism',
  'Childish cartoon': 'a playful, colourful cartoon aimed at young children',
};

// Styles that MUST come back as a real photograph, never a drawing. For these we
// add a hard override so any "illustration / cartoon" wording elsewhere in the
// prompt (including the model's own image description) is ignored.
const PHOTO_STYLES = new Set(['Photorealistic', 'Editorial photo', 'Cinematic', 'Vintage 1950s', 'Theatrical']);

// Every generated image should be a picture only — never a poster with text.
export const NO_TEXT_RULE = 'IMPORTANT: the image must contain NO text, words, letters, numbers, labels, captions or writing of any kind — just the picture itself.';

// A directive prepended to an image-generation prompt to steer its art style.
// The medium instruction is stated FIRST and assertively so it wins over any
// stray "illustration"/"cartoon" wording that appears later in the prompt.
export function imageStyleDirective(style?: string): string {
  const s = String(style || '').trim();
  if (!s || s === 'Any') {
    // Default to a REAL photograph — the app kept returning cartoons, and a
    // photographic default is what users expect unless they pick an art style.
    return `ART STYLE: render this as a realistic, natural-light PHOTOGRAPH for an ADULT / general audience. It must NOT be a cartoon, illustration, clip-art, vector art or childish drawing. ${NO_TEXT_RULE}`;
  }
  const desc = STYLE_PROMPT[s] || s;
  // For photographic styles, forbid any illustrated look outright — this is what
  // makes "Photorealistic" actually return a photo instead of a cartoon.
  if (PHOTO_STYLES.has(s)) {
    return `ART STYLE (MANDATORY): render this as ${desc}. This MUST be a REAL PHOTOGRAPH — lifelike and photographic. It must NOT be an illustration, cartoon, drawing, clip-art, vector art, anime, 3D render, painting or any stylised/graphic look, EVEN IF the description above says "illustration", "cartoon", "drawing" or similar — ignore any such wording and produce a genuine photograph. Keep it tasteful and suited to an adult / general audience. ${NO_TEXT_RULE}`;
  }
  const adult = s === 'Childish cartoon' ? '' : ' Keep it tasteful and suited to an adult / general audience.';
  return `ART STYLE (MANDATORY): render this as ${desc}. Commit fully to this style and ignore any conflicting style wording elsewhere in the prompt.${adult} ${NO_TEXT_RULE}`;
}
