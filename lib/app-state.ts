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
  content: "Hi! I'm your SketchLearn coach. I can see your progress spreadsheet and help you pick what to study next, or explain how to use the site. What are you curious about?",
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
  builderDraft?: any;
  suggestedSettings: any;
  suggestedGuidance: string;
  concept: string | null;
  level: string | null;
  settings: any;
  game: any;
  chat: ChatMessage[];
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
