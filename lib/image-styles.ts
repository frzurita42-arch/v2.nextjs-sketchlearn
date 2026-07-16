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
  'Infographic',
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
  Infographic: 'a clean modern INFOGRAPHIC — flat vector shapes, simple icons, labelled parts with thin leader lines, a tidy colour palette and clear visual hierarchy that explains the subject at a glance (short labels are welcome)',
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

// Steer AWAY from stiff, camera-facing group portraits toward candid, in-the-moment
// slice-of-life scenes — people absorbed in a real activity related to the content,
// or just the relevant objects/scene when that shows the idea better.
export const SCENE_RULE = 'COMPOSITION: prefer a purely visual representation — the relevant OBJECTS / setting on their own, or a simple diagram / chart / infographic — and only show a person when a person genuinely fits the content. WHEN a person IS shown, show EXACTLY ONE person (never two, never a group) genuinely BUSY IN A MUNDANE everyday ACTIVITY that fits the content — mid-action, absorbed in the task, seen from a natural, off-centre angle like documentary / photojournalism, a moment caught in passing. The person NEVER looks at, faces, or poses for the camera. Choose the everyday task that best matches this slide: e.g. one person sipping coffee at a café table, tending a garden, folding laundry, reading a book in an armchair, cooking at the stove, waiting at a bus stop. NEVER a posed portrait and NEVER a group scene.';

// For EXPLANATORY / technical slides (STEM, how-things-work): make the SUBJECT
// itself the visual — a labelled diagram, infographic, chart, or a clean picture
// of the object/organism/structure. Short labels ARE allowed here (this rule is
// used INSTEAD of NO_TEXT_RULE), because a labelled diagram needs its labels.
export const DIAGRAM_RULE = 'COMPOSITION: make the SUBJECT of this slide the visual itself — NOT people. Choose the clearest of: a labelled scientific DIAGRAM (draw the actual organism / plant / cell / organ / structure / device and use thin leader lines with SHORT text labels naming its parts), an INFOGRAPHIC, a simple CHART / graph, or a clean close-up illustration or photo of the object being discussed. Short, correctly-spelled labels and numbers are welcome; avoid long sentences or paragraphs. Do NOT show unrelated people or a social scene — the subject / concept is the focus.';

// For everyday / general slides: pick the best-fitting visual TYPE and VARY it
// across slides — do not always show people.
export const VARIED_RULE = 'COMPOSITION: pick the visual TYPE that best fits THIS slide and VARY it from slide to slide — it may be (a) a clear photo or illustration of the key OBJECT(s) being discussed, (b) a simple infographic / diagram / chart / labelled figure when the slide EXPLAINS how something works, or (c) a candid real-life activity scene ONLY when the topic is genuinely about people or an everyday situation. Do NOT default to people for explanatory content — lean on objects, diagrams and infographics. When you DO show a person, show EXACTLY ONE person (never two, never a group) doing a mundane everyday task, candid — never posing or facing the camera.';

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
  // An infographic NEEDS its short labels — allow text for it instead of NO_TEXT_RULE.
  if (s === 'Infographic') {
    return `ART STYLE (MANDATORY): render this as ${desc}. Short, correctly-spelled labels/numbers are welcome; avoid long sentences or paragraphs.${adult}`;
  }
  return `ART STYLE (MANDATORY): render this as ${desc}. Commit fully to this style and ignore any conflicting style wording elsewhere in the prompt.${adult} ${NO_TEXT_RULE}`;
}
