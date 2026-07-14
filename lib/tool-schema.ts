/* The Tool Definition — the JSON contract for the generic tool maker.
 * A published tool is one of two archetypes:
 *   - generator: settings form + a prompt template -> AI produces an output artifact
 *   - app:       an entry form + a display -> users add/browse records (entries)
 * The runtime (ToolRunnerView) interprets this; the Builder chat authors it.
 * Shared by client and server so validation lives in exactly one place. */

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'select-or-custom' | 'toggle' | 'date' | 'image' | 'audio' | 'drawing';

export interface ToolField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];        // for select / select-or-custom
  default?: any;
  placeholder?: string;
  required?: boolean;
}

export type Archetype = 'generator' | 'app' | 'lesson' | 'repo';
export type GeneratorOutput = 'text' | 'cards' | 'table';
export type AppDisplay = 'cards' | 'list' | 'table';

export type SubjectKind = 'general' | 'language' | 'math' | 'programming';

export interface LessonSupport {
  images?: boolean;
  code?: boolean;
  tables?: boolean;
  formulas?: boolean;   // math / Wolfram-style formulas (rendered as a formula block)
  audio?: boolean;
  geogebra?: boolean;   // an interactive GeoGebra graph / math visual
}

export type LessonMode = 'slides' | 'conversation' | 'journal';

// One designed slide/page: which components appear and its text density. When a
// lesson carries `pages`, each slide is generated from its page spec (instead of
// a random draw from the lesson-wide activity/support sets).
export interface LessonPage {
  activityTypes?: string[];
  support?: LessonSupport;
  paragraphsPerSlide?: number;
  paragraphLength?: 'brief' | 'medium' | 'detailed';
  style?: string;          // compiled per-page "how to use these components"
  padSize?: 'large' | 'medium' | 'adaptive';   // annotation pad size for this slide
  decorations?: { kind: string; message?: string; link?: string; action?: string }[];   // links / messages / buttons on the slide
  reading?: boolean;       // include a reading passage on this slide
}

export interface LessonSpec {
  subject: string;         // "French", "Algebra", "World History"...
  level?: string;          // default level label
  // 'slides'       -> the scored slide deck (default).
  // 'conversation' -> an AI chat on the annotation pad: write/draw a message, the
  //                   AI replies at the top; exit anytime for a published report.
  // 'journal'      -> a no-AI diary: write pages and post them.
  mode?: LessonMode;
  totalSlides: number;     // how many slides to play (clamped 3-15)
  language?: string;       // target language for a language lesson (enables speak/translate)
  translateTo?: string;    // default 'English'
  style?: string;          // extra generation guidance
  subjectKind?: SubjectKind;        // steers support material + activity mix
  paragraphsPerSlide?: number;      // 1-4
  paragraphLength?: 'brief' | 'medium' | 'detailed';
  support?: LessonSupport;          // which support materials may appear
  activityTypes?: string[];         // subset of ['mcq','fill-blank','input','writing','annotation','code'] to shuffle
  pages?: LessonPage[];             // when set, each slide is composed from its page spec
  // Viewing options (owner/admin choose in the tool Settings):
  //   'both'    -> viewers may open the saved original deck OR generate a fresh replica
  //   'history' -> only the saved original deck (no new generation) if one exists
  //   'replica' -> only generate a fresh AI replica (no history offered)  [default]
  viewMode?: 'both' | 'history' | 'replica';
  // The original generated deck (slides + the config used), saved by the owner
  // so viewers can replay the exact same slides with their answers/answer key.
  savedDeck?: { config?: Record<string, any>; slides?: any[]; savedAt?: string; savedBy?: string; results?: Record<string, any> };
  offlineExport?: boolean;   // show the "download offline copy (.zip)" button (default on)
}

export interface GeneratorSpec {
  systemPrompt?: string;
  promptTemplate: string;    // may contain {{fieldId}} placeholders from `settings`
  output: GeneratorOutput;
}

export interface AppSpec {
  entryFields: ToolField[];
  display: AppDisplay;
  review?: boolean;          // if true, new entries start 'pending' for owner approval
}

