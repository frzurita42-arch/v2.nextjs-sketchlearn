/* Component & container registry — a curated catalogue of the reusable UI pieces
 * on the site. Maintained by hand: entries are ADDED or DELETED on request during
 * a build session. Surfaced as the dashboard's "Components" tab.
 *
 * Each entry: what it is, where it lives (file path), which INPUTS it takes
 * (props, form fields, buttons/toggles it exposes), a recommendation for using
 * or improving it, and when it was added to the registry.
 *
 * kind: 'container' = a layout block that holds other components;
 *       'component' = a reusable UI element/renderer. */

const cap = (s, n = 300) => String(s || '').slice(0, n);

function item(e) {
  return {
    id: `cmp-${(e.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
    name: cap(e.name, 80),
    kind: e.kind === 'container' ? 'container' : 'component',
    description: cap(e.description),
    inputs: cap(e.inputs),
    location: cap(e.location, 160),
    recommendations: cap(e.recommendations),
    // How many places on the website this component/container is used.
    uses: Number(e.uses) || 0,
    createdAt: e.createdAt,
  };
}

const COMPONENT_REGISTRY = [
  item({ name: 'PageHeader', uses: 4, kind: 'container', createdAt: '2026-07-17T14:10:00Z',
    location: 'components/ui/PageHeader.tsx',
    description: 'The reusable DB-driven page header: an optional emoji (👁 to hide, click to change) under the same scribble underline as the title, a subtitle, each editable inline (✎) or AI-reworded (🎨), closing with a dashed separator. Drives the Repositories, Slides, Coach and Dashboard pages via PAGE_HEADERS.',
    inputs: 'Prop: page (which PAGE_HEADERS entry). Admin inputs: inline title & subtitle text fields (✎ edit, Enter saves, Esc cancels), 🎨 AI-reword buttons, 👁 emoji show/hide toggle, click-the-emoji prompt. Writes site_settings keys via PUT /api/site-settings.',
    recommendations: 'Allow a per-page actions slot (e.g. the Coach ⬇ spreadsheet button) as a prop.' }),
  item({ name: 'SectionHeader', uses: 8, kind: 'container', createdAt: '2026-07-17T16:15:00Z',
    location: 'components/ui/SectionHeader.tsx',
    description: 'The STANDARD section title row (double-size, 36px) reused across collections & carousels — it powers the Gallery, Cards, History, Slides, Repositories, Discussion and Comments section titles. Same instance everywhere, different title. Controls: ✎ edit · 🎨 AI-reword · 🔄 refresh · 👁 hide.',
    inputs: 'Props: title, canEditTitle (shows ✎/🎨), onRenameTitle, onRemixTitle, remixingTitle, onRefresh/refreshing/refreshTitle (🔄), extra (custom controls before the eye), showCollapse/collapsed/onToggleCollapse (👁), maxWidth, titleFontSize (default 36). Pair with useShelfTitle for DB-persisted titles.',
    recommendations: 'Reuse it for any new section; spread useShelfTitle(key, fallback) into it for an admin-editable, DB-saved title.' }),
  item({ name: 'Registry search bar', uses: 1, kind: 'component', createdAt: '2026-07-17T15:30:00Z',
    location: 'components/views/DashboardView.tsx (🧱 Components search) + app/api/dashboard/registry-search',
    description: 'Search bar on the 🧱 Components table: instant substring filtering across every column, plus an ✨ AI-search toggle where the admin describes what they need in plain words and the AI keeps only the matching rows.',
    inputs: 'Free-text query field (live substring filter; in AI mode Enter submits), ✨ AI-search on/off toggle, 🤖 Ask AI button, ✕ clear. AI mode POSTs { query, rows } to /api/dashboard/registry-search and keeps the returned row ids.',
    recommendations: 'Generalize it into a prop on PagedTable so every dashboard table gets plain + AI search for free.' }),
  item({ name: 'Owner controls panel', uses: 1, kind: 'container', createdAt: '2026-07-17T08:10:00Z',
    location: 'components/tools/RepoView.tsx (OWNER CONTROLS dashed box)',
    description: 'Dashed panel grouping a repository’s owner/admin toggles (assignment, emoji approval, study path, uploads, dates…).',
    inputs: 'On/off toggle buttons: 🏷️ Assignment, ✅ Emoji approval, 🎬 Study path, 📎 Moderator upload, 📁 User upload, 🤖 AI question, 🖼️ Card picture, 📄 File upload, 👁 Dates. Each persists to the repo’s settings.',
    recommendations: 'Consider a schema-driven toggle list so new switches are one-line additions.' }),
  item({ name: 'Study-path command center', uses: 1, kind: 'container', createdAt: '2026-07-17T08:10:00Z',
    location: 'components/tools/RepoView.tsx (🎬 STUDY-PATH COMMAND CENTER)',
    description: 'Dashed box to pick the slide tool that 🔵 prompt cards open, with a searchable tool dropdown and an “open” shortcut.',
    inputs: 'Searchable tool dropdown (choose the slide tool 🔵 cards open), create-tool controls (difficulty, slide count, text length), an AI-build option, and an “open” shortcut button.',
    recommendations: 'Support a per-card tool override; badge private/unlisted tools in the picker.' }),
  item({ name: 'Authorized-users box', uses: 1, kind: 'container', createdAt: '2026-07-17T08:10:00Z',
    location: 'components/tools/RepoView.tsx (👥 Authorized users dashed box)',
    description: 'Dashed box listing usernames that bypass a card’s 🔒 paywall, with an add/remove picker.',
    inputs: 'Username picker (choose a user to authorize), ＋ add button, ✕ remove per listed user.',
    recommendations: 'Add group/role support so whole cohorts can be authorized at once.' }),
  item({ name: 'Slide-tool command center', uses: 1, kind: 'container', createdAt: '2026-07-17T08:45:00Z',
    location: 'components/tools/LessonPlayer.tsx (🎛 SLIDE-TOOL COMMAND CENTER)',
    description: 'Owner panel on the lesson hub: a study-source/AI-guidance field (persisted to lesson.style) + a link to full tool settings.',
    inputs: 'Study-source / AI-guidance text field (persisted to lesson.style on save), link/button to the full tool settings page.',
    recommendations: 'Add real file-upload attachments feeding extracted text into generation.' }),
  item({ name: 'PagedTable', uses: 12, kind: 'component', createdAt: '2026-07-17T09:20:00Z',
    location: 'components/views/DashboardView.tsx (PagedTable)',
    description: 'A paginated table (4 rows/page) that clips long cells to 100 chars with an 👁 popup for the full text.',
    inputs: 'Props: headers, rows (strings or { node } cells), rowIds, onDelete, empty. UI inputs: ‹ Prev / Next › pager, 👁 full-text popup on clipped cells, 🗑 per-row delete.',
    recommendations: 'Extract to components/ui/ so non-dashboard views can reuse it; make rows-per-page a prop.' }),
  item({ name: 'MiniChart', uses: 8, kind: 'component', createdAt: '2026-07-16T00:00:00Z',
    location: 'components/ui/MiniChart.tsx',
    description: 'Inline-SVG bar / hbar / donut / line chart with a categorical palette — no external chart library, no API cost.',
    inputs: 'Props: type (bar | hbar | donut | line), data as [{ label, value }], title, unit (optional suffix like % or $).',
    recommendations: 'Add a bubble/scatter type and optional value labels for small datasets.' }),
  item({ name: 'Page-text editor', uses: 1, kind: 'container', createdAt: '2026-07-17T10:30:00Z',
    location: 'components/views/DashboardView.tsx (📝 Page text)',
    description: 'Dashboard table editing each landing page’s banner title/subtitle, discussion heading and cards-per-page, saved to site_settings.',
    inputs: 'Per-row ✎ edit popup with a text input (banner title, subtitle, discussion heading) or bounded number input (cards-per-page, 1–60) for every PAGE_FIELDS entry; Save writes the key to site_settings.',
    recommendations: 'Add live preview of the page as fields change.' }),
  item({ name: 'Activity table', uses: 1, kind: 'component', createdAt: '2026-07-17T13:00:00Z',
    location: 'components/views/DashboardView.tsx (🕘 Activity) + src/db/activity.js',
    description: 'Audit trail of navigation and saved setting changes (who, what, before→after), backed by the activity_log DB table.',
    inputs: 'Read-only — no form inputs; rows stream from activity_log. UI inputs: ⬇ CSV export button, 🗑 per-row delete, pager.',
    recommendations: 'Add per-user + per-action filters and a date-range picker.' }),
];

module.exports = { COMPONENT_REGISTRY };
