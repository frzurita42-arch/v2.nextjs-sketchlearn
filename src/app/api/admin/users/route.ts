import { forbidden, hasRole, toPublicUser, unauthorized, userFromRequest } from "@/lib/auth";
import { getDoc, listDocs, putDoc } from "@/lib/store";
import type { Role, User } from "@/lib/types";

export async function GET(req: Request) {
  const admin = await userFromRequest(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, "moderator")) return forbidden();
  const users = (await listDocs<User>("users"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublicUser);
  return Response.json({ users });
}

const ROLES: Role[] = ["user", "teacher", "moderator", "admin"];

export async function PATCH(req: Request) {
  const admin = await userFromRequest(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, "moderator")) return forbidden();
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const target = id ? await getDoc<User>("users", id) : null;
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });

  // Role changes and admin accounts are admin-only territory.
  if (body.role !== undefined || target.role === "admin") {
    if (!hasRole(admin, "admin")) return forbidden("Only admins can manage roles or admin accounts.");
  }
  if (body.role !== undefined && ROLES.includes(body.role)) target.role = body.role;
  if (body.tokens !== undefined && Number.isFinite(Number(body.tokens))) {
    target.tokens = Math.max(0, Math.round(Number(body.tokens)));
  }
  if (body.addTokens !== undefined && Number.isFinite(Number(body.addTokens))) {
    target.tokens = Math.max(0, target.tokens + Math.round(Number(body.addTokens)));
  }
  if (typeof body.suspended === "boolean" && target.id !== admin.id) {
    target.suspended = body.suspended;
  }
  await putDoc("users", target);
  return Response.json({ user: toPublicUser(target) });
}
