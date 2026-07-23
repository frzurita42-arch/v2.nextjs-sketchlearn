import { aiText, extractJson } from "./ai";
import { listDocs, newId } from "./store";
import type { LessonCard, Repo, RepoFlavor, SlideTool, UnitCard } from "./types";

// ---------------------------------------------------------------------------
// Repositories: slug/ref identity helpers, flavor vocabulary, and the Lesson
// Path composer that generates a repo + linked slide tool in one action.
// ---------------------------------------------------------------------------

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "untitled"
  );
}

/** Short stable repo ref shown in tables (#K7J2A style), derived from the slug. */
export function repoRef(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (Math.imul(33, h) + slug.charCodeAt(i)) >>> 0;
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length);
  }
  return `#${out}`;
}

export async function uniqueSlug(collection: "repos" | "tools", title: string): Promise<string> {
  const base = slugify(title);
  const docs = await listDocs<{ id: string; slug: string }>(collection);
  const taken = new Set(docs.map((d) => d.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Recompute global course order (lesson N of M across the whole repo). */
export function renumberRepo(repo: Repo): Repo {
  let seq = 0;
  for (const unit of repo.units) {
    for (const lesson of unit.lessons) {
      seq += 1;
      lesson.lessonSeq = seq;
    }
  }
  repo.lessonSeqTotal = seq;
  return repo;
}

// --- Lesson Path composer ---------------------------------------------------

export interface PathPlan {
  title: string;
  description: string;
  flavor: RepoFlavor;
  level: string;
  toolTitle: string;
  toolInstructions: string;
  units: {
    title: string;
    description?: string;
    lessons: { title: string; objective: string; prompt: string }[];
  }[];
}

function pathPrompt(description: string, flavor: RepoFlavor | "auto"): string {
  return `You are SketchLearn's Lesson Path composer. From the user's description, design a repository (a nested syllabus or catalog) plus a reusable slide tool that will generate each entry's presentation.

USER DESCRIPTION:
${description}

FLAVOR: ${flavor === "auto" ? 'choose the best fit: "course" (learning path), "menu" (restaurant), "catalog" (products/services), or "portfolio" (work showcase)' : flavor}

RULES:
- 2 to 4 units (or categories), each with 2 to 4 lessons (or items). Order lessons so each builds on the previous ones.
- Each lesson gets an OBJECTIVE (one sentence: what the learner/viewer gains) and a PROMPT — the exact activity prompt the slide tool will run. Later prompts must explicitly say what earlier lessons already covered and instruct: reference it, don't re-teach it (e.g. "Assume displacement (L1) is known — reference it, don't re-teach it").
- For non-course flavors, prompts describe what to present about that item (story, ingredients, materials, process, results) in context of the whole collection.
- toolInstructions: one paragraph of standing instructions for the slide tool (tone, what to emphasize, what to avoid).

OUTPUT STRICT JSON ONLY:
{"title":"","description":"","flavor":"course|menu|catalog|portfolio","level":"Beginner|Lower Intermediate|Intermediate|Advanced","toolTitle":"","toolInstructions":"","units":[{"title":"","description":"","lessons":[{"title":"","objective":"","prompt":""}]}]}`;
}

function normalizePlan(raw: unknown): PathPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const flavors: RepoFlavor[] = ["course", "menu", "catalog", "portfolio"];
  const units = Array.isArray(p.units)
    ? (p.units as Record<string, unknown>[])
        .map((u) => ({
          title: typeof u.title === "string" ? u.title : "",
          description: typeof u.description === "string" ? u.description : undefined,
          lessons: Array.isArray(u.lessons)
            ? (u.lessons as Record<string, unknown>[])
                .map((l) => ({
                  title: typeof l.title === "string" ? l.title : "",
                  objective: typeof l.objective === "string" ? l.objective : "",
                  prompt: typeof l.prompt === "string" ? l.prompt : "",
                }))
                .filter((l) => l.title && l.prompt)
            : [],
        }))
        .filter((u) => u.title && u.lessons.length)
    : [];
  if (!units.length || typeof p.title !== "string" || !p.title) return null;
  return {
    title: p.title,
    description: typeof p.description === "string" ? p.description : "",
    flavor: flavors.includes(p.flavor as RepoFlavor) ? (p.flavor as RepoFlavor) : "course",
    level: typeof p.level === "string" && p.level ? p.level : "Intermediate",
    toolTitle: typeof p.toolTitle === "string" && p.toolTitle ? p.toolTitle : `${p.title} Slide Generator`,
    toolInstructions: typeof p.toolInstructions === "string" ? p.toolInstructions : "",
    units,
  };
}

/** Deterministic fallback path when no AI provider is configured. */
function templatePlan(description: string, flavor: RepoFlavor | "auto"): PathPlan {
  const resolved: RepoFlavor = flavor === "auto" ? "course" : flavor;
  const title = description.split(/[.\n]/)[0].trim().slice(0, 60) || "New learning path";
  const mk = (unit: string, items: [string, string][]) => ({
    title: unit,
    lessons: items.map(([t, extra], i) => ({
      title: t,
      objective: `${t} — ${extra}`,
      prompt:
        i === 0
          ? `Teach/present "${t}" for the path "${title}". ${extra}. Context: ${description}`
          : `Teach/present "${t}" for the path "${title}". ${extra}. Assume everything from earlier lessons is known — reference it, don't re-teach it. Context: ${description}`,
    })),
  });
  return {
    title,
    description,
    flavor: resolved,
    level: "Intermediate",
    toolTitle: `${title} Slide Generator`,
    toolInstructions: `Presentations for "${title}". Keep a consistent voice across the whole path; each new presentation builds on what previous ones covered instead of repeating it.`,
    units: [
      mk("Foundations", [
        ["Getting oriented", "establish the base concepts"],
        ["Core ideas", "develop the central concepts in depth"],
      ]),
      mk("Going further", [
        ["Applying it", "put the ideas to work on concrete cases"],
        ["Mastery & next steps", "consolidate and extend"],
      ]),
    ],
  };
}

export async function composePathPlan(
  description: string,
  flavor: RepoFlavor | "auto"
): Promise<{ plan: PathPlan; engine: "ai" | "template" }> {
  const raw = await aiText(pathPrompt(description, flavor), {
    system: "Output ONLY strict JSON. No markdown fences, no commentary.",
    maxTokens: 4000,
    temperature: 0.6,
  });
  if (raw) {
    const plan = normalizePlan(extractJson(raw));
    if (plan) return { plan, engine: "ai" };
  }
  return { plan: templatePlan(description, flavor), engine: "template" };
}

/** Materialize a PathPlan into a Repo + linked SlideTool pair (not yet saved). */
export function materializePlan(
  plan: PathPlan,
  repoSlug: string,
  toolSlug: string,
  owner: { id: string; name: string }
): { repo: Repo; tool: SlideTool } {
  const now = new Date().toISOString();
  const units: UnitCard[] = plan.units.map((u) => ({
    id: newId("unit"),
    title: u.title,
    description: u.description,
    lessons: u.lessons.map(
      (l): LessonCard => ({
        id: newId("les"),
        title: l.title,
        objective: l.objective,
        prompt: l.prompt,
        lessonSeq: 0,
        subtopics: [],
      })
    ),
  }));
  const repo: Repo = renumberRepo({
    id: newId("repo"),
    slug: repoSlug,
    ref: repoRef(repoSlug),
    title: plan.title,
    description: plan.description,
    flavor: plan.flavor,
    ownerId: owner.id,
    ownerName: owner.name,
    studyToolSlug: toolSlug,
    units,
    lessonSeqTotal: 0,
    plays: 0,
    createdAt: now,
    updatedAt: now,
  });
  const tool: SlideTool = {
    id: newId("tool"),
    slug: toolSlug,
    title: plan.toolTitle,
    description: `Slide generator for "${plan.title}".`,
    ownerId: owner.id,
    ownerName: owner.name,
    contentMode: plan.flavor === "course" ? "auto" : "showcase",
    defaults: {
      level: plan.level,
      slideCount: 6,
      paragraphsPerSlide: 2,
      imageStyle: "Chalkboard sketch",
      instructions: plan.toolInstructions,
    },
    plays: 0,
    createdAt: now,
    updatedAt: now,
  };
  return { repo, tool };
}
