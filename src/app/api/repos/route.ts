import { unauthorized, userFromRequest } from "@/lib/auth";
import { renumberRepo, repoRef, uniqueSlug } from "@/lib/repo";
import { listDocs, newId, putDoc } from "@/lib/store";
import type { Repo, RepoFlavor } from "@/lib/types";

export async function GET() {
  const repos = await listDocs<Repo>("repos");
  repos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return Response.json({ repos });
}

const FLAVORS: RepoFlavor[] = ["course", "menu", "catalog", "portfolio"];

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return unauthorized("Sign in to create repositories.");
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "Title is required." }, { status: 400 });
  const flavor = FLAVORS.includes(body?.flavor) ? (body.flavor as RepoFlavor) : "course";
  const now = new Date().toISOString();
  const slug = await uniqueSlug("repos", title);
  const repo: Repo = renumberRepo({
    id: newId("repo"),
    slug,
    ref: repoRef(slug),
    title,
    description: typeof body?.description === "string" ? body.description : "",
    flavor,
    ownerId: user.id,
    ownerName: user.name,
    studyToolSlug: typeof body?.studyToolSlug === "string" ? body.studyToolSlug : undefined,
    units: [],
    lessonSeqTotal: 0,
    plays: 0,
    createdAt: now,
    updatedAt: now,
  });
  await putDoc("repos", repo);
  return Response.json({ repo });
}
