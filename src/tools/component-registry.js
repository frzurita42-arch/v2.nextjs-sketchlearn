/* Component & container registry — a curated catalogue of the reusable UI pieces
 * on the site. Maintained by hand: entries are ADDED or DELETED on request during
 * a build session. Surfaced as the dashboard's "Components" tab.
 *
 * Each entry: what it is, where it lives (file path), a recommendation for using
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
    location: cap(e.location, 160),
    recommendations: cap(e.recommendations),
    createdAt: e.createdAt,
  };
}

const COMPONENT_REGISTRY = [
  item({ name: 'PageHeader', kind: 'container', createdAt: '2026-07-17T14:10:00Z',
    location: 'components/ui/PageHeader.tsx',
    description: 'The reusable DB-driven page header: an optional emoji (👁 to hide, click to change), a scribble-underlined title and subtitle each editable inline (✎) or AI-reworded (🎨), closing with a dashed separator. Drives the Slides, Coach and Dashboard pages via PAGE_HEADERS.',
    recommendations: 'Adopt it on the Repositories page too (retire its inline header); allow a per-page actions slot (e.g. the Coach ⬇ spreadsheet button) as a prop.' }),
  item({ name: 'Owner controls panel', kind: 'container', createdAt: '2026-07-17T08:10:00Z',
    location: 'components/tools/RepoView.tsx (OWNER CONTROLS dashed box)',
    description: 'Dashed panel grouping a repository’s owner/admin toggles (assignment, emoji approval, study path, uploads, dates…).',
    recommendations: 'Consider a schema-driven toggle list so new switches are one-line additions.' }),
  item({ name: 'Study-path command center', kind: 'container', createdAt: '2026-07-17T08:10:00Z',
    location: 'components/tools/RepoView.tsx (🎬 STUDY-PATH COMMAND CENTER)',
    description: 'Dashed box to pick the slide tool that 🔵 prompt cards open, with a searchable tool dropdown and an “open” shortcut.',
    recommendations: 'Support a per-card tool override; badge private/unlisted tools in the picker.' }),
  item({ name: 'Authorized-users box', kind: 'container', createdAt: '2026-07-17T08:10:00Z',
    location: 'components/tools/RepoView.tsx (👥 Authorized users dashed box)',
    description: 'Dashed box listing usernames that bypass a card’s 🔒 paywall, with an add/remove picker.',
    recommendations: 'Add group/role support so whole cohorts can be authorized at once.' }),
  item({ name: 'Slide-tool command center', kind: 'container', createdAt: '2026-07-17T08:45:00Z',
    location: 'components/tools/LessonPlayer.tsx (🎛 SLIDE-TOOL COMMAND CENTER)',
    description: 'Owner panel on the lesson hub: a study-source/AI-guidance field (persisted to lesson.style) + a link to full tool settings.',
    recommendations: 'Add real file-upload attachments feeding extracted text into generation.' }),
  item({ name: 'PagedTable', kind: 'component', createdAt: '2026-07-17T09:20:00Z',
    location: 'components/views/DashboardView.tsx (PagedTable)',
    description: 'A paginated table (4 rows/page) that clips long cells to 100 chars with an 👁 popup for the full text.',
    recommendations: 'Extract to components/ui/ so non-dashboard views can reuse it; make rows-per-page a prop.' }),
  item({ name: 'MiniChart', kind: 'component', createdAt: '2026-07-16T00:00:00Z',
    location: 'components/ui/MiniChart.tsx',
    description: 'Inline-SVG bar / hbar / donut / line chart with a categorical palette — no external chart library, no API cost.',
    recommendations: 'Add a bubble/scatter type and optional value labels for small datasets.' }),
  item({ name: 'Page-text editor', kind: 'container', createdAt: '2026-07-17T10:30:00Z',
    location: 'components/views/DashboardView.tsx (📝 Page text)',
    description: 'Dashboard table editing each landing page’s banner title/subtitle, discussion heading and cards-per-page, saved to site_settings.',
    recommendations: 'Add live preview of the page as fields change.' }),
  item({ name: 'Activity table', kind: 'component', createdAt: '2026-07-17T13:00:00Z',
    location: 'components/views/DashboardView.tsx (🕘 Activity) + src/db/activity.js',
    description: 'Audit trail of navigation and saved setting changes (who, what, before→after), backed by the activity_log DB table.',
    recommendations: 'Add per-user + per-action filters and a date-range picker.' }),
];

module.exports = { COMPONENT_REGISTRY };
