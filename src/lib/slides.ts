import { aiImage, aiText, extractJson } from "./ai";
import { newId } from "./store";
import type {
  ChartSpec,
  ContentMode,
  Deck,
  PlaySeed,
  Quiz,
  Run,
  Slide,
  SlideComponent,
} from "./types";

// ---------------------------------------------------------------------------
// The teaching engine. Given a prompt + settings (+ the lesson logs of every
// earlier lesson in the same repo), produce a playable deck of templated
// slides. AI generation first; a deterministic template engine guarantees the
// site keeps working with no API key configured.
// ---------------------------------------------------------------------------

export interface GenerateDeckOptions {
  toolSlug: string;
  topic: string;
  level: string;
  slideCount: number;
  paragraphsPerSlide: number;
  imageStyle: string;
  instructions: string;
  contentMode: ContentMode;
  seed?: PlaySeed | null;
  /** Completed runs of earlier lessons in the same repo (cross-lesson memory). */
  memory?: Run[];
}

export const MAX_SLIDES = 15;

// --- Cross-lesson memory ---------------------------------------------------

/**
 * Fold earlier lessons' logs into a "PREVIOUSLY TAUGHT" block. The generator
 * is told to build on this like a later chapter of the same book: reference
 * it in a short clause at most, never re-explain it.
 */
export function buildMemoryBlock(memory: Run[]): string {
  if (!memory.length) return "";
  const lines: string[] = [];
  for (const run of memory) {
    const head = `Lesson ${run.lessonSeq ?? "?"}/${run.lessonSeqTotal ?? "?"} — "${run.lessonTitle ?? run.toolTitle}" (score ${run.score}/${run.total})`;
    const taught = run.slideLogs
      .map((s) => {
        const answer =
          s.question && s.chosen !== undefined
            ? ` Student answered "${s.chosen}" (${s.correct ? "correct" : "incorrect"}).`
            : "";
        return `  • ${s.title}: ${s.summary} [visuals: ${s.visuals.join(", ") || "none"}]${answer}`;
      })
      .join("\n");
    lines.push(`${head}\n${taught}`);
  }
  return lines.join("\n");
}

function memoryInstructions(block: string, weakSpots: string[]): string {
  if (!block) return "";
  const weak = weakSpots.length
    ? `\nThe student answered incorrectly on: ${weakSpots.join("; ")}. You may briefly reinforce ONLY these weak points inside the flow of the new material (one clause, not a re-teach).`
    : "";
  return `
PREVIOUSLY TAUGHT IN THIS COURSE (cross-lesson memory — read carefully):
${block}

Treat everything above as ALREADY KNOWN. Build on it like a later chapter of the same book:
- Do NOT re-explain or re-teach any of it.
- Reference prior knowledge with at most one short clause, and only when the new idea needs it.
- Spend all depth and slide space on the NEW topic below.${weak}
`;
}

function collectWeakSpots(memory: Run[]): string[] {
  const weak: string[] = [];
  for (const run of memory) {
    for (const s of run.slideLogs) {
      if (s.question && s.correct === false) weak.push(`${s.title} (${s.question})`);
    }
  }
  return weak.slice(0, 5);
}

// --- Subject gating --------------------------------------------------------

const STEM_HINTS =
  /\b(math|algebra|calculus|geometry|physics|chemistry|equation|formula|velocity|force|energy|statistics|probability|derivative|integral|program|code|coding|javascript|python|engineer|circuit|biology|thermo|momentum|trigonometry|function|matrix|vector)\b/i;

const SHOWCASE_HINTS =
  /\b(menu|restaurant|dish|recipe|breakfast|lunch|dinner|catalog|product|shop|store|portfolio|handyman|service|client|price|sale|brand|gallery)\b/i;

export function resolveContentMode(mode: ContentMode, topic: string): "academic" | "showcase" {
  if (mode !== "auto") return mode;
  if (SHOWCASE_HINTS.test(topic) && !STEM_HINTS.test(topic)) return "showcase";
  return "academic";
}

export function isStemTopic(topic: string): boolean {
  return STEM_HINTS.test(topic);
}

// --- Prompt construction ---------------------------------------------------

