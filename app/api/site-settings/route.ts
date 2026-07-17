import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { PAGE_FIELD_KEYS, PAGE_HEADER_KEYS } from '@/lib/page-settings';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSiteSettings, setSiteSetting } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Which page-copy keys admins may edit (allow-list keeps this from becoming a
// free-form store). Values are short strings.
const KEYS = ['galleryTitle', 'gallerySubtitle', 'galleryFilter', 'toolsShelfTitle', 'picksShelfTitle', 'galleryShelfTitle', 'historyShelfTitle', 'collectionShelfTitle',
  // Dashboard section titles (SectionHeader over the section-picker buttons and over the tables area).
  'dashSectionsShelfTitle', 'dashTablesShelfTitle',
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
  // Per-page chrome for the Repositories & Slides landing pages (banner title/
  // subtitle, discussion heading, cards-per-page) — edited from the dashboard.
  ...PAGE_FIELD_KEYS,
  // Reusable <PageHeader> title/subtitle/emoji keys (Slides, Coach, Dashboard).
  ...PAGE_HEADER_KEYS];
const BANNER_KEYS = new Set(['galleryBanner', 'toolsBanner', 'adminToolsBanner', 'historyBanner', 'collectionBanner']);

// GET /api/site-settings -> the editable page copy (any signed-in viewer reads it).
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
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
  const value = String(b.value ?? '').slice(0, BANNER_KEYS.has(key) ? 600 : 240);
  const ok = await setSiteSetting(key, value);
  if (!ok) return NextResponse.json({ ok: false, error: 'The database write did not land — the value was not saved. Check /api/health.' }, { status: 200 });
  return NextResponse.json({ ok: true, key, value });
}