// ---- Repository archetype -------------------------------------------------
// A repository is a nested tree of cards ("layers of different levels" — no
// pages, unlike a lesson). A card can hold a title/subtitle/text, a set of
// link buttons, an optional per-user completion toggle, and nested child cards.
// This supports both course-like repos (Week 1 ▸ Unit 1 ▸ activities with links
// + done toggles) and post-like repos (a card with text and links).
export interface RepoLink {
  label: string;
  url: string;
  // 'poster' (blue) — posted by the owner/admin; everyone can open/download it.
  // 'user'   (green) — uploaded by a viewer; only they (or an admin) can remove it.
  color?: 'blue' | 'green';
  by?: string;                // username who added this link (for the User kind)
}

export interface RepoCard {
  id: string;
  // 'card'    -> a nested card (a box inside its parent box)
  // 'section' -> a sibling grouping div placed below (its own template area)
  kind?: 'card' | 'section';
  title?: string;
  subtitle?: string;
  text?: string;
  image?: string;            // icon/cover image: an uploaded data URL or an https URL
  genImage?: string;         // an AI-generated picture of this product/service, shown
                             // in a popup via the 🖼️ frame button (owner/admin request
                             // it; it stays saved for everyone until 💦 clears it).
                             // Gated by RepoSpec.imageGen.
  icon?: string;             // an emoji shown as the card icon INSTEAD of an image
                             // (e.g. number keycaps 1️⃣0️⃣); set by the 🔢 button
  links?: RepoLink[];        // each rendered as a button that opens its url
  completable?: boolean;     // when true, shows a per-user completion toggle
  collect?: boolean;         // when true, ANY user can add their own entry inside
                             // (e.g. upload payment proof for their month). Each
                             // user sees their own submissions; the owner sees all.
  collectPrompt?: string;    // hint shown on the "add your entry" form
  statuses?: string[];       // when set, owner/admin can move each submission
                             // between these labels (e.g. ["pending","paid"]).
  layout?: 'bars' | 'grid';  // how THIS card's children are arranged (overrides repo default)
  hidden?: boolean;          // when true, hidden from normal viewers; owner/admin
                             // still see it (greyed out) and can toggle it back
  // One owner/admin-cycled mode per card (absent = 'enabled', the default):
  //  assigned|pending|approved|rejected → a workflow status chip (card stays usable)
  //  disabled → normal viewers see it greyed + unclickable (full content visible)
  //  preview  → normal viewers see ONLY the name + description, greyed + unclickable
  // None of these affect the owner/admin, who always see and use the whole card.
  mode?: 'assigned' | 'pending' | 'approved' | 'rejected' | 'disabled' | 'preview';
  children?: RepoCard[];     // nested cards / sections one level deeper
}

export interface RepoSpec {
  layout?: 'course' | 'post';   // a hint for default styling
  display?: 'bars' | 'grid';    // default arrangement of cards (horizontal bars or a grid)
  displayLocked?: boolean;      // owner/admin lock: when true viewers can't switch grid/rows
  offlineExport?: boolean;      // show the "download offline copy (.zip)" button (default on)
  // Configurations access — whether NORMAL users (not just owner/admin) may use
  // the attach buttons. The 4 states All / Only 📁 / Only 📎 / None are just the
  // combinations of these two. Owner/admin always have both. Default: both off
  // (attaching is owner/admin-only).
  clipForAll?: boolean;         // 📎 clip attach available to all users
  folderForAll?: boolean;       // 📁 folder attach available to all users
  imageGen?: boolean;           // "Suggest AI": show the 🖼️ per-card picture button
                                // (owner/admin generate an image of the item; it stays
                                // saved for everyone until cleared). Default off.
  cards: RepoCard[];
}

export interface ToolDefinition {
  version: number;
  archetype: Archetype;
  title: string;
  description?: string;
  tags?: string[];
  settings: ToolField[];     // generator: the inputs; app: usually empty; lesson: learner options
  generator?: GeneratorSpec;
  app?: AppSpec;
  lesson?: LessonSpec;
  repo?: RepoSpec;
}

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'select', 'select-or-custom', 'toggle', 'date', 'image', 'audio', 'drawing'];