function seedContext(seed?: PlaySeed | null): string {
  if (!seed) return "";
  return `
CONTEXT: This presentation is Lesson ${seed.lessonSeq} of ${seed.lessonSeqTotal} ("${seed.lessonTitle}") in unit "${seed.unitTitle}" of the course/collection "${seed.repoRef}". It must feel like chapter ${seed.lessonSeq} of one continuous work.`;
}

export function buildDeckPrompt(opts: GenerateDeckOptions): string {
  const mode = resolveContentMode(opts.contentMode, `${opts.topic} ${opts.instructions}`);
  const memBlock = buildMemoryBlock(opts.memory ?? []);
  const stemAllowed = mode === "academic" && isStemTopic(`${opts.topic} ${opts.instructions}`);

  return `You are SketchLearn's slide engine. Generate a playable slide presentation as STRICT JSON (no markdown fences, no commentary).

TOPIC / ACTIVITY PROMPT:
${opts.topic}

CUSTOM INSTRUCTIONS: ${opts.instructions || "none"}
AUDIENCE LEVEL: ${opts.level}
SLIDES: exactly ${Math.min(opts.slideCount, MAX_SLIDES)}
PARAGRAPHS PER SLIDE: ${opts.paragraphsPerSlide} distinct prose paragraphs that introduce → develop → apply, never restating.
IMAGE STYLE (for any image prompts): ${opts.imageStyle}
CONTENT MODE: ${mode === "academic" ? "academic teaching" : "showcase/storytelling (a catalog item, menu dish, portfolio piece or story — NOT a math lesson)"}
${seedContext(opts.seed)}
${memoryInstructions(memBlock, collectWeakSpots(opts.memory ?? []))}
HARD RULES:
1. NO greeting or welcome slide — the first slide starts teaching/presenting the concept immediately.
2. The deck reads as ONE continuous piece. At most a light one-clause stitch to the previous slide's idea; never recap, never announce transitions.
3. Support components are chosen deliberately per concept: "chart" for data/trends/relationships, "latex" for a formula, "svg" for a simple diagram, "table" for compact labelled comparisons, "sticky" for one highlight/mnemonic/warning, "image" for a visual, "code" for programming, "steps" for a step-by-step worked solution.
4. Subject gating: ${stemAllowed ? "formulas/LaTeX, steps and code ARE appropriate for this technical topic." : "this is NOT a math/technical topic — do NOT use latex, code or step-by-step solution components. Use prose, images, tables, svg diagrams and sticky notes."}
5. FORMULAS: at most ONE "latex" component per slide (a single multi-line derivation is still one). A second equation goes on its own later slide.
6. FORMULA ORDER: when a formula appears, order components top-to-bottom: (1) the latex formula, (2) its graph — a "chart" plotting how it behaves or an "svg" of what it does, (3) a SHORT paragraph saying WHY this formula/graph is on the page and what it shows. Same for "steps": follow with a short why-paragraph.
7. Every visual must match the text on the same slide — text, images, charts, formulas and step-by-step solutions must all describe the same concept coherently.
8. QUIZ per slide: multiple choice, exactly 4 options, answerable using ONLY what THIS slide taught plus everyday knowledge — a small nudge one step past the text, never an outside fact. Adapt difficulty to "${opts.level}". Include a one-sentence explanation. For pure showcase slides a quiz is optional (use null).
9. "svg" values must be a self-contained <svg viewBox="0 0 400 240">…</svg> using only path/line/circle/rect/polygon/text/g elements, stroke-based, no scripts.

OUTPUT — STRICT JSON:
{
  "slides": [
    {
      "title": "string",
      "components": [
        {"type":"paragraphs","texts":["paragraph 1","paragraph 2"]},
        {"type":"latex","latex":"v = \\\\frac{\\\\Delta x}{\\\\Delta t}","caption":"optional"},
        {"type":"chart","chart":{"kind":"line","title":"","xLabel":"","yLabel":"","series":[{"name":"","points":[{"x":0,"y":0}]}]},"caption":""},
        {"type":"chart","chart":{"kind":"bar","title":"","bars":[{"label":"","value":1}]}},
        {"type":"svg","svg":"<svg viewBox=\\"0 0 400 240\\">...</svg>","caption":""},
        {"type":"table","headers":["h1"],"rows":[["c1"]],"caption":""},
        {"type":"sticky","text":"one highlight"},
        {"type":"image","prompt":"description for an image generator, in the image style","alt":"accessible description"},
        {"type":"code","language":"python","code":"...","caption":""},
        {"type":"steps","title":"Worked example","steps":["step 1","step 2"],"caption":"why this solution is shown"}
      ],
      "quiz": {"question":"...","options":["a","b","c","d"],"correctIndex":0,"explanation":"..."}
    }
  ]
}`;
}

