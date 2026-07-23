// ---------------------------------------------------------------------------
// Shared domain types for SketchLearn
// ---------------------------------------------------------------------------

export type Role = "user" | "teacher" | "moderator" | "admin";

export interface Subscription {
  planId: string;
  planName: string;
  activatedAt: string;
  expiresAt: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  email?: string;
  passHash: string;
  role: Role;
  tokens: number;
  subscription?: Subscription | null;
  favoriteRepos: string[];
  favoriteTools: string[];
  suspended?: boolean;
  createdAt: string;
}

export type PublicUser = Omit<User, "passHash">;

// --- Repositories ----------------------------------------------------------

/**
 * A repo is not only a course: the same nested-card structure serves a
 * restaurant menu, a shop catalog or a portfolio. The flavor changes the
 * labels ("Unit" vs "Category", "Lesson" vs "Item") and how slides are
 * generated (academic vs showcase content).
 */
export type RepoFlavor = "course" | "catalog" | "menu" | "portfolio";

export interface SubtopicCard {
  id: string;
  title: string;
  prompt: string;
}

export interface LessonCard {
  id: string;
  title: string;
  objective: string;
  /** The activity prompt fed to the slide tool to build this lesson's slides. */
  prompt: string;
  /** Global course order: lesson N of M across the whole repo. */
  lessonSeq: number;
  subtopics: SubtopicCard[];
}

export interface UnitCard {
  id: string;
  title: string;
  description?: string;
  lessons: LessonCard[];
}

export interface Repo {
  id: string;
  /** Stable identity — never reference a repo by title. */
  slug: string;
  /** Short code derived from the slug, shown in tables (e.g. #K7J2A). */
  ref: string;
  title: string;
  description: string;
  flavor: RepoFlavor;
  ownerId: string;
  ownerName: string;
  /** Link to the reusable slide tool that builds this repo's lessons. */
  studyToolSlug?: string;
  units: UnitCard[];
  lessonSeqTotal: number;
  plays: number;
  createdAt: string;
  updatedAt: string;
}

// --- Slide tools -----------------------------------------------------------

export type ContentMode = "auto" | "academic" | "showcase";

export interface SlideToolDefaults {
  level: string;
  slideCount: number;
  paragraphsPerSlide: number;
  imageStyle: string;
  instructions: string;
}

export interface SlideTool {
  id: string;
  slug: string;
  title: string;
  description: string;
  ownerId: string;
  ownerName: string;
  contentMode: ContentMode;
  defaults: SlideToolDefaults;
  plays: number;
  createdAt: string;
  updatedAt: string;
}

// --- Slides ----------------------------------------------------------------

export interface ChartSeries {
  name?: string;
  points: { x: number; y: number }[];
}

export interface ChartSpec {
  kind: "line" | "bar";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  series?: ChartSeries[];
  bars?: { label: string; value: number }[];
}

export type SlideComponent =
  | { type: "paragraphs"; texts: string[] }
  | { type: "latex"; latex: string; caption?: string }
  | { type: "chart"; chart: ChartSpec; caption?: string }
  | { type: "svg"; svg: string; caption?: string }
  | { type: "table"; headers: string[]; rows: string[][]; caption?: string }
  | { type: "sticky"; text: string }
  | { type: "image"; prompt: string; dataUrl?: string; alt: string }
  | { type: "code"; language: string; code: string; caption?: string }
  | { type: "steps"; title?: string; steps: string[]; caption?: string };

export interface Quiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Slide {
  id: string;
  title: string;
  components: SlideComponent[];
  quiz?: Quiz | null;
}

/** Seed carried from a repo into a slide-tool play. */
export interface PlaySeed {
  repoSlug: string;
  repoRef: string;
  unitTitle: string;
  lessonTitle: string;
  lessonIndex: number;
  lessonCount: number;
  lessonSeq: number;
  lessonSeqTotal: number;
}

export interface Deck {
  id: string;
  toolSlug: string;
  topic: string;
  level: string;
  imageStyle: string;
  slides: Slide[];
  seed?: PlaySeed | null;
  engine: "ai" | "template";
  generatedAt: string;
}

// --- Runs & cross-lesson memory --------------------------------------------

export interface SlideLogEntry {
  title: string;
  summary: string;
  visuals: string[];
  question?: string;
  chosen?: string;
  correct?: boolean;
}

export interface Run {
  id: string;
  toolSlug: string;
  toolTitle: string;
  userId?: string;
  userName: string;
  playedAt: string;
  elapsedMs: number;
  repoSlug?: string;
  repoRef?: string;
  unitTitle?: string;
  lessonTitle?: string;
  lessonSeq?: number;
  lessonSeqTotal?: number;
  level: string;
  imageStyle: string;
  slideCount: number;
  score: number;
  total: number;
  /** Per-slide record — this is what the next lesson's generation reads. */
  slideLogs: SlideLogEntry[];
}

// --- Economy & payments ----------------------------------------------------

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  tokens: number;
  days: number;
  blurb: string;
}

export type PaymentStatus = "pending" | "approved" | "rejected";

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  reference: string;
  note?: string;
  proofDataUrl?: string;
  status: PaymentStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
}

// --- Platform settings ------------------------------------------------------

export interface PlatformSettings {
  aiProvider: "auto" | "anthropic" | "openai";
  anthropicApiKey: string;
  anthropicModel: string;
  openaiApiKey: string;
  openaiModel: string;
  imageGeneration: boolean;
  tokensPerSlide: number;
  tokensPerImage: number;
  baseGenerationCost: number;
  chatCost: number;
  pathGenerationCost: number;
  signupTokens: number;
  guestCanPlay: boolean;
  plans: Plan[];
  paymentInstructions: string;
  paymentSheetUrl: string;
}

// --- Coach chat -------------------------------------------------------------

export interface ChatAction {
  type: "lessonPath" | "openRepo" | "openTool";
  label: string;
  /** Prefill for the lesson-path composer, or a slug for open actions. */
  value: string;
  flavor?: RepoFlavor;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
}
