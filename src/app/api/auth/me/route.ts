import { toPublicUser, userFromRequest } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return Response.json({ user: null });
  return Response.json({ user: toPublicUser(user) });
}
