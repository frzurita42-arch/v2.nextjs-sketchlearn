import { checkPassword, findUserByUsername, issueToken, toPublicUser } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return Response.json({ error: "Username and password are required." }, { status: 400 });
  }
  const user = await findUserByUsername(username);
  if (!user || !checkPassword(password, user.passHash)) {
    return Response.json({ error: "Invalid username or password." }, { status: 401 });
  }
  if (user.suspended) {
    return Response.json({ error: "This account is suspended." }, { status: 403 });
  }
  return Response.json({ token: issueToken(user.id), user: toPublicUser(user) });
}
