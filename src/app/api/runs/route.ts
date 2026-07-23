import { userFromRequest } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { listDocs, newId, putDoc } from "@/lib/store";
import type { Repo, Run, SlideLogEntry } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const repoSlug = url.searchParams.get("repo");
  let runs = await listDocs<Run>("runs");
  if (repoSlug) runs = runs.filter((r) => r.repoSlug === repoSlug);
  runs.sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  return Response.json({ runs: runs.slice(0, 500) });
}

function normalizeLogs(raw: unknown): SlideLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      title: typeof l.title === "string" ? l.title : "",
      summary: typeof l.summary === "string" ? l.summary : "",
      visuals: Array.isArray(l.visuals)
        ? (l.visuals as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      question: typeof l.question === "string" ? l.question : undefined,
      chosen: typeof l.chosen === "string" ? l.chosen : undefined,
      correct: typeof l.correct === "boolean" ? l.correct : undefined,
    }))
    .filter((l) => l.title || l.summary);
}

/**
 * Save a completed play. Runs are recorded ONLY when the presentation was
 * finished all the way through — the client posts here from the final slide.
 * This record is the lesson log that the next lesson's generation reads.
 */
export async function POST(req: Request) {
  const settings = await getSettings();
  const user = await userFromRequest(req);
  if (!user && !settings.guestCanPlay) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.toolSlug !== "string") {
    return Response.json({ error: "Invalid run payload." }, { status: 400 });
  }
  const slideLogs = normalizeLogs(body.slideLogs);
  if (!slideLogs.length) {
    return Response.json({ error: "A completed run needs slide logs." }, { status: 400 });
  }
  const run: Run = {
    id: newId("run"),
    toolSlug: body.toolSlug,
    toolTitle: typeof body.toolTitle === "string" ? body.toolTitle : body.toolSlug,
    userId: user?.id,
    userName: user ? `@${user.username}` : "@guest",
    playedAt: new Date().toISOString(),
    elapsedMs: Math.max(0, Number(body.elapsedMs) || 0),
    repoSlug: typeof body.repoSlug === "string" ? body.repoSlug : undefined,
    repoRef: typeof body.repoRef === "string" ? body.repoRef : undefined,
    unitTitle: typeof body.unitTitle === "string" ? body.unitTitle : undefined,
    lessonTitle: typeof body.lessonTitle === "string" ? body.lessonTitle : undefined,
    lessonSeq: body.lessonSeq !== undefined ? Number(body.lessonSeq) : undefined,
    lessonSeqTotal: body.lessonSeqTotal !== undefined ? Number(body.lessonSeqTotal) : undefined,
    level: typeof body.level === "string" ? body.level : "—",
    imageStyle: typeof body.imageStyle === "string" ? body.imageStyle : "Any",
    slideCount: slideLogs.length,
    score: Math.max(0, Number(body.score) || 0),
    total: Math.max(0, Number(body.total) || 0),
    slideLogs,
  };
  await putDoc("runs", run);

  if (run.repoSlug) {
    const repos = await listDocs<Repo>("repos");
    const repo = repos.find((r) => r.slug === run.repoSlug);
    if (repo) {
      repo.plays += 1;
      await putDoc("repos", repo);
    }
  }
  return Response.json({ run });
}
