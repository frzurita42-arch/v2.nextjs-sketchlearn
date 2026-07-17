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
  item({ name: 'CoffeeMugLink', uses: 1, kind: 'container', createdAt: '2026-07-17T19:30:00Z',
    location: 'components/ui/BannerLinks.tsx (CoffeeMugLink)',
    description: 'The ☕ "Buy me a coffee" donations link that sits big in the free space on the RIGHT of the Repositories banner (via PageHeader’s right slot), vertically centered beside the title. A hand-drawn coffee-mug SVG (shared DonationMug) over a small caption, linking to a support page. Draws in the notebook sketch style so it matches the page rhythm. Shown on tablets & desktop only — hidden on phone screens (< 640px) so the centered title keeps the full width.',
    inputs: 'Props: href (donation URL, default ko-fi), label (default “Donate”), width, height. UI input: click → opens the support page in a new tab.',
    recommendations: 'Wire href to a per-site donation setting; add a hover coin/steam animation.' }),
  item({ name: 'PaperPlaneLink', uses: 1, kind: 'container', createdAt: '2026-07-17T19:30:00Z',
    location: 'components/ui/BannerLinks.tsx (PaperPlaneLink)',
    description: 'The ✈ "Share / tell a friend" link that sits big in the free space on the RIGHT of the Slides banner (via PageHeader’s right slot), vertically centered beside the title. A hand-drawn paper-airplane SVG over a small caption; by default a mailto share so it works with no backend. A banner-corner object tuned to the same sketch rhythm as the coffee mug. Shown on tablets & desktop only — hidden on phone screens (< 640px).',
    inputs: 'Props: href (share target, default a mailto: share), label (default “Share”), width, height. UI input: click → opens the share link (email composer by default).',
    recommendations: 'Swap the mailto for a native share sheet (navigator.share) on mobile; offer copy-link.' }),
  item({ name: 'OutlineBox', uses: 4, kind: 'container', createdAt: '2026-07-17T18:30:00Z',
    location: 'components/ui/OutlineBox.tsx',
    description: 'A labelled dashed panel that groups a row of related controls — a dashed border, a small centered small-caps caption at the top, and its children wrapping in a centered flex row. Generalizes the repo “OWNER CONTROLS” look. Reused for the gallery “FILTERS & DISPLAY” toolbars (Repositories & Slides pages, via Collection), the dashboard “SECTIONS” picker, and the repo OWNER CONTROLS toggles.',
    inputs: 'Props: title (the small-caps caption; omit for an unlabelled box), children (the controls), maxWidth (default 1000), style. No inputs of its own — it is a layout wrapper; the grouped buttons/inputs are the children.',
    recommendations: 'Reuse it for any new grouped-control strip; consider a collapsible variant with a 👁 toggle like the command center.' }),
  item({ name: 'GallerySection', uses: 6, kind: 'container', createdAt: '2026-07-17T20:00:00Z',
    location: 'components/ui/GallerySection.tsx',
    description: 'The ONE reusable titled + banner’d + filterable GALLERY block — the whole card-gallery unit used by the Repositories page, the Slides page, the repo “🗂️ Cards” collection, the tools gallery, and the history/collection shelves. It stitches together the three stacked containers (editable section header, how-to banner, then the Collection with its FILTERS & DISPLAY toolbar and the cards). Search here for “gallery”, “cards”, “collection”, “slides”, “repositories”, “history”.',
    inputs: 'Props: titleKey + titleFallback (the editable section title, e.g. “🗂️ Cards”), bannerKey + bannerDefault (the how-to banner text), plus all the Collection data props (items, favs, likedByAdmin, likedByOwner, renderGrid/renderRow, perPage, gridMinPx…). Admin inputs come from the SectionHeader (✎/🎨/🔄/👁) and the Collection toolbar.',
    recommendations: 'Reuse it for any new titled, filterable card gallery — one titleKey + bannerKey and the Collection data props.' }),
  item({ name: 'Gallery header + banner container', uses: 6, kind: 'container', createdAt: '2026-07-17T19:00:00Z',
    location: 'components/ui/Collection.tsx (section aria-label="Section header and banner")',
    description: 'The first of the gallery’s three stacked containers: the section title row (SectionHeader — ✎ edit · 🎨 AI-reword · 🔄 shuffle · 👁 collapse) together with the how-to banner beneath it, closed off by a dashed rule. One instance per Collection, so it renders on the Repositories & Slides galleries, the repo Cards collection, the tools gallery and every other Collection.',
    inputs: 'Driven by Collection props: title/titleKey, banner/bannerKey, canEditTitle, onRenameTitle, onRemixTitle, showCollapse/collapsed. No direct inputs — the SectionHeader controls (✎/🎨/🔄/👁) are its inputs.',
    recommendations: 'Extract as a standalone <SectionHeaderBanner> if a page needs the header+banner unit without the rest of the gallery.' }),
  item({ name: 'Gallery filters container', uses: 6, kind: 'container', createdAt: '2026-07-17T19:00:00Z',
    location: 'components/ui/Collection.tsx (section aria-label="Filters and display controls")',
    description: 'The gallery’s middle container (a.k.a. section-repo-filters): the FILTERS & DISPLAY OutlineBox (search, All/★/🛡️/OP status filters, sort, grid ▦ / rows ☰ toggle, 🔒 lock), any belowToolbar row (⊕/⊖ collapse-all, sort, ＋ New card, category chips) and the item count, closed by a dashed rule right before the cards. One instance per Collection (Repos, Slides, repo Cards, tools gallery…).',
    inputs: 'Search field, All / ★ Favorites / 🛡️ Admin / OP status filters, sort toggle, ▦/☰ display toggle, 🔒 lock, plus the belowToolbar controls. Driven by Collection props (favs, likedByAdmin, likedByOwner, canLockView, belowToolbar, extra…).',
    recommendations: 'Reuse for any filterable list; consider persisting the chosen filter/sort per user.' }),
  item({ name: 'Gallery cards container', uses: 6, kind: 'container', createdAt: '2026-07-17T19:00:00Z',
    location: 'components/ui/Collection.tsx (section aria-label="Cards")',
    description: 'The gallery’s final container (a.k.a. section-repo-nested-cards): the grid ▦ / rows ☰ of items themselves — including the repo’s nested cards with the “Read more ↓ / Read less ↑” reveal — plus the ← Prev / Next → pager when paginated. One instance per Collection, so the same container renders the Repositories, Slides and repo card trees with different items.',
    inputs: 'Renders items via Collection’s renderGrid / renderRow. UI inputs: tap a card to open it, ← Prev / Next → pager (when perPage set), and the repo “Read more / Read less” reveal.',
    recommendations: 'Add optional masonry layout; virtualize very large card trees.' }),
  item({ name: 'DiscussionSection', uses: 3, kind: 'container', createdAt: '2026-07-17T17:00:00Z',
    location: 'components/social/DiscussionSection.tsx',
    description: 'The ONE container for a page’s discussion area: an editable title (✎ / 🎨 / 👁 via the shared SectionHeader + useShelfTitle) directly above the reusable CommentSection, closing with a dashed rule. Used on the Repos & Slides galleries and every tool page.',
    inputs: 'Props: titleKey (site_settings key for the title), titleFallback, collapseKey (👁 hide-from-users flag; omit to always show), targetType (tool | post), targetId (comment thread id), maxWidth. Admin inputs come from SectionHeader: ✎ rename, 🎨 AI-reword, 👁 hide.',
    recommendations: 'Reuse it wherever comments belong; consider per-tool (owner-level) hide flags next.' }),
  item({ name: 'CommentSection', uses: 3, kind: 'component', createdAt: '2026-07-17T17:00:00Z',
    location: 'components/social/CommentSection.tsx',
    description: 'Threaded comments styled like repo cards: avatar CardShell per comment, ❤️ likes, date stamp, 📎 poster & 📁 user attachments, nested replies, author/admin delete. Rendered inside DiscussionSection on the galleries and tool pages.',
    inputs: 'Props: targetType (tool | post) and targetId (which thread to load). UI inputs: comment text field, 📎 attach, Post button, ❤️ like, ↩ reply, ✘ delete.',
    recommendations: 'Add pagination for long threads and an admin “lock thread” toggle.' }),
  item({ name: 'AuthorBar', uses: 1, kind: 'container', createdAt: '2026-07-17T18:00:00Z',
    location: 'components/social/AuthorBar.tsx',
    description: 'The platform-provided social header card at the top of every tool/repo page: the author’s avatar + @name, a metadata line (created · type · visibility · ✦AI-built), the ❤ like button and the 🔗 Share / QR panel, with an optional slot for owner controls (⚙️ Settings), closing with a dashed rule that marks the end of the container. Tools never build their own author/like/share chrome. Responsive — identity and actions stack into two rows on mobile. (The old ← Tools button was removed; the header navigates back.)',
    inputs: 'Props: owner, meta, liked, likes, onToggleLike, shareSlug, shareTitle, showShare (hide Share on private tools), actions (owner-control slot). UI inputs: 🤍/❤️ like toggle, 🔗 Share / QR button (opens the share panel), optional ⚙️ Settings.',
    recommendations: 'Add a follow/subscribe action; show the author’s role badge (admin/moderator) next to the name.' }),
  item({ name: 'ViewAsBar', uses: 1, kind: 'container', createdAt: '2026-07-17T17:30:00Z',
    location: 'components/ui/ViewAsBar.tsx',
    description: 'The admin “👁 View as” preview container mounted under the header: a single bordered block grouping the role toggles (Guest, User, Moderators, Admin, Languages, STEM) that re-render any page as that kind of viewer would see it — a client-side preview only, the real session and server permissions are unchanged. Closes with a dashed rule so it reads as its own section. Admin-only.',
    inputs: 'Props: viewAs (current preview role), onSetViewAs (setter). UI inputs: 👁 View as role buttons — User, Moderators, Admin (the active one toggles the preview); Guest, Languages and STEM are placeholders (disabled).',
    recommendations: 'Wire up the Guest / Languages / STEM placeholders; persist the last preview role per admin.' }),
  item({ name: 'Registry search bar', uses: 1, kind: 'component', createdAt: '2026-07-17T15:30:00Z',
    location: 'components/views/DashboardView.tsx (🧱 Components search) + app/api/dashboard/registry-search',
    description: 'Search bar on the 🧱 Components table: instant substring filtering across every column, plus an ✨ AI-search toggle where the admin describes what they need in plain words and the AI keeps only the matching rows.',
    inputs: 'Free-text query field (live substring filter; in AI mode Enter submits), ✨ AI-search on/off toggle, 🤖 Ask AI button, ✕ clear. AI mode POSTs { query, rows } to /api/dashboard/registry-search and keeps the returned row ids.',
    recommendations: 'Generalize it into a prop on PagedTable so every dashboard table gets plain + AI search for free.' }),
  item({ name: 'Card settings popup', uses: 1, kind: 'container', createdAt: '2026-07-17T19:00:00Z',
    location: 'components/tools/RepoView.tsx (⚙️ settingsPopup in RepoCollectionCard)',
    description: 'The per-card ⚙️ panel that replaced the pile of moderator icons on repo cards: a paper card with dashed rules and a grid of hoverable tiles — emoji, name, short description, and a green state chip for anything active — paginated 8 per page. Moderator/admin only; user-facing buttons (★, 📋, status chip, 📎/📁 open, 🖼️ view, 🎬) stay on the card.',
    inputs: 'Opened by the ⚙️ icon on each card (canEdit only). Tiles: edit/AI-reword title & description, number/random/upload icon, Moderator link, AI question, card picture, add card (level/inside), hidden, assignment status, emoji approval, paywall, per-card user folder, move up/down, delete. Toggles keep the panel open; ‹ Prev / Next › paginate.',
    recommendations: 'Extract into a reusable <ControlPanel entries={…}> so other card types can adopt it.' }),
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

// Auto-generated searchable keywords (emojis + button/label text + instance
// titles scraped from each component's real usages) so the Components search
// finds a component by anything you saw on a page. Regenerated by
// scripts/scan-component-keywords.cjs (wired into `prebuild`).
let KEYWORDS = {};
try { KEYWORDS = require('./component-keywords.json'); } catch { /* generated at build time */ }
for (const e of COMPONENT_REGISTRY) e.keywords = KEYWORDS[e.id] || '';

module.exports = { COMPONENT_REGISTRY };