// --- Normalization & rule enforcement --------------------------------------

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function sanitizeSvg(svg: string): string | null {
  if (!/^\s*<svg[\s>]/i.test(svg)) return null;
  if (/script|onload|onerror|onclick|foreignObject|iframe|href\s*=/i.test(svg)) return null;
  return svg;
}

function normalizeChart(raw: unknown): ChartSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const kind = c.kind === "bar" ? "bar" : "line";
  const spec: ChartSpec = {
    kind,
    title: asString(c.title) || undefined,
    xLabel: asString(c.xLabel) || undefined,
    yLabel: asString(c.yLabel) || undefined,
  };
  if (kind === "bar" && Array.isArray(c.bars)) {
    spec.bars = (c.bars as Record<string, unknown>[])
      .filter((b) => b && typeof b.value === "number")
      .map((b) => ({ label: asString(b.label), value: b.value as number }))
      .slice(0, 12);
    if (!spec.bars.length) return null;
  } else if (Array.isArray(c.series)) {
    spec.kind = "line";
    spec.series = (c.series as Record<string, unknown>[])
      .filter((s) => s && Array.isArray(s.points))
      .map((s) => ({
        name: asString(s.name) || undefined,
        points: (s.points as Record<string, unknown>[])
          .filter((p) => p && typeof p.x === "number" && typeof p.y === "number")
          .map((p) => ({ x: p.x as number, y: p.y as number }))
          .slice(0, 60),
      }))
      .filter((s) => s.points.length >= 2)
      .slice(0, 4);
    if (!spec.series.length) return null;
  } else {
    return null;
  }
  return spec;
}

function normalizeComponent(raw: unknown, allowStem: boolean): SlideComponent | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case "paragraphs": {
      const texts = Array.isArray(c.texts)
        ? (c.texts as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        : [];
      return texts.length ? { type: "paragraphs", texts } : null;
    }
    case "latex": {
      if (!allowStem) return null;
      const latex = asString(c.latex).trim();
      return latex ? { type: "latex", latex, caption: asString(c.caption) || undefined } : null;
    }
    case "chart": {
      const chart = normalizeChart(c.chart);
      return chart ? { type: "chart", chart, caption: asString(c.caption) || undefined } : null;
    }
    case "svg": {
      const svg = sanitizeSvg(asString(c.svg));
      return svg ? { type: "svg", svg, caption: asString(c.caption) || undefined } : null;
    }
    case "table": {
      const headers = Array.isArray(c.headers)
        ? (c.headers as unknown[]).filter((h): h is string => typeof h === "string")
        : [];
      const rows = Array.isArray(c.rows)
        ? (c.rows as unknown[])
            .filter((r): r is unknown[] => Array.isArray(r))
            .map((r) => r.map((cell) => asString(cell)))
        : [];
      return headers.length && rows.length
        ? { type: "table", headers, rows, caption: asString(c.caption) || undefined }
        : null;
    }
    case "sticky": {
      const text = asString(c.text).trim();
      return text ? { type: "sticky", text } : null;
    }
    case "image": {
      const prompt = asString(c.prompt).trim();
      return prompt
        ? { type: "image", prompt, alt: asString(c.alt) || prompt.slice(0, 120) }
        : null;
    }
    case "code": {
      if (!allowStem) return null;
      const code = asString(c.code);
      return code
        ? {
            type: "code",
            language: asString(c.language, "text"),
            code,
            caption: asString(c.caption) || undefined,
          }
        : null;
    }
    case "steps": {
      if (!allowStem) return null;
      const steps = Array.isArray(c.steps)
        ? (c.steps as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : [];
      return steps.length
        ? {
            type: "steps",
            title: asString(c.title) || undefined,
            steps,
            caption: asString(c.caption) || undefined,
          }
        : null;
    }
    default:
      return null;
  }
}

