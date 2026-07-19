import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { PAGE_FIELD_KEYS, PAGE_HEADER_KEYS } from '@/lib/page-settings';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSiteSettings, setSiteSetting, deleteSiteSetting } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Which page-copy keys admins may edit (allow-list keeps this from becoming a
// free-form store). Values are short strings.
const CARD_SCOPE_PAGES = ['slides', 'tools', 'presrun', 'moderators', 'users', 'sandbox', 'empty'];
const HEADER_SCOPE_PAGES = [...CARD_SCOPE_PAGES, 'appsettings'];
const CARD_SETTING_KEYS = [
  'sl_card_size',
  'sl_card_img',
  ...CARD_SCOPE_PAGES.flatMap((p) => [`sl_card_size:${p}`, `sl_card_img:${p}`]),
];
const HEADER_SETTING_KEYS = [
  'sl_title_size',
  'sl_sub_size',
  ...HEADER_SCOPE_PAGES.flatMap((p) => [`sl_title_size:${p}`, `sl_sub_size:${p}`]),
];
const BANNER_SETTING_KEYS = [
  'sl_banner_title',
  'sl_banner_body',
  'sl_banner_size',
  ...CARD_SCOPE_PAGES.flatMap((p) => [`sl_banner_title:${p}`, `sl_banner_body:${p}`, `sl_banner_size:${p}`]),
];
const TOOL_HEADER_SETTING_KEYS = [
  'sl_tool_header_size', 'sl_tool_header_font', 'sl_tool_header_under',
  'sl_tool_header_size:lesson', 'sl_tool_header_font:lesson', 'sl_tool_header_under:lesson',
  'sl_tool_header_size:tool', 'sl_tool_header_font:tool', 'sl_tool_header_under:tool',
];

const KEYS = ['galleryTitle', 'gallerySubtitle', 'galleryFilter', 'toolsShelfTitle', 'picksShelfTitle', 'galleryShelfTitle', 'historyShelfTitle', 'collectionShelfTitle',
  // Dashboard section titles (SectionHeader over the section-picker buttons and over the tables area).
  'dashSectionsShelfTitle', 'dashTablesShelfTitle',
  // Owner toggle: hide the lesson page's 🎛 slide-tool command center ('1' = hidden).
  'slideCommandCenterHidden',
  // The three admin coupon tiers, stored as a small JSON string ([{tokens,usd}]).
  'couponTiers',
  // Editable token packages shown on the dashboard ([{tokens,usd,note}] JSON).
  'tokenPackages',
  // Pricing/profit knobs: target margin % and how many credits equal one coin.
  'profitMargin', 'creditsPerCoin',
  // Section how-to banners (longer text).
  'galleryBanner', 'toolsBanner', 'adminToolsBanner', 'historyBanner', 'collectionBanner',
  // Home-page section visibility ('1' = collapsed/hidden for regular users). The
  // admin's 👁 toggle writes these, so the home layout differs per admin choice.
  'galleryCollapsed', 'toolsCollapsed', 'adminToolsCollapsed',
  // Donation prompt copy (admin-editable, like the section titles). The wallet
  // address + 👁 collapse are per-tool (owner/admin) via /api/tools/donation.
  'donateNudge', 'donateNote',
  // DiscussionSection: the tool-page discussion title + per-surface 👁 hide
  // flags ('1' = hidden from regular users). The gallery titles themselves are
  // already covered by PAGE_FIELD_KEYS (repoDiscussionTitle/slideDiscussionTitle).
  'toolDiscussionTitle', 'repoDiscussionCollapsed', 'slideDiscussionCollapsed', 'toolDiscussionCollapsed',
  // Moderators directory: editable discussion heading + 👁 hide flag.
  'moderatorsDiscussionTitle', 'moderatorsDiscussionCollapsed',
  // Per-page chrome for the Repositories & Slides landing pages (banner title/
  // subtitle, discussion heading, cards-per-page) — edited from the dashboard.
  ...PAGE_FIELD_KEYS,
  // Reusable <PageHeader> title/subtitle/emoji keys (Slides, Coach, Dashboard).
  ...PAGE_HEADER_KEYS,
  // Global visual settings from the Settings page (shared across browsers/sessions).
  ...CARD_SETTING_KEYS,
  ...HEADER_SETTING_KEYS,
  ...BANNER_SETTING_KEYS,
  ...TOOL_HEADER_SETTING_KEYS,
];
const BANNER_KEYS = new Set(['galleryBanner', 'toolsBanner', 'adminToolsBanner', 'historyBanner', 'collectionBanner']);

// GET /api/site-settings -> the editable page copy. Public (guests need it too, to
// render the gallery banners/titles); it only exposes allow-listed page copy.
export async function GET() {
  const all = await getSiteSettings();
  const out: Record<string, string> = {};
  for (const k of KEYS) if (typeof all?.[k] === 'string') out[k] = all[k];
  return NextResponse.json({ settings: out }, { headers: { 'Cache-Control': 'no-cache' } });
}

// PUT /api/site-settings { key, value } -> save one page-copy string. ADMIN only.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit page copy.' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) || {};
  const key = String(b.key || '');
  if (!KEYS.includes(key)) return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 });
  const longKey = BANNER_KEYS.has(key) || key === 'tokenPackages' || key === 'sl_banner_body' || key.startsWith('sl_banner_body:');
  const value = String(b.value ?? '').slice(0, longKey ? 800 : 240);
  const ok = await setSiteSetting(key, value);
  if (!ok) return NextResponse.json({ ok: false, error: 'The database write did not land — the value was not saved. Check /api/health.' }, { status: 200 });
  return NextResponse.json({ ok: true, key, value });
}

// DELETE /api/site-settings { key } -> remove one setting so it falls back to
// defaults/global. ADMIN only.
export async function DELETE(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit page copy.' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) || {};
  const key = String(b.key || '');
  if (!KEYS.includes(key)) return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 });
  const ok = await deleteSiteSetting(key);
  if (!ok) return NextResponse.json({ ok: false, error: 'The database delete did not land — the value was not removed. Check /api/health.' }, { status: 200 });
  return NextResponse.json({ ok: true, key });
}
