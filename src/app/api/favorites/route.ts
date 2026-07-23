import { toPublicUser, unauthorized, userFromRequest } from "@/lib/auth";
import { putDoc } from "@/lib/store";

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => null);
  const kind = body?.kind === "repo" ? "repo" : body?.kind === "tool" ? "tool" : null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  if (!kind || !slug) return Response.json({ error: "kind and slug required." }, { status: 400 });
  const list = kind === "repo" ? user.favoriteRepos : user.favoriteTools;
  const idx = list.indexOf(slug);
  if (idx === -1) list.push(slug);
  else list.splice(idx, 1);
  await putDoc("users", user);
  return Response.json({ user: toPublicUser(user) });
}
