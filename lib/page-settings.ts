/* Editable page-chrome for the two landing pages (Repositories & Slides).
 *
 * Every field here is stored as a row in the `site_settings` DB table (key →
 * value), edited from the Teacher's dashboard, and READ by ToolsView so the page
 * renders from the database — not from hard-coded strings or browser cache.
 *
 * One source of truth: the dashboard editor table AND the landing pages both
 * import PAGE_FIELDS, so they can never drift apart. */

export type PageKind = 'repository' | 'presentation';

export interface PageTextField {
  key: string;               // the site_settings key
  page: PageKind;            // which landing page it belongs to
  label: string;             // shown in the dashboard editor
  type: 'text' | 'number';   // number = a bounded integer (e.g. cards per page)
  default: string;           // used when the key isn't set yet
  min?: number;              // for number fields
  max?: number;
}

export const PAGE_FIELDS: PageTextField[] = [
  // ── Repositories page ──
  { key: 'galleryTitle', page: 'repository', label: 'Banner title', type: 'text', default: 'Tool gallery' },
  { key: 'gallerySubtitle', page: 'repository', label: 'Banner subtitle', type: 'text', default: 'Open a tool, or build your own by describing it to the AI.' },
  { key: 'repoDiscussionTitle', page: 'repository', label: 'Discussion heading', type: 'text', default: '💬 Discussion' },
  { key: 'repoPerPage', page: 'repository', label: 'Cards per page', type: 'number', default: '6', min: 1, max: 60 },
  // ── Slides page ──
  { key: 'slideGalleryTitle', page: 'presentation', label: 'Banner title', type: 'text', default: '🎞️ Slides' },
  { key: 'slideGallerySubtitle', page: 'presentation', label: 'Banner subtitle', type: 'text', default: 'Browse every slide presentation — open one to play it.' },
  { key: 'slideDiscussionTitle', page: 'presentation', label: 'Discussion heading', type: 'text', default: '💬 Discussion' },
  { key: 'slidePerPage', page: 'presentation', label: 'Cards per page', type: 'number', default: '6', min: 1, max: 60 },
];

export const PAGE_FIELD_KEYS = PAGE_FIELDS.map((f) => f.key);

// ── Reusable page-header definitions ───────────────────────────────────────
// A <PageHeader page="…"> reads its title/subtitle/emoji from these site_settings
// keys (falling back to the defaults), so the same header component drives the
// Slides, Coach and Dashboard pages — all editable from the DB.
export interface PageHeaderDef {
  titleKey: string;
  subtitleKey: string;
  emojiKey: string;      // the emoji shown before the title (admin can change it)
  emojiOffKey: string;   // '1' hides the emoji (the 👁 toggle)
  defaultEmoji: string;
  defaultTitle: string;
  defaultSubtitle: string;
}

export const PAGE_HEADERS: Record<string, PageHeaderDef> = {
  slides: {
    titleKey: 'slideGalleryTitle', subtitleKey: 'slideGallerySubtitle',
    emojiKey: 'slideEmoji', emojiOffKey: 'slideEmojiOff',
    defaultEmoji: '🎞️', defaultTitle: 'Slides',
    defaultSubtitle: 'Browse every slide presentation — open one to play it.',
  },
  coach: {
    titleKey: 'coachTitle', subtitleKey: 'coachSubtitle',
    emojiKey: 'coachEmoji', emojiOffKey: 'coachEmojiOff',
    defaultEmoji: '💬', defaultTitle: 'Coach chat',
    defaultSubtitle: 'The coach reads your progress spreadsheet and guides your next steps.',
  },
  dashboard: {
    titleKey: 'dashTitle', subtitleKey: 'dashSubtitle',
    emojiKey: 'dashEmoji', emojiOffKey: 'dashEmojiOff',
    defaultEmoji: '🧑‍🏫', defaultTitle: 'Teacher’s dashboard',
    defaultSubtitle: 'One page at a time — pick a section below.',
  },
};

export const PAGE_HEADER_KEYS = Object.values(PAGE_HEADERS).flatMap((d) => [d.titleKey, d.subtitleKey, d.emojiKey, d.emojiOffKey]);

// Clamp a stored per-page value to a sane integer (falls back to the default).
export function perPageOf(raw: string | undefined, def = 6): number {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(60, n));
}
