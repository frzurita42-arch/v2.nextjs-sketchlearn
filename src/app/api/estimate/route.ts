import { userFromRequest } from "@/lib/auth";
import { estimateDeckCost } from "@/lib/economy";
import { getSettings } from "@/lib/settings";

/** Pre-generation cost estimate for the affordability gate. */
export async function POST(req: Request) {
  const settings = await getSettings();
  const user = await userFromRequest(req);
  const body = (await req.json().catch(() => null)) ?? {};
  const slideCount = Math.min(Math.max(1, Number(body.slideCount) || 6), 15);
  const cost = estimateDeckCost(settings, slideCount, true);
  return Response.json({
    cost,
    pathCost: settings.pathGenerationCost,
    tokens: user?.tokens ?? null,
    affordable: user ? user.role === "admin" || user.role === "moderator" || user.tokens >= cost : false,
  });
}
