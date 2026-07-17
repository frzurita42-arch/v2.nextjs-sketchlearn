import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { makeCouponCode, buildCouponSvg, couponSvgDataUri } from '@/lib/coupon';
import { generateImage } from '@/src/ai/providers';
import { NO_TEXT_RULE } from '@/lib/image-styles';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCoupon, listCoupons } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// GET /api/coupons (admin) -> the coupons created so far.
export async function GET(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const coupons = await listCoupons({ limit: 200 });
  return NextResponse.json({ coupons });
}

// POST /api/coupons (admin) -> generate a coupon worth `credits`. When `useAi` is
// set, Nano Banana (Gemini image, per the provider order) paints a minimalist
// background for the coupon art; the credits & code are always crisp SVG text.
// `logo` (a data/URL) is embedded in the logo slot when provided.
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const credits = Math.max(1, Math.min(1_000_000, Math.trunc(Number(b.credits) || 0)));
  if (!credits) return NextResponse.json({ error: 'Enter a credit amount.' }, { status: 400 });
  const useAi = !!b.useAi;
  const logo = typeof b.logo === 'string' && /^(https?:|data:image\/)/i.test(b.logo) ? b.logo.slice(0, 1_800_000) : '';

  const code = makeCouponCode();

  // The fixed, minimalist coupon-ad backdrop — same brief every time so the art
  // style is consistent. No text/numbers/logos in the AI image itself.
  let bg = '';
  if (useAi) {
    const prompt = [
      'A minimalist, elegant coupon / gift-card BACKGROUND texture. Soft cream paper with subtle abstract geometric shapes and gentle flowing lines in a cohesive warm palette (cream, soft orange #f9a03f, muted blue). Lots of clean negative space, flat and modern, premium and calm. A repeatable brand backdrop.',
      NO_TEXT_RULE,
    ].join(' ');
    try { bg = (await generateImage(prompt)) || ''; } catch { bg = ''; }
  }

  const svg = buildCouponSvg({ code, credits, bg, logo });
  const image = couponSvgDataUri(svg);
  const row = await createCoupon({ code, credits, image, createdBy: a.user.username });
  if (!row) return NextResponse.json({ error: 'Could not save the coupon.' }, { status: 500 });
  return NextResponse.json({ code, credits, image, aiBackground: !!bg });
}
