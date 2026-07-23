import crypto from "crypto";
import { getDoc, listDocs, newId, putDoc } from "./store";
import { getSettings } from "./settings";
import type { PublicUser, Role, User } from "./types";

// Client-side signed-token sessions: the token is an HMAC-signed JSON payload
// returned by /api/auth/login and sent back as `Authorization: Bearer <token>`.

const TOKEN_DAYS = 30;

function getSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    // Deterministic per-deployment fallback so dev sessions survive restarts.
    crypto.createHash("sha256").update(`sketchlearn:${process.cwd()}`).digest("hex")
  );
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function issueToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_DAYS * 86400_000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.uid !== "string" || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

// --- Passwords -------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

// --- Users -----------------------------------------------------------------

let seeded = false;

/** Guarantee the default admin exists (admin / 123456 — change in production). */
export async function ensureSeedUsers(): Promise<void> {
  if (seeded) return;
  const users = await listDocs<User>("users");
  if (!users.some((u) => u.role === "admin")) {
    const now = new Date().toISOString();
    await putDoc<User>("users", {
      id: newId("usr"),
      username: "admin",
      name: "Administrator",
      passHash: hashPassword(process.env.ADMIN_PASSWORD || "123456"),
      role: "admin",
      tokens: 1_000_000,
      favoriteRepos: [],
      favoriteTools: [],
      createdAt: now,
    });
  }
  seeded = true;
}

export async function findUserByUsername(username: string): Promise<User | null> {
  await ensureSeedUsers();
  const users = await listDocs<User>("users");
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  return getDoc<User>("users", id);
}

export async function createUser(
  username: string,
  password: string,
  name: string,
  email?: string
): Promise<User | { error: string }> {
  await ensureSeedUsers();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return { error: "Username must be 3-32 characters (letters, numbers, . _ -)." };
  }
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (await findUserByUsername(username)) return { error: "That username is taken." };
  const settings = await getSettings();
  const user: User = {
    id: newId("usr"),
    username,
    name: name || username,
    email,
    passHash: hashPassword(password),
    role: "user",
    tokens: settings.signupTokens,
    favoriteRepos: [],
    favoriteTools: [],
    createdAt: new Date().toISOString(),
  };
  await putDoc("users", user);
  return user;
}

export function toPublicUser(user: User): PublicUser {
  const { passHash: _omit, ...pub } = user;
  return pub;
}

// --- Request helpers -------------------------------------------------------

export async function userFromRequest(req: Request): Promise<User | null> {
  await ensureSeedUsers();
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const uid = verifyToken(token);
  if (!uid) return null;
  const user = await getUserById(uid);
  if (!user || user.suspended) return null;
  return user;
}

const ROLE_RANK: Record<Role, number> = { user: 0, teacher: 1, moderator: 2, admin: 3 };

export function hasRole(user: User | null, minimum: Role): boolean {
  return !!user && ROLE_RANK[user.role] >= ROLE_RANK[minimum];
}

export function unauthorized(message = "Sign in required."): Response {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "You do not have permission to do that."): Response {
  return Response.json({ error: message }, { status: 403 });
}
