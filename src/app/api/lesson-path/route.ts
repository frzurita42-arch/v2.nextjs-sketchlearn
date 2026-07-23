import { unauthorized, userFromRequest } from "@/lib/auth";
import { canAfford, chargeTokens } from "@/lib/economy";
import { composePathPlan, materializePlan, uniqueSlug } from "@/lib/repo";
import { getSettings } from "@/lib/settings";
import { putDoc } from "@/lib/store";
import type { RepoFlavor } from "@/lib/types";

/**
 * The Lesson Path: one action generates BOTH a repository AND a linked slide
 * tool, pre-linked via studyToolSlug. The client then lands on the REPOSITORY
 * (the path's home), not the individual deck.
 */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return unauthorized("Sign in to build a lesson path.");
  const settings = await getSettings();
  const cost = settings.pathGenerationCost;
  if (!canAfford(user, cost)) {
    return Response.json(
      { error: `Building a path costs ${cost} tokens but you have ${user.tokens}.`, cost },
      { status: 402 }
    );
  }
  const body = await req.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length < 10) {
    return Response.json(
      { error: "Describe what you want to learn or display (at least a sentence)." },
      { status: 400 }
    );
  }
  const flavor: RepoFlavor | "auto" = ["course", "menu", "catalog", "portfolio"].includes(body?.flavor)
    ? body.flavor
    : "auto";

  const { plan, engine } = await composePathPlan(description, flavor);
  const repoSlug = await uniqueSlug("repos", plan.title);
  const toolSlug = await uniqueSlug("tools", plan.toolTitle);
  const { repo, tool } = materializePlan(plan, repoSlug, toolSlug, {
    id: user.id,
    name: user.name,
  });
  await putDoc("tools", tool);
  await putDoc("repos", repo);
  await chargeTokens(user, cost);

  return Response.json({ repo, tool, engine, tokensLeft: user.tokens });
}
