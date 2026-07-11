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

export type Archetype = 'generator' | 'app' | 'lesson';
export type GeneratorOutput = 'text' | 'cards' | 'table';
export type AppDisplay = 'cards' | 'list' | 'table';

export type SubjectKind = 'general' | 'language' | 'math' | 'programming';

export interface LessonSupport {
  images?: boolean;
  code?: boolean;
  tables?: boolean;
  formulas?: boolean;   // math / Wolfram-style formulas (rendered as a formula block)
  audio?: boolean;
}

export interface LessonSpec {
  subject: string;         // "French", "Algebra", "World History"...
  level?: string;          // default level label
  totalSlides: number;     // how many slides to play (clamped 3-15)
  language?: string;       // target language for a language lesson (enables speak/translate)
  translateTo?: string;    // default 'English'
  style?: string;          // extra generation guidance
  subjectKind?: SubjectKind;        // steers support material + activity mix
  paragraphsPerSlide?: number;      // 1-4
  paragraphLength?: 'brief' | 'medium' | 'detailed';
  support?: LessonSupport;          // which support materials may appear
  activityTypes?: string[];         // subset of ['mcq','fill-blank','input','writing','annotation'] to shuffle
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
}

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'select', 'select-or-custom', 'toggle', 'date', 'image', 'audio', 'drawing'];

export function slugify(s: string): string {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tool';
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

// Validate + normalize an untrusted definition (from the AI or an API caller).
// Returns a safe, shaped ToolDefinition or a list of errors.
export function validateToolDefinition(input: any): { ok: boolean; errors: string[]; def?: ToolDefinition } {
  const errors: string[] = [];
  const d = input || {};
  const archetype: Archetype = d.archetype === 'app' ? 'app' : d.archetype === 'lesson' ? 'lesson' : d.archetype === 'generator' ? 'generator' : (errors.push('archetype must be "generator", "app", or "lesson"'), 'generator');
  const title = String(d.title || '').trim().slice(0, 100);
  if (!title) errors.push('title is required');

  const settings = (Array.isArray(d.settings) ? d.settings : []).map(cleanField).filter(Boolean) as ToolField[];

  let generator: GeneratorSpec | undefined;
  let app: AppSpec | undefined;
  let lesson: LessonSpec | undefined;

  if (archetype === 'lesson') {
    const l = d.lesson || {};
    const subject = String(l.subject || title || '').trim().slice(0, 80);
    if (!subject) errors.push('lesson.subject is required');
    const sk = ['general', 'language', 'math', 'programming'].includes(l.subjectKind) ? l.subjectKind : undefined;
    const sup = l.support && typeof l.support === 'object' ? l.support : {};
    const acts = (Array.isArray(l.activityTypes) ? l.activityTypes : []).filter((x: any) => ['mcq', 'fill-blank', 'input', 'writing', 'annotation'].includes(x));
    lesson = {
      subject,
      level: String(l.level || '').slice(0, 40) || undefined,
      totalSlides: Math.max(1, Math.min(15, parseInt(l.totalSlides, 10) || 5)),
      language: String(l.language || '').slice(0, 40) || undefined,
      translateTo: String(l.translateTo || 'English').slice(0, 40),
      style: String(l.style || '').slice(0, 500) || undefined,
      subjectKind: sk,
      paragraphsPerSlide: Math.max(1, Math.min(4, parseInt(l.paragraphsPerSlide, 10) || 1)),
      paragraphLength: ['brief', 'medium', 'detailed'].includes(l.paragraphLength) ? l.paragraphLength : 'medium',
      support: {
        images: sup.images !== false, code: !!sup.code, tables: !!sup.tables, formulas: !!sup.formulas, audio: !!sup.audio,
      },
      activityTypes: acts.length ? acts : ['mcq', 'fill-blank', 'input'],
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
    },
  };
}
