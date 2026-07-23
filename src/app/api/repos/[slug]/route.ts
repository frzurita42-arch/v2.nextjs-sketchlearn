import { forbidden, hasRole, unauthorized, userFromRequest } from "@/lib/auth";
import { renumberRepo } from "@/lib/repo";
import { delDoc, listDocs, putDoc } from "@/lib/store";
import type { Repo, Run, SlideTool, UnitCard } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

async function findRepo(slug: string): Promise<Repo | null> {
  const repos = await listDocs<Repo>("repos");
  return repos.find((r) => r.slug === slug) ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const repo = await findRepo(slug);
  if (!repo) return Response.json({ error: "Repository not found." }, { status: 404 });
  const runs = (await listDocs<Run>("runs"))
    .filter((r) => r.repoSlug === repo.slug)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  const tools = await listDocs<SlideTool>("tools");
  const tool = tools.find((t) => t.slug === repo.studyToolSlug) ?? null;
  return Response.json({ repo, runs, tool });
}

export async function PATCH(req: Request, { params }: Params) {
  const { slug } = await params;
  const user = await userFromRequest(req);
  if (!user) return unauthorized();
  const repo = await findRepo(slug);
  if (!repo) return Response.json({ error: "Repository not found." }, { status: 404 });
  if (repo.ownerId !== user.id && !hasRole(user, "moderator")) return forbidden();
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body." }, { status: 400 });
  // Identity is by slug: title/description/flavor/units/link may change, the slug never does.
  if (typeof body.title === "string" && body.title.trim()) repo.title = body.title.trim();
  if (typeof body.description === "string") repo.description = body.description;
  if (typeof body.studyToolSlug === "string") repo.studyToolSlug = body.studyToolSlug;
  if (["course", "menu", "catalog", "portfolio"].includes(body.flavor)) repo.flavor = body.flavor;
  if (Array.isArray(body.units)) repo.units = body.units as UnitCard[];
  repo.updatedAt = new Date().toISOString();
  renumberRepo(repo);
  await putDoc("repos", repo);
  return Response.json({ repo });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  const user = await userFromRequest(req);
  if (!user) return unauthorized();
  const repo = await findRepo(slug);
  if (!repo) return Response.json({ error: "Repository not found." }, { status: 404 });
  if (repo.ownerId !== user.id && !hasRole(user, "moderator")) return forbidden();
  await delDoc("repos", repo.id);
  return Response.json({ ok: true });
}
