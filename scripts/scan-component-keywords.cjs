#!/usr/bin/env node
/* Auto-index the searchable KEYWORDS for each registered component so the
 * dashboard's 🧱 Components search finds a component by ANY word, button label or
 * emoji that appears in its instances — not just what its description happens to
 * mention. Re-run whenever components change (wired into `prebuild`).
 *
 * For each registry entry it collects human-facing tokens (emojis + button/label
 * text + title/placeholder props) from:
 *   1. the component's own source file (the buttons/emojis it renders), and
 *   2. every <ComponentName …> usage across the app (the props each instance
 *      passes — e.g. title="🗂️ Cards").
 * Title-family literals (title / titleFallback / shelfTitle) are also attached to
 * the canonical SectionHeader entry, since it renders every section title.
 *
 * Output: src/tools/component-keywords.json  { [componentId]: "kw kw kw" } */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { COMPONENT_REGISTRY } = require(path.join(ROOT, 'src/tools/component-registry.js'));

const SRC_DIRS = ['components', 'app'];
const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(f.name))) out.push(p);
  }
  return out;
}
const files = SRC_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const fileText = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));

const EMOJI = /(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*)/gu;
const PROP = /\b(?:title|titleFallback|titleKey|bannerDefault|bannerKey|shelfTitle|label|ownerLabel|ownerTitle|placeholder|aria-label)\s*=\s*["'`]([^"'`\n]{1,80})["'`]/g;
const JSXTEXT = />\s*([^<>{}\n]{1,50})</g;

// Turn a raw candidate string into clean, human-facing tokens (emojis kept whole;
// the worded part kept only when it reads like UI text, not code/CSS/paths).
function collect(text, set) {
  let m;
  const emo = new RegExp(EMOJI);
  while ((m = emo.exec(text))) set.add(m[1]);
  for (const re of [new RegExp(PROP), new RegExp(JSXTEXT)]) {
    while ((m = re.exec(text))) {
      const raw = (m[1] || '').trim();
      if (!raw) continue;
      let e; const er = new RegExp(EMOJI);
      while ((e = er.exec(raw))) set.add(e[1]);
      const worded = raw.replace(EMOJI, ' ').replace(/\s+/g, ' ').trim();
      if (!worded || worded.length > 80) continue;
      if (!/[A-Za-z]/.test(worded)) continue;
      // Skip code-ish / css-ish / path-ish fragments.
      if (/[{}=<>|]|=>|https?:|\.[a-z]{2,4}\b|\/\w|^[a-z][a-z-]*$/.test(worded)) continue;
      // Add the whole short phrase (titles read best whole)…
      if (worded.length <= 40) set.add(worded.toLowerCase());
      // …and, for any phrase, its individual meaningful words, so a banner like
      // "Your saved cards — search by name" is found by "search", "cards", "name".
      for (const w of worded.toLowerCase().split(/[^a-z0-9]+/)) {
        if (w.length >= 4) set.add(w);
      }
    }
  }
}

const TITLE_FAMILY = ['SectionHeader', 'GallerySection', 'Collection', 'Carousel'];
// Only the SECTION-title props (not generic title= tooltips, which are everywhere).
const TITLE_PROP = /\b(?:titleFallback|shelfTitle|titleKey)\s*=\s*["'`]([^"'`\n]{1,60})["'`]/g;

const out = {};
for (const e of COMPONENT_REGISTRY) {
  const set = new Set();
  // 1) the component's own file (path is the part of `location` before any " (").
  const file = path.join(ROOT, String(e.location || '').split(' (')[0].trim());
  if (fileText.has(file)) collect(fileText.get(file), set);
  // 2) every <ComponentName …> usage (single-word PascalCase names only).
  if (/^[A-Z][A-Za-z0-9]+$/.test(e.name)) {
    const tag = new RegExp('<' + e.name + '\\b[^>]*>', 'gs');
    for (const txt of fileText.values()) {
      if (!txt.includes('<' + e.name)) continue;
      let t; const re = new RegExp(tag);
      while ((t = re.exec(txt))) collect(t[0], set);
    }
  }
  out[e.id] = Array.from(set);
}

// Title-family literals (every editable section title + how-to banner across the
// app) → attached to EVERY gallery-related registry entry that renders them, so a
// word from any section's title/banner finds these shared containers. This is the
// "all instance content is searchable" rule for the gallery family.
const TITLE_PROP_WIDE = /\b(?:titleFallback|shelfTitle|titleKey|bannerDefault|bannerKey)\s*=\s*["'`]([^"'`\n]{1,80})["'`]/g;
const galleryNames = ['SectionHeader', 'GallerySection', 'Gallery header + banner container', 'Gallery filters container', 'Gallery cards container'];
const galleryTitleWords = new Set();
for (const txt of fileText.values()) {
  if (!TITLE_FAMILY.some((n) => txt.includes('<' + n))) continue;
  let m; const re = new RegExp(TITLE_PROP_WIDE);
  while ((m = re.exec(txt))) collect('>' + m[1] + '<', galleryTitleWords);
}
for (const name of galleryNames) {
  const entry = COMPONENT_REGISTRY.find((e) => e.name === name);
  if (!entry) continue;
  const set = new Set(out[entry.id] || []);
  for (const w of galleryTitleWords) set.add(w);
  out[entry.id] = Array.from(set);
}

// Serialize as a space-joined keyword string per id (deduped, bounded).
const serialized = {};
for (const [id, arr] of Object.entries(out)) {
  serialized[id] = Array.from(new Set(arr)).join(' ').slice(0, 600);
}
const dest = path.join(ROOT, 'src/tools/component-keywords.json');
fs.writeFileSync(dest, JSON.stringify(serialized, null, 2) + '\n');
console.log(`Wrote ${dest} — ${Object.keys(serialized).length} components indexed.`);