function normalizeQuiz(raw: unknown): Quiz | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const options = Array.isArray(q.options)
    ? (q.options as unknown[]).filter((o): o is string => typeof o === "string")
    : [];
  const question = asString(q.question).trim();
  const idx = typeof q.correctIndex === "number" ? q.correctIndex : -1;
  if (!question || options.length < 2 || idx < 0 || idx >= options.length) return null;
  return {
    question,
    options: options.slice(0, 4),
    correctIndex: Math.min(idx, 3),
    explanation: asString(q.explanation),
  };
}

/**
 * Enforce the hard slide rules on whatever the model returned:
 * ≤15 slides, one latex per slide, formula → graph → why ordering.
 */
export function normalizeSlides(raw: unknown, allowStem: boolean): Slide[] | null {
  if (!raw || typeof raw !== "object") return null;
  const rawSlides = (raw as Record<string, unknown>).slides;
  if (!Array.isArray(rawSlides)) return null;
  const slides: Slide[] = [];
  for (const rawSlide of rawSlides.slice(0, MAX_SLIDES)) {
    if (!rawSlide || typeof rawSlide !== "object") continue;
    const s = rawSlide as Record<string, unknown>;
    let components = (Array.isArray(s.components) ? s.components : [])
      .map((c) => normalizeComponent(c, allowStem))
      .filter((c): c is SlideComponent => c !== null);

    // One latex formula per slide — hard limit; extras are dropped.
    let latexSeen = false;
    components = components.filter((c) => {
      if (c.type !== "latex") return true;
      if (latexSeen) return false;
      latexSeen = true;
      return true;
    });

    // Formula order: latex first, then its graph (chart/svg), then prose.
    const latexIdx = components.findIndex((c) => c.type === "latex");
    if (latexIdx > 0) {
      const [latex] = components.splice(latexIdx, 1);
      const firstGraph = components.findIndex((c) => c.type === "chart" || c.type === "svg");
      const introEnd = components.findIndex((c) => c.type !== "paragraphs");
      // Keep any intro paragraphs, then formula, then graph, then the rest.
      const insertAt = introEnd === -1 ? components.length : introEnd;
      components.splice(Math.min(insertAt, firstGraph === -1 ? insertAt : firstGraph), 0, latex);
    }

    if (!components.some((c) => c.type === "paragraphs")) continue;
    slides.push({
      id: newId("sl"),
      title: asString(s.title, "Untitled slide"),
      components,
      quiz: normalizeQuiz(s.quiz),
    });
  }
  return slides.length ? slides : null;
}

// --- Deterministic template engine (no-API fallback) ------------------------

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function topicFacets(topic: string, count: number): string[] {
  const base = [
    "What it is and why it matters",
    "The core idea, step by step",
    "A concrete example",
    "How the pieces relate",
    "Common mistakes and how to avoid them",
    "Where you meet it in real life",
    "Putting it into practice",
    "A closer look at the details",
    "Comparing the alternatives",
    "What to remember",
    "Going one level deeper",
    "Checking your understanding",
    "Edge cases worth knowing",
    "A short history and context",
    "Bringing it all together",
  ];
  const start = hashCode(topic) % 3;
  return Array.from({ length: count }, (_, i) => base[(start + i) % base.length]);
}

function cleanTopicTitle(topic: string): string {
  const first = topic.split(/[.\n]/)[0].trim();
  return first.length > 70 ? `${first.slice(0, 67)}…` : first || "This topic";
}

/**
 * The fallback engine: no AI key needed. Produces coherent, honest slides that
 * frame the activity prompt, so the whole loop (play → log → next lesson)
 * remains fully exercisable before any API key is configured.
 */