export function slugify(s: string): string {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 75) || 'tool';
}

// Fill {{fieldId}} placeholders in a prompt template from the collected values.
export function fillTemplate(tpl: string, values: Record<string, any>): string {
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (values[k] != null ? String(values[k]) : ''));
}

export function defaultsFor(fields: ToolField[] = []): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.id] = f.default;
    else if (f.type === 'toggle') out[f.id] = false;
    else if (f.type === 'number') out[f.id] = 0;
    else if ((f.type === 'select' || f.type === 'select-or-custom') && f.options?.length) out[f.id] = f.options[0];
    else out[f.id] = '';
  }
  return out;
}

function cleanField(f: any): ToolField | null {
  const id = slugify(f?.id || f?.label || '').replace(/-/g, '_');
  const label = String(f?.label || f?.id || '').slice(0, 80);
  if (!id || !label) return null;
  const type: FieldType = FIELD_TYPES.includes(f?.type) ? f.type : 'text';
  const field: ToolField = { id, label, type };
  if (Array.isArray(f?.options)) field.options = f.options.map((o: any) => String(o).slice(0, 80)).filter(Boolean).slice(0, 20);
  if (f?.default !== undefined) field.default = f.default;
  if (f?.placeholder) field.placeholder = String(f.placeholder).slice(0, 120);
  if (f?.required) field.required = true;
  // A select needs options; downgrade to text if none were provided.
  if ((type === 'select' || type === 'select-or-custom') && !field.options?.length) field.type = 'text';
  return field;
}

