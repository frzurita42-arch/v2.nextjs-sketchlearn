/* The AI models the site actually uses, plus their DEFAULT token/image prices.
 * The admin "Model prices" dashboard can refresh these from the web and save the
 * result to the DB (site_settings key `modelPrices`); usage-log reads the saved
 * prices (falling back to these defaults) to compute the dollar cost of a
 * generation. Text prices are USD per 1K tokens; image prices are USD per image. */

export interface ModelInfo {
  provider: string;   // the key usage-log logs under (and the price-map key)
  label: string;      // human name for the table
  model: string;      // the concrete model slug (for the web price search)
  kind: 'text' | 'image';
}

// One row per model surface the platform can call.
export const MODELS: ModelInfo[] = [
  { provider: 'gemini', label: 'Google Gemini Flash (text)', model: 'gemini-3.5-flash', kind: 'text' },
  { provider: 'openrouter', label: 'OpenRouter (gpt-4o-mini)', model: 'openai/gpt-4o-mini', kind: 'text' },
  { provider: 'deepseek', label: 'DeepSeek Chat', model: 'deepseek-chat', kind: 'text' },
  { provider: 'grok', label: 'xAI Grok (text)', model: 'grok-4-fast', kind: 'text' },
  { provider: 'moonshot', label: 'Moonshot Kimi', model: 'kimi-k2', kind: 'text' },
  { provider: 'openai', label: 'OpenAI gpt-image-1', model: 'gpt-image-1', kind: 'image' },
  { provider: 'gemini', label: 'Gemini Nano Banana (image)', model: 'gemini-3.1-flash-image', kind: 'image' },
  { provider: 'grok', label: 'Grok image', model: 'grok-2-image', kind: 'image' },
  { provider: 'replicate', label: 'Replicate Flux', model: 'black-forest-labs/flux-schnell', kind: 'image' },
  { provider: 'leonardo', label: 'Leonardo Phoenix', model: 'leonardo-phoenix-1.0', kind: 'image' },
  { provider: 'pollinations', label: 'Pollinations (free)', model: 'flux', kind: 'image' },
];

export type TextPrice = { in: number; out: number };
export type PriceTable = { text: Record<string, TextPrice>; image: Record<string, number>; updatedAt?: string; source?: string };

// USD per 1K tokens (input / output), by text provider. Approximate defaults.
export const DEFAULT_TEXT_PRICE: Record<string, TextPrice> = {
  deepseek: { in: 0.00027, out: 0.0011 },
  openrouter: { in: 0.0006, out: 0.0018 },
  gemini: { in: 0.000075, out: 0.0003 },
  grok: { in: 0.0005, out: 0.0015 },
  moonshot: { in: 0.00015, out: 0.0025 },
  auto: { in: 0.0005, out: 0.0015 },
  default: { in: 0.0005, out: 0.0015 },
};

// USD per generated image, by image provider. Pollinations/placeholder are free.
export const DEFAULT_IMAGE_PRICE: Record<string, number> = {
  openai: 0.04, grok: 0.07, replicate: 0.003, gemini: 0.03, leonardo: 0.01,
  pollinations: 0, placeholder: 0, default: 0.02,
};

export const DEFAULT_PRICES: PriceTable = { text: DEFAULT_TEXT_PRICE, image: DEFAULT_IMAGE_PRICE, source: 'defaults' };

// Merge a saved (partial) price table over the defaults so a missing entry never
// breaks the cost calc.
export function mergePrices(saved?: Partial<PriceTable> | null): PriceTable {
  const text: Record<string, TextPrice> = { ...DEFAULT_TEXT_PRICE };
  const image: Record<string, number> = { ...DEFAULT_IMAGE_PRICE };
  if (saved && saved.text && typeof saved.text === 'object') {
    for (const k of Object.keys(saved.text)) {
      const v = (saved.text as any)[k];
      if (v && typeof v === 'object' && (Number.isFinite(v.in) || Number.isFinite(v.out))) {
        text[k] = { in: Number(v.in) || 0, out: Number(v.out) || 0 };
      }
    }
  }
  if (saved && saved.image && typeof saved.image === 'object') {
    for (const k of Object.keys(saved.image)) {
      const v = Number((saved.image as any)[k]);
      if (Number.isFinite(v)) image[k] = v;
    }
  }
  return { text, image, updatedAt: saved?.updatedAt, source: saved?.source || 'defaults' };
}
