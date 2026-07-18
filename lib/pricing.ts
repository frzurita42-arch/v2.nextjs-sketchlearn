/* Real-cost + profit math. Credits are the internal consumption unit (what a
 * generation spends). This turns credits into an ESTIMATED real dollar cost using
 * the live model prices, so the admin can price packages/coins for a target
 * profit margin instead of guessing. "Coins" are just a simpler-numbered sale
 * unit: 1 coin = `creditsPerCoin` credits. */
import type { PriceTable } from './model-registry';
import { DEFAULT_TEXT_PRICE, DEFAULT_IMAGE_PRICE } from './model-registry';
import { TOKENS_PER_SLIDE_TEXT, TOKENS_PER_IMAGE, TOKENS_PER_SUPPORT } from './cost-estimate';

// Rough token counts for ONE slide's text generation (prompt in + content out),
// used only to price the text share. Images dominate the real cost.
const TEXT_INPUT_TOK = 2200, TEXT_OUTPUT_TOK = 700;
export const CREDITS_PER_SLIDE = TOKENS_PER_SLIDE_TEXT + TOKENS_PER_IMAGE + TOKENS_PER_SUPPORT;
export const LESSON_SLIDES = 5;
export const DEFAULT_MARGIN_PCT = 30;   // target profit margin over real cost
export const DEFAULT_CREDITS_PER_COIN = 100;

// Real USD cost of one reference slide = its text generation + one AI image.
export function costPerSlideUsd(prices: PriceTable): number {
  const tp = prices?.text?.gemini || prices?.text?.default || DEFAULT_TEXT_PRICE.default;
  const textCost = (TEXT_INPUT_TOK / 1000) * tp.in + (TEXT_OUTPUT_TOK / 1000) * tp.out;
  const imgCost = prices?.image?.gemini ?? prices?.image?.default ?? DEFAULT_IMAGE_PRICE.default;
  return textCost + imgCost;
}
export function costPerCreditUsd(prices: PriceTable): number {
  return costPerSlideUsd(prices) / CREDITS_PER_SLIDE;
}
export function realCostUsd(credits: number, prices: PriceTable): number {
  return Math.max(0, Number(credits) || 0) * costPerCreditUsd(prices);
}
// The minimum price to charge for `credits` to clear the target margin.
export function priceWithMarginUsd(credits: number, prices: PriceTable, marginPct: number): number {
  return realCostUsd(credits, prices) * (1 + (Number(marginPct) || 0) / 100);
}
