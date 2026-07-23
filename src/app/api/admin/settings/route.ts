import { forbidden, hasRole, unauthorized, userFromRequest } from "@/lib/auth";
import { getSettings, saveSettings } from "@/lib/settings";
import type { PlatformSettings, Plan } from "@/lib/types";

export async function GET(req: Request) {
  const admin = await userFromRequest(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, "admin")) return forbidden();
  const settings = await getSettings();
  return Response.json({
    settings,
    envKeys: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      database: !!process.env.DATABASE_URL,
    },
  });
}

const NUMERIC_KEYS = [
  "tokensPerSlide",
  "tokensPerImage",
  "baseGenerationCost",
  "chatCost",
  "pathGenerationCost",
  "signupTokens",
] as const;

export async function PUT(req: Request) {
  const admin = await userFromRequest(req);
  if (!admin) return unauthorized();
  if (!hasRole(admin, "admin")) return forbidden("Only admins can change platform settings.");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body." }, { status: 400 });
  }
  const patch: Partial<PlatformSettings> = {};
  if (["auto", "anthropic", "openai"].includes(body.aiProvider)) patch.aiProvider = body.aiProvider;
  for (const key of ["anthropicApiKey", "anthropicModel", "openaiApiKey", "openaiModel", "paymentInstructions", "paymentSheetUrl"] as const) {
    if (typeof body[key] === "string") patch[key] = body[key];
  }
  if (typeof body.imageGeneration === "boolean") patch.imageGeneration = body.imageGeneration;
  if (typeof body.guestCanPlay === "boolean") patch.guestCanPlay = body.guestCanPlay;
  for (const key of NUMERIC_KEYS) {
    if (body[key] !== undefined && Number.isFinite(Number(body[key]))) {
      patch[key] = Math.max(0, Math.round(Number(body[key])));
    }
  }
  if (Array.isArray(body.plans)) {
    const plans = (body.plans as Partial<Plan>[])
      .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
      .map((p) => ({
        id: p.id as string,
        name: p.name as string,
        price: Math.max(0, Number(p.price) || 0),
        currency: typeof p.currency === "string" && p.currency ? p.currency : "USD",
        tokens: Math.max(0, Math.round(Number(p.tokens) || 0)),
        days: Math.max(1, Math.round(Number(p.days) || 30)),
        blurb: typeof p.blurb === "string" ? p.blurb : "",
      }));
    if (plans.length) patch.plans = plans;
  }
  const settings = await saveSettings(patch);
  return Response.json({ settings });
}
