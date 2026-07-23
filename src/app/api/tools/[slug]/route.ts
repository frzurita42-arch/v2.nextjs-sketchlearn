import { forbidden, hasRole, unauthorized, userFromRequest } from "@/lib/auth";
import { delDoc, listDocs, putDoc } from "@/lib/store";
import type { Repo, SlideTool } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

async function findTool(slug: string): Promise<SlideTool | null> {
  const tools = await listDocs<SlideTool>("tools");
  return tools.find((t) => t.slug === slug) ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const tool = await findTool(slug);
  if (!tool) return Response.json({ error: "Slide tool not found." }, { status: 404 });
  const linkedRepos = (await listDocs<Repo>("repos")).filter((r) => r.studyToolSlug === slug);
  return Response.json({ tool, linkedRepos });
}

export async function PATCH(req: Request, { params }: Params) {
  const { slug } = await params;
  const user = await userFromRequest(req);
  if (!user) return unauthorized();
  const tool = await findTool(slug);
  if (!tool) return Response.json({ error: "Slide tool not found." }, { status: 404 });
  if (tool.ownerId !== user.id && !hasRole(user, "moderator")) return forbidden();
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body." }, { status: 400 });
  if (typeof body.title === "string" && body.title.trim()) tool.title = body.title.trim();
  if (typeof body.description === "string") tool.description = body.description;
  if (["auto", "academic", "showcase"].includes(body.contentMode)) tool.contentMode = body.contentMode;
  if (body.defaults && typeof body.defaults === "object") {
    const d = body.defaults;
    if (typeof d.level === "string" && d.level) tool.defaults.level = d.level;
    if (d.slideCount) tool.defaults.slideCount = Math.min(Math.max(1, Number(d.slideCount)), 15);
    if (d.paragraphsPerSlide)
      tool.defaults.paragraphsPerSlide = Math.min(Math.max(1, Number(d.paragraphsPerSlide)), 4);
    if (typeof d.imageStyle === "string" && d.imageStyle) tool.defaults.imageStyle = d.imageStyle;
    if (typeof d.instructions === "string") tool.defaults.instructions = d.instructions;
  }
  tool.updatedAt = new Date().toISOString();
  await putDoc("tools", tool);
  return Response.json({ tool });
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  const user = await userFromRequest(req);
  if (!user) return unauthorized();
  const tool = await findTool(slug);
  if (!tool) return Response.json({ error: "Slide tool not found." }, { status: 404 });
  if (tool.ownerId !== user.id && !hasRole(user, "moderator")) return forbidden();
  await delDoc("tools", tool.id);
  return Response.json({ ok: true });
}