export function templateDeck(opts: GenerateDeckOptions): Slide[] {
  const mode = resolveContentMode(opts.contentMode, `${opts.topic} ${opts.instructions}`);
  const stem = mode === "academic" && isStemTopic(`${opts.topic} ${opts.instructions}`);
  const title = cleanTopicTitle(opts.topic);
  const n = Math.max(3, Math.min(opts.slideCount, MAX_SLIDES));
  const facets = topicFacets(opts.topic, n);
  const prior = opts.memory?.length ?? 0;

  return facets.map((facet, i) => {
    const components: SlideComponent[] = [];
    const stitch =
      i === 0
        ? prior
          ? `Building directly on what earlier lessons in this path already covered, `
          : ""
        : `Carrying the previous idea forward, `;
    components.push({
      type: "paragraphs",
      texts: [
        `${stitch}this slide looks at "${title}" through the lens of ${facet.toLowerCase()}. The activity prompt for this lesson asks: ${opts.topic.trim()}`,
        `At the ${opts.level} level, focus on grasping the main idea before the details. Read carefully — the question below is answerable from this slide alone. (Template engine: connect an AI provider key in Settings to generate fully custom content.)`,
      ],
    });
    if (stem && i === 1) {
      components.push({
        type: "latex",
        latex: "y = f(x)",
        caption: "Placeholder relationship — AI generation replaces this with the real formula for the topic.",
      });
      components.push({
        type: "chart",
        chart: {
          kind: "line",
          title: "How the relationship behaves",
          xLabel: "input",
          yLabel: "output",
          series: [
            {
              points: Array.from({ length: 8 }, (_, x) => ({
                x,
                y: Math.round((x * x) / 2 + (hashCode(title) % 4)),
              })),
            },
          ],
        },
      });
      components.push({
        type: "paragraphs",
        texts: [
          "Why this is here: the formula states the relationship precisely, and the graph shows how it behaves as the input grows — two views of the same fact.",
        ],
      });
    }
    if (i === 2) {
      components.push({
        type: "table",
        headers: ["Aspect", "What to notice"],
        rows: [
          ["Main idea", title],
          ["Angle", facet],
          ["Level", opts.level],
        ],
        caption: "A compact summary of this slide.",
      });
    }
    if (i === n - 1) {
      components.push({
        type: "sticky",
        text: `Remember: ${title} — ${facet.toLowerCase()}.`,
      });
    }
    const quiz: Quiz = {
      question: `This slide examined "${title}" mainly through which angle?`,
      options: [
        facet,
        facets[(i + 1) % n],
        facets[(i + 2) % n],
        "None — it was only a greeting slide",
      ],
      correctIndex: 0,
      explanation: `The slide's angle was "${facet}" — and SketchLearn decks never open with greeting slides.`,
    };
    return { id: newId("sl"), title: `${title}: ${facet}`, components, quiz };
  });
}

// --- Entry point -----------------------------------------------------------

const MAX_GENERATED_IMAGES = 3;

export async function generateDeck(opts: GenerateDeckOptions): Promise<Deck> {
  const clamped = { ...opts, slideCount: Math.min(Math.max(1, opts.slideCount), MAX_SLIDES) };
  const mode = resolveContentMode(clamped.contentMode, `${clamped.topic} ${clamped.instructions}`);
  const allowStem = mode === "academic";

  let slides: Slide[] | null = null;
  let engine: Deck["engine"] = "template";

  const raw = await aiText(buildDeckPrompt(clamped), {
    system:
      "You generate educational slide decks as strict JSON. Output ONLY the JSON object — no prose, no markdown fences.",
    maxTokens: 8000,
    temperature: 0.7,
  });
  if (raw) {
    slides = normalizeSlides(extractJson(raw), allowStem);
    if (slides) engine = "ai";
  }
  if (!slides) slides = templateDeck(clamped);

  // Resolve image components (capped) — placeholder art when no image provider.
  let imagesGenerated = 0;
  for (const slide of slides) {
    for (const comp of slide.components) {
      if (comp.type === "image" && !comp.dataUrl && imagesGenerated < MAX_GENERATED_IMAGES) {
        const url = await aiImage(`${comp.prompt} — style: ${clamped.imageStyle}`);
        if (url) {
          comp.dataUrl = url;
          imagesGenerated++;
        }
      }
    }
  }

  return {
    id: newId("deck"),
    toolSlug: clamped.toolSlug,
    topic: clamped.topic,
    level: clamped.level,
    imageStyle: clamped.imageStyle,
    slides,
    seed: clamped.seed ?? null,
    engine,
    generatedAt: new Date().toISOString(),
  };
}
