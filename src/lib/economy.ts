import { putDoc } from "./store";
import type { PlatformSettings, User } from "./types";

// Token economy: every generation costs tokens, with a pre-generation cost
// estimate and an affordability gate. Moderators/admins manage balances and
// prices from the dashboard.

export function estimateDeckCost(
  settings: PlatformSettings,
  slideCount: number,
  withImages: boolean
): number {
  const images = withImages && settings.imageGeneration ? Math.min(3, slideCount) : 0;
  return (
    settings.baseGenerationCost +
    settings.tokensPerSlide * slideCount +
    settings.tokensPerImage * images
  );
}

export function canAfford(user: User | null, cost: number): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "moderator") return true;
  return user.tokens >= cost;
}

export async function chargeTokens(user: User, cost: number): Promise<User> {
  if (user.role === "admin" || user.role === "moderator") return user;
  user.tokens = Math.max(0, user.tokens - cost);
  await putDoc("users", user);
  return user;
}

export function subscriptionActive(user: User): boolean {
  return !!user.subscription && new Date(user.subscription.expiresAt).getTime() > Date.now();
}
