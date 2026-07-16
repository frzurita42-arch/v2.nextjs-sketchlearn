/* Estimate token usage + cost for a generation and record it. Token counts are
 * ESTIMATED from text length (≈4 chars/token) because the providers we call don't
 * return usage; prices are rough blended public rates for a profitability estimate,
 * not billing. `await` these in a route (fire-and-forget can be dropped by the
 * serverless runtime after the response). Never throws. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { logUsage } = require('@/src/db/usage');

const estTokens = (s: string) => Math.max(0, Math.ceil(String(s || '').length / 4));

// USD per 1K tokens (input / output), by text provider. Approximate.
const TEXT_PRICE: Record<string, { in: number; out: number }> = {
  deepseek: { in: 0.00027, out: 0.0011 },
  openrouter: { in: 0.0006, out: 0.0018 },
  gemini: { in: 0.000075, out: 0.0003 },
  grok: { in: 0.0005, out: 0.0015 },
  moonshot: { in: 0.00015, out: 0.0025 },
  auto: { in: 0.0005, out: 0.0015 },
  default: { in: 0.0005, out: 0.0015 },
};
// USD per generated image, by image provider. Approximate; Pollinations is free.
const IMAGE_PRICE: Record<string, number> = {
  openai: 0.04, grok: 0.07, replicate: 0.003, gemini: 0.03, leonardo: 0.01,
  pollinations: 0, placeholder: 0, default: 0.02,
};

export async function recordTextUsage(o: {
  username?: string; kind: string; provider?: string; model?: string;
  input?: string; output?: string; subject?: string; meta?: any;
}): Promise<void> {
  try {
    const p = estTokens(o.input || '');
    const c = estTokens(o.output || '');
    const price = TEXT_PRICE[o.provider || 'auto'] || TEXT_PRICE.default;
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
    const per = IMAGE_PRICE[o.provider || 'default'] ?? IMAGE_PRICE.default;
    await logUsage({
      username: o.username, kind: o.kind || 'image', provider: o.provider || '', model: 'image',
      promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: per * n, subject: o.subject,
      meta: { ...(o.meta || {}), images: n },
    });
  } catch { /* best-effort */ }
}
