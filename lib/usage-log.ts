/* Estimate token usage + cost for a generation and record it. Token counts are
 * ESTIMATED from text length (≈4 chars/token) because the providers we call don't
 * return usage; prices are rough blended public rates for a profitability estimate,
 * not billing. `await` these in a route (fire-and-forget can be dropped by the
 * serverless runtime after the response). Never throws. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { logUsage } = require('@/src/db/usage');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSiteSettings } = require('@/src/db/platform');
import { TOKENS_PER_IMAGE } from '@/lib/cost-estimate';
import { DEFAULT_TEXT_PRICE, DEFAULT_IMAGE_PRICE, mergePrices, type PriceTable } from '@/lib/model-registry';

const estTokens = (s: string) => Math.max(0, Math.ceil(String(s || '').length / 4));

// The live price table = the admin's saved DB prices merged over the defaults,
// cached briefly so logging a generation doesn't hit the DB every time.
let priceCache: { prices: PriceTable; at: number } | null = null;
async function loadPrices(): Promise<PriceTable> {
  if (priceCache && Date.now() - priceCache.at < 5 * 60 * 1000) return priceCache.prices;
  let saved: any = null;
  try { const s = await getSiteSettings(); saved = s?.modelPrices || null; } catch { /* use defaults */ }
  const prices = mergePrices(saved);
  priceCache = { prices, at: Date.now() };
  return prices;
}
const TEXT_PRICE = DEFAULT_TEXT_PRICE;
const IMAGE_PRICE = DEFAULT_IMAGE_PRICE;

export async function recordTextUsage(o: {
  username?: string; kind: string; provider?: string; model?: string;
  input?: string; output?: string; subject?: string; meta?: any;
}): Promise<void> {
  try {
    const p = estTokens(o.input || '');
    const c = estTokens(o.output || '');
    const prices = await loadPrices();
    const price = prices.text[o.provider || 'auto'] || prices.text.default || TEXT_PRICE.default;
    const cost = (p / 1000) * price.in + (c / 1000) * price.out;
    // Keep the PROMPT that produced this generation (trimmed) so the dashboard can
    // show exactly what was sent to the model.
    const prompt = String(o.input || '').slice(0, 4000);
    await logUsage({
      username: o.username, kind: o.kind, provider: o.provider || 'auto', model: o.model || 'text',
      promptTokens: p, completionTokens: c, totalTokens: p + c, costUsd: cost, subject: o.subject,
      meta: { ...(o.meta || {}), prompt },
    });
  } catch { /* best-effort */ }
}

export async function recordImageUsage(o: {
  username?: string; kind?: string; provider?: string; subject?: string; count?: number; meta?: any;
}): Promise<void> {
  try {
    const n = Math.max(1, o.count || 1);
    const prices = await loadPrices();
    const per = prices.image[o.provider || 'default'] ?? prices.image.default ?? IMAGE_PRICE.default;
    // Charge the wallet a flat credit cost per AI image (a placeholder/free
    // Pollinations image still counts as content generated), so the up-front
    // estimate that includes images matches what actually gets debited.
    const walletTokens = (o.provider === 'placeholder') ? 0 : TOKENS_PER_IMAGE * n;
    await logUsage({
      username: o.username, kind: o.kind || 'image', provider: o.provider || '', model: 'image',
      promptTokens: 0, completionTokens: 0, totalTokens: walletTokens, costUsd: per * n, subject: o.subject,
      meta: { ...(o.meta || {}), images: n },
    });
  } catch { /* best-effort */ }
}
