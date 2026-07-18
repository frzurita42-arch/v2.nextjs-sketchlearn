/* Shared client singletons: constant pools + the mutable app state object.
 * Ported from public/js/core/state.js. Kept as a module-level singleton (like
 * the legacy SPA) so every view/activity/flow reads and mutates the same
 * object; React re-renders are driven by the AppContext `rerender()` tick. */

export const PRESET_TOPICS = ['Math', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Programming', 'Economics', 'Music Theory', 'Astronomy', 'Psychology', 'Literature'];
export const LEVELS = ['Beginner', 'Lower Intermediate', 'Upper Intermediate', 'Advanced', 'PhD'];
export const TONES = ['Friendly lecture', 'Casual conversation', 'Hopeful & encouraging', 'Pessimistic & cautionary', 'Humorous', 'Storytelling', 'Socratic questioning'];

// Language Learning activity: a broad set including the most widely spoken languages.
export const LANGUAGES = ['English', 'Spanish', 'Mandarin Chinese', 'Hindi', 'Arabic', 'French', 'Portuguese', 'Japanese', 'German', 'Italian'];
// CEFR-style levels plus "Zero" (absolute beginner, alphabet/characters up).
export const LANG_LEVELS = ['Zero', 'Beginner', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
// The five sub-activity types the language lesson can mix (grammar always first).
export const LANG_ACTIVITY_TYPES = ['grammar', 'reading', 'listening', 'spelling', 'vocabulary', 'writing'] as const;

// Suggested default number of handwriting/character-practice slides by level:
// heaviest at Zero/Beginner, tapering off (still available) at higher levels.
export const WRITING_DEFAULT_BY_LEVEL: Record<string, number> = {
  Zero: 3, Beginner: 2, A1: 1, A2: 1, B1: 1, B2: 0, C1: 0, C2: 0,
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export const initialCoachGreeting: ChatMessage = {
  role: 'assistant',
  content: "Hi! I'm your SketchLearn coach — tell me what you want to learn and I'll recommend or build a repo or slide presentation. Here are a few places to explore to get started:",
};

export interface AppState {
  topic: string | null;
  path: any;
  homeTopics: string[];
  homeSuggestion: any;
  timeTravel: any;
  latexLab: any;
  languageLearning: any;
  languageLesson?: any;
  csAcademy?: any;
  activeTool?: any;
  // How to open the next tool: jump straight to its saved results, or replay a
  // specific rendition config. Consumed once by the LessonPlayer on mount.
  openIntent?: { action: 'results' | 'replay' | 'generate'; config?: any } | null;
  // A one-shot "preset the create form" seed: a study-path prompt card hands the
  // slide tool a topic (and optional slide count) to PREFILL — the user still
  // presses Generate. Consumed once by the LessonPlayer create form on mount.
  slideSeed?: { topic?: string; slides?: number } | null;
  builderDraft?: any;
  // A one-shot seed for the tool builder: prefill the artifact type + subject/
  // title from a suggested topic. Consumed once by BuilderStudioView on mount.
  // `pages`/`cards` (+ tone) let a topic pick — or the "✏️ Edit tool" button —
  // hand the builder a ready-made plan to review and edit. When `editSlug` is set
  // the Studio UPDATES that existing tool on publish instead of creating a new one.
  builderSeed?: { artifact?: 'presentation' | 'repository'; subject?: string; title?: string; context?: string; tone?: string; pages?: any[]; cards?: any[]; editSlug?: string } | null;
  suggestedSettings: any;
  suggestedGuidance: string;
  concept: string | null;
  level: string | null;
  settings: any;
  game: any;
  chat: ChatMessage[];
  // The id of the coach chat currently open, so the SAME conversation continues
  // across page visits until the user starts a new one.
  chatSessionId?: string | null;
  // Whether the shared Coach side-rail is expanded (persists across page switches).
  railOpen?: boolean;
  // Path-flow transient state (loading spinner + error, mirroring the legacy
  // imperative loadPath()).
  pathLoading?: string | null;
  pathError?: string | null;
  pathRequest?: any;
}

export const appState: AppState = {
  topic: null,
  path: null,
  homeTopics: [],
  homeSuggestion: null,
  timeTravel: {
    headline: '',
    period: 'future',
    level: 'Lower Intermediate',
    complexity: 'standard',
    paragraphLength: 'medium',
    paragraphCount: 1,
    imageDensity: 'balanced',
    totalSlides: 3,
    tone: 'Storytelling',
  },
  latexLab: {
    prompt: '',
    exampleType: 'proof',
    level: 'Lower Intermediate',
    tone: 'Friendly lecture',
    complexity: 'standard',
    paragraphLength: 'medium',
    paragraphCount: 1,
    imageDensity: 'balanced',
    totalSlides: 3,
    continuation: 'related-topics',
    alternateVisualMath: true,
  },
  languageLearning: {
    language: 'Spanish',
    customLanguage: false,
    level: 'Zero',
    grammarTopic: '',
    customGrammar: false,
    topic: '',
    // Per-sub-activity slide counts; grammar renders first, the rest shuffle.
    // `writing` = character/handwriting practice on a canvas (defaults higher at
    // Zero/Beginner via the level picker).
    counts: { grammar: 1, reading: 1, listening: 0, spelling: 0, vocabulary: 0, writing: 2 },
    grammarTopicOptions: [] as string[],
  },
  suggestedSettings: null,
  suggestedGuidance: '',
  concept: null,
  level: null,
  settings: null,
  game: null,
  chat: [initialCoachGreeting],
};
