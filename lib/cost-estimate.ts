/* Rough, deterministic estimate of how many wallet credits a generation will
 * cost, so the app can show the price up front and block a run the user can't
 * afford. The wallet is still debited per-request as the run proceeds (see
 * usage-log); this just approximates the total BEFORE starting. Numbers are
 * intentionally simple and centralized here so they're easy to tune. */
import { MAX_SLIDES } from '@/lib/tool-schema';

// Per-slide costs, in the same "credit" unit the wallet is debited in.
export const TOKENS_PER_SLIDE_TEXT = 500;   // the teaching text + questions
export const TOKENS_PER_IMAGE = 150;        // one AI image on a slide
export const TOKENS_PER_SUPPORT = 80;       // a table / formula / wolfram block
// Per-card cost when generating a repository of cards.
export const TOKENS_PER_REPO_CARD = 120;

function clampSlides(n: any): number {
  const v = parseInt(String(n ?? ''), 10);
  if (!Number.isFinite(v)) return 5;
  return Math.max(1, Math.min(MAX_SLIDES, v));
}

// Whether a lesson config plans images (default yes). Honors the various flags
// the create form / lesson support use to turn images off.
function imagesPlanned(cfg: any): boolean {
  if (!cfg) return true;
  if (cfg.sup_images === false) return false;
  if (cfg.imageDensity === 'text-only' || cfg.density === 'text-only') return false;
  if (cfg.support && cfg.support.images === false) return false;
  return true;
}

// Estimate the credits to generate a whole slide presentation from its config
// (slide count + whether images are planned). Pass the run config and/or the
// lesson (for totalSlides / support defaults).
export function estimateLessonTokens(cfg: any = {}): number {
  const slides = clampSlides(cfg.slides ?? cfg.totalSlides);
  const perSlide = TOKENS_PER_SLIDE_TEXT + (imagesPlanned(cfg) ? TOKENS_PER_IMAGE : 0) + TOKENS_PER_SUPPORT;
  return slides * perSlide;
}

// Estimate the credits to generate a repository of `cardCount` cards.
export function estimateRepoTokens(cardCount: any): number {
  const n = Math.max(1, Math.min(200, parseInt(String(cardCount ?? ''), 10) || 8));
  return n * TOKENS_PER_REPO_CARD;
}
