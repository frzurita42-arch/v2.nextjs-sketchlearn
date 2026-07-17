import crypto from 'crypto';

// Unambiguous alphabet (no 0/O, 1/I) for human-typeable codes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCouponCode(): string {
  const grp = () => Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return `SKL-${grp()}-${grp()}`;
}

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// The STANDARD minimalistic coupon design — the same ticket template every time,
// so all coupons look consistent. The credit amount and the code are real SVG text
// (always crisp/legible, unlike AI-rendered text), an optional AI background image
// (Nano Banana) sits faintly behind for flavour, and there's a logo slot (a dashed
// placeholder until a logo is uploaded). Returned as an SVG string.
export function buildCouponSvg({ code, credits, bg, logo }: { code: string; credits: number; bg?: string; logo?: string }): string {
  const W = 800, H = 400;
  const ink = '#2d2a26', paper = '#fffdf6', orange = '#f9a03f';
  const bgLayer = bg ? `<image href="${esc(bg)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0.16"/>` : '';
  const logoLayer = logo
    ? `<image href="${esc(logo)}" x="60" y="58" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>`
    : `<rect x="60" y="58" width="120" height="120" rx="16" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="6 6" opacity="0.5"/><text x="120" y="124" text-anchor="middle" font-family="sans-serif" font-size="13" letter-spacing="2" fill="${ink}" opacity="0.45">LOGO</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Coupon ${esc(code)} — ${credits} credits">
  <rect width="${W}" height="${H}" fill="${paper}"/>
  ${bgLayer}
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="22" fill="none" stroke="${ink}" stroke-width="3"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="14" fill="none" stroke="${ink}" stroke-width="1.5" stroke-dasharray="4 6" opacity="0.55"/>
  <circle cx="24" cy="${H / 2}" r="20" fill="${paper}" stroke="${ink}" stroke-width="3"/>
  <circle cx="${W - 24}" cy="${H / 2}" r="20" fill="${paper}" stroke="${ink}" stroke-width="3"/>
  ${logoLayer}
  <text x="${W - 70}" y="98" text-anchor="end" font-family="sans-serif" font-size="20" letter-spacing="4" fill="${ink}" opacity="0.7">SKETCHLEARN CREDIT</text>
  <text x="${W / 2}" y="232" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="120" fill="${ink}">${credits}</text>
  <text x="${W / 2}" y="274" text-anchor="middle" font-family="sans-serif" font-size="26" letter-spacing="10" fill="${orange}">CREDITS</text>
  <text x="${W / 2}" y="344" text-anchor="middle" font-family="'Courier New', monospace" font-size="30" letter-spacing="6" fill="${ink}">${esc(code)}</text>
</svg>`;
}

export function couponSvgDataUri(svg: string): string {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}