let _repoIdSeq = 0;
function cleanRepoCard(c: any, depth: number): RepoCard | null {
  if (!c || typeof c !== 'object' || depth > 4) return null;
  const kind: 'card' | 'section' = c.kind === 'section' ? 'section' : 'card';
  const title = String(c.title || '').slice(0, 160);
  const subtitle = String(c.subtitle || '').slice(0, 200);
  const text = String(c.text || '').slice(0, 4000);
  const links: RepoLink[] = (Array.isArray(c.links) ? c.links : []).slice(0, 12).map((l: any) => {
    const link: RepoLink = {
      label: String(l?.label || l?.text || 'Open link').slice(0, 80),
      url: String(l?.url || l?.href || '').slice(0, 800),
    };
    if (l?.color === 'green') link.color = 'green';
    if (l?.by) link.by = String(l.by).slice(0, 40);
    return link;
  }).filter((l: RepoLink) => /^https?:\/\//i.test(l.url) || l.url.startsWith('/'));
  const children: RepoCard[] = (Array.isArray(c.children) ? c.children : [])
    .slice(0, 40).map((k: any) => cleanRepoCard(k, depth + 1)).filter(Boolean) as RepoCard[];
  // Keep a stable id so per-user completion toggles survive re-saves.
  const id = String(c.id || '').slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '') || `c${Date.now().toString(36)}${(_repoIdSeq++).toString(36)}`;
  // Icon/cover image: a data URL (uploaded / AI-generated) or an https URL.
  const rawImg = String(c.image || '').slice(0, 1_500_000);
  const image = (/^data:image\//i.test(rawImg) || /^https?:\/\//i.test(rawImg)) ? rawImg : '';
  // AI-generated product picture (shown in the 🖼️ popup) — same accepted forms.
  const rawGen = String(c.genImage || '').slice(0, 2_000_000);
  const genImage = (/^data:image\//i.test(rawGen) || /^https?:\/\//i.test(rawGen)) ? rawGen : '';
  const card: RepoCard = { id, kind };
  if (title) card.title = title;
  if (subtitle) card.subtitle = subtitle;
  if (text) card.text = text;
  if (image) card.image = image;
  if (genImage) card.genImage = genImage;
  const icon = String(c.icon || '').slice(0, 40);
  if (icon) card.icon = icon;
  if (links.length) card.links = links;
  if (c.completable) card.completable = true;
  if (c.collect) card.collect = true;
  const collectPrompt = String(c.collectPrompt || '').slice(0, 200);
  if (collectPrompt) card.collectPrompt = collectPrompt;
  const statuses = (Array.isArray(c.statuses) ? c.statuses : []).map((s: any) => String(s).slice(0, 24).trim()).filter(Boolean).slice(0, 8);
  if (statuses.length) card.statuses = statuses;
  if (c.layout === 'bars' || c.layout === 'grid') card.layout = c.layout;
  if (c.hidden) card.hidden = true;
  if (['assigned', 'pending', 'approved', 'rejected', 'disabled', 'preview'].includes(c.mode)) card.mode = c.mode;
  if (children.length) card.children = children;
  // A card with no content at all is dropped.
  if (!title && !subtitle && !text && !image && !icon && !links.length && !children.length && !card.completable && !card.collect) return null;
  return card;
}

// Validate + normalize an untrusted definition (from the AI or an API caller).
// Returns a safe, shaped ToolDefinition or a list of errors.
export function validateToolDefinition(input: any): { ok: boolean; errors: string[]; def?: ToolDefinition } {
  const errors: string[] = [];
  const d = input || {};
  const archetype: Archetype = d.archetype === 'app' ? 'app' : d.archetype === 'lesson' ? 'lesson' : d.archetype === 'repo' ? 'repo' : d.archetype === 'generator' ? 'generator' : (errors.push('archetype must be "generator", "app", "lesson", or "repo"'), 'generator');
  const title = String(d.title || '').trim().slice(0, 100);
  if (!title) errors.push('title is required');

  const settings = (Array.isArray(d.settings) ? d.settings : []).map(cleanField).filter(Boolean) as ToolField[];

  let generator: GeneratorSpec | undefined;
  let app: AppSpec | undefined;
  let lesson: LessonSpec | undefined;
  let repo: RepoSpec | undefined;

  if (archetype === 'repo') {
    const r = d.repo || {};
    const layout: 'course' | 'post' = r.layout === 'post' ? 'post' : 'course';
    const display: 'bars' | 'grid' = r.display === 'grid' ? 'grid' : 'bars';
    const cards = (Array.isArray(r.cards) ? r.cards : []).slice(0, 60)
      .map((c: any) => cleanRepoCard(c, 0)).filter(Boolean) as RepoCard[];
    repo = { layout, display, displayLocked: !!r.displayLocked, offlineExport: r.offlineExport !== false, clipForAll: !!r.clipForAll, folderForAll: !!r.folderForAll, imageGen: !!r.imageGen, cards };
  } else if (archetype === 'lesson') {
    const l = d.lesson || {};
    const subject = String(l.subject || title || '').trim().slice(0, 80);
    if (!subject) errors.push('lesson.subject is required');
    const sk = ['general', 'language', 'math', 'programming'].includes(l.subjectKind) ? l.subjectKind : undefined;
    const sup = l.support && typeof l.support === 'object' ? l.support : {};
    const ACTS = ['mcq', 'mcq2', 'mcq4', 'fill-blank', 'input', 'writing', 'annotation', 'code'];
    const acts = (Array.isArray(l.activityTypes) ? l.activityTypes : []).filter((x: any) => ACTS.includes(x));
    const mode: LessonMode = ['slides', 'conversation', 'journal'].includes(l.mode) ? l.mode : 'slides';
    const cleanSup = (s: any): LessonSupport => ({ images: s?.images !== false, code: !!s?.code, tables: !!s?.tables, formulas: !!s?.formulas, audio: !!s?.audio, geogebra: !!s?.geogebra });
    // Per-page designs (from the Studio). Each becomes one slide.
    const pages: LessonPage[] = (Array.isArray(l.pages) ? l.pages : []).slice(0, 75).map((pg: any) => ({
      activityTypes: (Array.isArray(pg?.activityTypes) ? pg.activityTypes : []).filter((x: any) => ACTS.includes(x)),
      support: pg?.support && typeof pg.support === 'object' ? cleanSup(pg.support) : undefined,
      paragraphsPerSlide: Math.max(1, Math.min(4, parseInt(pg?.paragraphsPerSlide, 10) || 1)),
      paragraphLength: ['brief', 'medium', 'detailed'].includes(pg?.paragraphLength) ? pg.paragraphLength : 'medium',
      style: String(pg?.style || '').slice(0, 400) || undefined,
      padSize: ['large', 'medium', 'adaptive'].includes(pg?.padSize) ? pg.padSize : undefined,
      reading: pg?.reading ? true : undefined,
      decorations: (Array.isArray(pg?.decorations) ? pg.decorations : []).slice(0, 6).map((d: any) => {
        const kind = ['coffee', 'note', 'banner', 'hint', 'tv', 'button'].includes(d?.kind) ? d.kind : 'note';
        const out: any = { kind, message: String(d?.message || '').slice(0, 300), link: String(d?.link || '').slice(0, 400) };
        if (kind === 'button') out.action = ['ask', 'results', 'action'].includes(d?.action) ? d.action : 'ask';
        return out;
      }).filter((d: any) => d.message || d.link || d.kind === 'button') || undefined,
    }));
    lesson = {
      subject,
      level: String(l.level || '').slice(0, 40) || undefined,
      mode,
      // When pages are designed, they define the slide count (unless overridden higher).
      totalSlides: Math.max(1, Math.min(75, parseInt(l.totalSlides, 10) || pages.length || 5)),
      language: String(l.language || '').slice(0, 40) || undefined,
      translateTo: String(l.translateTo || 'English').slice(0, 40),
      style: String(l.style || '').slice(0, 500) || undefined,
      subjectKind: sk,
      paragraphsPerSlide: Math.max(1, Math.min(4, parseInt(l.paragraphsPerSlide, 10) || 1)),
      paragraphLength: ['brief', 'medium', 'detailed'].includes(l.paragraphLength) ? l.paragraphLength : 'medium',
      support: cleanSup(sup),
      activityTypes: acts.length ? acts : ['mcq', 'fill-blank', 'input'],
      pages: pages.length ? pages : undefined,
      viewMode: ['both', 'history', 'replica'].includes(l.viewMode) ? l.viewMode : 'replica',
      offlineExport: l.offlineExport !== false,
      // Pass the saved deck through, lightly capped. It's opaque generated content
      // (slides + their questions/answers); we only bound its size, not its shape.
      savedDeck: (l.savedDeck && typeof l.savedDeck === 'object' && Array.isArray(l.savedDeck.slides) && l.savedDeck.slides.length)
        ? { config: l.savedDeck.config && typeof l.savedDeck.config === 'object' ? l.savedDeck.config : {},
            slides: l.savedDeck.slides.slice(0, 75),
            savedAt: String(l.savedDeck.savedAt || '').slice(0, 40) || undefined,
            savedBy: String(l.savedDeck.savedBy || '').slice(0, 60) || undefined,
            results: l.savedDeck.results && typeof l.savedDeck.results === 'object' ? l.savedDeck.results : undefined }
        : undefined,
    };
  } else if (archetype === 'generator') {
    const g = d.generator || {};
    const promptTemplate = String(g.promptTemplate || '').trim();
    if (!promptTemplate) errors.push('generator.promptTemplate is required');
    const output: GeneratorOutput = ['text', 'cards', 'table'].includes(g.output) ? g.output : 'text';
    generator = { promptTemplate, output, systemPrompt: String(g.systemPrompt || '').slice(0, 2000) || undefined };
  } else {
    const ap = d.app || {};
    const entryFields = (Array.isArray(ap.entryFields) ? ap.entryFields : []).map(cleanField).filter(Boolean) as ToolField[];
    if (!entryFields.length) errors.push('app.entryFields needs at least one field');
    const display: AppDisplay = ['cards', 'list', 'table'].includes(ap.display) ? ap.display : 'cards';
    app = { entryFields, display, review: !!ap.review };
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    def: {
      version: 1,
      archetype,
      title,
      description: String(d.description || '').slice(0, 400),
      tags: (Array.isArray(d.tags) ? d.tags : []).map((t: any) => slugify(t)).filter(Boolean).slice(0, 6),
      settings,
      generator,
      app,
      lesson,
      repo,
    },
  };
}
