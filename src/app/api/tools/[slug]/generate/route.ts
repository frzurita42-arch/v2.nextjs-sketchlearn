import { unauthorized, userFromRequest } from "@/lib/auth";
import { canAfford, chargeTokens, estimateDeckCost } from "@/lib/economy";
import { getSettings } from "@/lib/settings";
import { generateDeck } from "@/lib/slides";
import { listDocs, putDoc } from "@/lib/store";
import type { PlaySeed, Run, SlideTool } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

function normalizeSeed(raw: unknown): PlaySeed | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.repoSlug !== "string" || !s.repoSlug) return null;
  return {
    repoSlug: s.repoSlug,
    repoRef: typeof s.repoRef === "string" ? s.repoRef : "",
    unitTitle: typeof s.unitTitle === "string" ? s.unitTitle : "",
    lessonTitle: typeof s.lessonTitle === "string" ? s.lessonTitle : "",
    lessonIndex: Number(s.lessonIndex) || 0,
    lessonCount: Number(s.lessonCount) || 0,
    lessonSeq: Number(s.lessonSeq) || 0,
    lessonSeqTotal: Number(s.lessonSeqTotal) || 0,
  };
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const settings = await getSettings();
  const user = await userFromRequest(req);
  if (!user && !settings.guestCanPlay) {
    return unauthorized("Sign in to generate presentations.");
  }
  const tools = await listDocs<SlideTool>("tools");
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) return Response.json({ error: "Slide tool not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) ?? {};
  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim() : tool.description;
  if (!topic) return Response.json({ error: "A topic or prompt is required." }, { status: 400 });
  const slideCount = Math.min(Math.max(1, Number(body.slideCount) || tool.defaults.slideCount), 15);
  const seed = normalizeSeed(body.seed);

  // Affordability gate (moderators/admins generate free).
  const cost = estimateDeckCost(settings, slideCount, true);
  if (user && !canAfford(user, cost)) {
    return Response.json(
      {
        error: `This generation costs ${cost} tokens but you have ${user.tokens}. Upgrade your plan to continue.`,
        cost,
        tokens: user.tokens,
      },
      { status: 402 }
    );
  }

  // Cross-lesson memory: earlier completed lessons of the same repo, in course order.
  let memory: Run[] = [];
  if (seed) {
    const runs = await listDocs<Run>("runs");
    memory = runs
      .filter(
        (r) =>
          r.repoSlug === seed.repoSlug &&
          typeof r.lessonSeq === "number" &&
          (seed.lessonSeq ? r.lessonSeq < seed.lessonSeq : true)
      )
      .sort((a, b) => (a.lessonSeq ?? 0) - (b.lessonSeq ?? 0) || a.playedAt.localeCompare(b.playedAt));
    // Keep only the latest run per lesson so repeated plays don't bloat the prompt.
    const latest = new Map<number, Run>();
    for (const r of memory) latest.set(r.lessonSeq ?? 0, r);
    memory = [...latest.values()].sort((a, b) => (a.lessonSeq ?? 0) - (b.lessonSeq ?? 0));
  }

  const deck = await generateDeck({
    toolSlug: tool.slug,
    topic,
    level: typeof body.level === "string" && body.level ? body.level : tool.defaults.level,
    slideCount,
    paragraphsPerSlide: tool.defaults.paragraphsPerSlide,
    imageStyle:
      typeof body.imageStyle === "string" && body.imageStyle
        ? body.imageStyle
        : tool.defaults.imageStyle,
    instructions: tool.defaults.instructions,
    contentMode: tool.contentMode,
    seed,
    memory,
  });

  let charged = 0;
  if (user) {
    await chargeTokens(user, cost);
    charged = user.role === "admin" || user.role === "moderator" ? 0 : cost;
  }
  tool.plays += 1;
  tool.updatedAt = new Date().toISOString();
  await putDoc("tools", tool);

  return Response.json({
    deck,
    cost: charged,
    tokensLeft: user?.tokens ?? null,
    memoryLessons: memory.length,
  });
}
