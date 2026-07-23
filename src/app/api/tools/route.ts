import { unauthorized, userFromRequest } from "@/lib/auth";
import { uniqueSlug } from "@/lib/repo";
import { listDocs, newId, putDoc } from "@/lib/store";
import type { ContentMode, SlideTool } from "@/lib/types";

export async function GET() {
  const tools = await listDocs<SlideTool>("tools");
  tools.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return Response.json({ tools });
}

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return unauthorized("Sign in to create slide tools.");
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "Title is required." }, { status: 400 });
  const now = new Date().toISOString();
  const contentMode: ContentMode = ["auto", "academic", "showcase"].includes(body?.contentMode)
    ? body.contentMode
    : "auto";
  const tool: SlideTool = {
    id: newId("tool"),
    slug: await uniqueSlug("tools", title),
    title,
    description: typeof body?.description === "string" ? body.description : "",
    ownerId: user.id,
    ownerName: user.name,
    contentMode,
    defaults: {
      level: typeof body?.level === "string" && body.level ? body.level : "Intermediate",
      slideCount: Math.min(Math.max(1, Number(body?.slideCount) || 6), 15),
      paragraphsPerSlide: Math.min(Math.max(1, Number(body?.paragraphsPerSlide) || 2), 4),
      imageStyle:
        typeof body?.imageStyle === "string" && body.imageStyle
          ? body.imageStyle
          : "Chalkboard sketch",
      instructions: typeof body?.instructions === "string" ? body.instructions : "",
    },
    plays: 0,
    createdAt: now,
    updatedAt: now,
  };
  await putDoc("tools", tool);
  return Response.json({ tool });
}
