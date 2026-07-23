import { getDoc, putDoc } from "./store";
import type { PlatformSettings } from "./types";

// Stored under a fixed id in the `settings` collection. Values saved from the
// admin dashboard win over environment variables; env vars (set in Vercel)
// are the base layer so the site works before the dashboard is ever opened.

const SETTINGS_ID = "platform";

export const DEFAULT_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 5,
    currency: "USD",
    tokens: 6000,
    days: 30,
    blurb: "Casual learners — around 25 generated presentations a month.",
  },
  {
    id: "pro",
    name: "Pro",
    price: 15,
    currency: "USD",
    tokens: 25000,
    days: 30,
    blurb: "Teachers and creators — build full courses and catalogs.",
  },
  {
    id: "studio",
    name: "Studio",
    price: 40,
    currency: "USD",
    tokens: 80000,
    days: 30,
    blurb: "Schools and businesses — heavy generation, priority support.",
  },
];

const DEFAULTS: PlatformSettings = {
  aiProvider: "auto",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-4-5",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  imageGeneration: false,
  tokensPerSlide: 30,
  tokensPerImage: 60,
  baseGenerationCost: 40,
  chatCost: 5,
  pathGenerationCost: 120,
  signupTokens: 600,
  guestCanPlay: false,
  plans: DEFAULT_PLANS,
  paymentInstructions:
    "Transfer the plan amount to the account listed in the payment sheet, then upload a photo or screenshot of your receipt below. Include the reference code shown so we can match your transfer. An administrator reviews proofs daily and activates your subscription manually.",
  paymentSheetUrl: "",
};

type StoredSettings = Partial<PlatformSettings> & { id: string };

export async function getSettings(): Promise<PlatformSettings> {
  const stored = await getDoc<StoredSettings>("settings", SETTINGS_ID);
  const merged: PlatformSettings = { ...DEFAULTS, ...(stored ?? {}) } as PlatformSettings;
  // Env vars fill any key left empty in the dashboard.
  if (!merged.anthropicApiKey) merged.anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!merged.openaiApiKey) merged.openaiApiKey = process.env.OPENAI_API_KEY ?? "";
  if (!merged.plans?.length) merged.plans = DEFAULT_PLANS;
  return merged;
}

export async function saveSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const stored = (await getDoc<StoredSettings>("settings", SETTINGS_ID)) ?? { id: SETTINGS_ID };
  const next = { ...stored, ...patch, id: SETTINGS_ID };
  await putDoc("settings", next);
  return getSettings();
}

/** Redact secrets for non-admin exposure. */
export function redactSettings(s: PlatformSettings): PlatformSettings {
  const mask = (v: string) => (v ? `${v.slice(0, 6)}…${v.slice(-4)}` : "");
  return { ...s, anthropicApiKey: mask(s.anthropicApiKey), openaiApiKey: mask(s.openaiApiKey) };
}
