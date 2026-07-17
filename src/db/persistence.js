/* File-storage layer + DB schema init.
 *
 * DATA_DIR / GEN_DIR / canPersistFiles are resolved at boot and can change
 * (we fall back to /tmp if the project dir is read-only), so they live on a
 * mutable holder (`fsState`) that every reader consults. */
const fs = require('fs');
const path = require('path');
const { ROOT_DIR } = require('../config');
const { db, dbQuery } = require('./pool');

const fsState = {
  DATA_DIR: path.join(ROOT_DIR, 'data'),
  GEN_DIR: path.join(ROOT_DIR, 'data', 'generated'),
  canPersistFiles: true
};

function ensureDataDirs() {
  const candidates = [
    path.join(ROOT_DIR, 'data'),
    path.join('/tmp', 'sketchlearn-data')
  ];
  for (const dir of candidates) {
    try {
      const gen = path.join(dir, 'generated');
      fs.mkdirSync(gen, { recursive: true });
      fsState.DATA_DIR = dir;
      fsState.GEN_DIR = gen;
      return;
    } catch {
      // try the next candidate
    }
  }
  fsState.canPersistFiles = false;
}

// ---------- JSON file storage ----------
function readJSON(file, fallback) {
  if (!fsState.canPersistFiles) return fallback;
  try { return JSON.parse(fs.readFileSync(path.join(fsState.DATA_DIR, file), 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  if (!fsState.canPersistFiles) return;
  fs.writeFileSync(path.join(fsState.DATA_DIR, file), JSON.stringify(data, null, 2));
}

async function initDatabase() {
  if (!db.pool) return;
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      share_id TEXT UNIQUE NOT NULL,
      share_url TEXT,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      finished_at TIMESTAMPTZ NOT NULL,
      finished_date TEXT,
      finished_time TEXT,
      topic TEXT,
      concept TEXT,
      level TEXT,
      settings JSONB,
      slides JSONB,
      correct INTEGER,
      total INTEGER,
      duration_sec INTEGER,
      recommendations JSONB,
      question_summary JSONB,
      answer_summary JSONB,
      ai_notes JSONB
    )
  `);
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_games_username_finished_at ON games(username, finished_at DESC)');
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS suggested_topics_cache (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      pair JSONB NOT NULL,
      cursor INTEGER NOT NULL DEFAULT 0,
      last_shown_topic TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      trigger_topic TEXT
    )
  `);
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS home_topics_cache (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      topics JSONB NOT NULL,
      cursor INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      trigger_topic TEXT
    )
  `);

  // ---------- platform: user-built tools ----------
  // A published Tool Definition: the archetype + the JSON spec (settings schema,
  // prompt, chosen components, connectors) that the runtime interprets. This is
  // the core of the general-purpose tool maker.
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      owner TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      archetype TEXT NOT NULL,
      definition JSONB NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      tags JSONB,
      thumbnail TEXT,
      repo_last_edited TIMESTAMPTZ,
      repo_image_url TEXT,
      repo_image_title TEXT,
      repo_image_kind TEXT,
      like_count INTEGER NOT NULL DEFAULT 0,
      ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_tools_visibility_updated ON tools(visibility, updated_at DESC)');
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_tools_owner ON tools(owner)');
  // Owner-supplied API keys, added later via the tool's settings page. Kept out of
  // every public read; only the owner-only settings endpoint returns them.
  await dbQuery('ALTER TABLE tools ADD COLUMN IF NOT EXISTS api_keys JSONB');
  // Per-user like attribution (who liked each tool) — powers the "liked by admin"
  // gallery filter. Kept alongside the like_count for the visible tally.
  await dbQuery(`ALTER TABLE tools ADD COLUMN IF NOT EXISTS liked_by JSONB DEFAULT '[]'::jsonb`);
  await dbQuery('ALTER TABLE tools ADD COLUMN IF NOT EXISTS repo_last_edited TIMESTAMPTZ');
  await dbQuery('ALTER TABLE tools ADD COLUMN IF NOT EXISTS repo_image_url TEXT');
  await dbQuery('ALTER TABLE tools ADD COLUMN IF NOT EXISTS repo_image_title TEXT');
  await dbQuery('ALTER TABLE tools ADD COLUMN IF NOT EXISTS repo_image_kind TEXT');

  // ---------- site settings: small admin-editable key/value store (page copy) ----------
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ---------- per-user preferences (e.g. a page's saved sort order) ----------
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS user_prefs (
      username TEXT PRIMARY KEY,
      prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ---------- platform: generic entry store ----------
  // Rows created BY a tool at runtime (storage-system items, journal notes,
  // calendar events, contest/payment submissions...). `data` is schema-shaped
  // per tool; `status` supports review-queue state machines (pending/approved).
  // NOTE: tool_id is intentionally NOT a foreign key. Entries may belong to a
  // VIRTUAL built-in tool (the example/admin lessons like "Language Learning")
  // that has no row in `tools`; a FK would reject those inserts and the run
  // would silently vanish. Orphan cleanup on real-tool deletion is done in app
  // code (deleteTool) instead of via ON DELETE CASCADE.
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      username TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Existing databases created with the old foreign key: drop it so virtual-tool
  // entries persist. The constraint name is Postgres's default for this column.
  await dbQuery('ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_tool_id_fkey');
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_entries_tool_created ON entries(tool_id, created_at DESC)');

  // ---------- platform: feed posts (Twitter-style micro-posts) ----------
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'text',
      title TEXT,
      body TEXT NOT NULL,
      image TEXT,
      like_count INTEGER NOT NULL DEFAULT 0,
      ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)');

  // ---------- platform: comments (on tools + feed posts) ----------
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at DESC)');
  // Threaded comments with attachments + likes (added incrementally so existing
  // deployments upgrade cleanly).
  await dbQuery("ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id TEXT");
  await dbQuery("ALTER TABLE comments ADD COLUMN IF NOT EXISTS links JSONB");
  await dbQuery("ALTER TABLE comments ADD COLUMN IF NOT EXISTS liked_by JSONB");
  // AI usage / token-consumption log — one row per generation (slide, image,
  // design, suggestion…). Powers the dashboard's per-user cost / profitability
  // tables. Estimated token counts + cost (real rates vary by provider).
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id TEXT PRIMARY KEY,
      username TEXT,
      kind TEXT,
      provider TEXT,
      model TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      subject TEXT,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(username, created_at DESC)');

  // activity_log — a trail of navigation + setting/preset changes across the app,
  // shown as the dashboard's Activity table. `detail` holds the specifics
  // (old→new value, filter chosen, tab opened…).
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      username TEXT,
      action TEXT,
      target TEXT,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await dbQuery('CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC)');

  // tts_cache — text-to-speech audio keyed by a hash of (voice + text), so the
  // SAME line spoken again (e.g. replaying/reviewing a saved lesson) is served
  // from here for free instead of re-calling ElevenLabs. `audio` is a blob URL
  // when the blob store is configured, otherwise a data URL.
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS tts_cache (
      key TEXT PRIMARY KEY,
      audio TEXT NOT NULL,
      voice TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// Persist every AI generation to a JSON file, as the site's content source of record.
function saveGeneration(kind, id, payload) {
  try {
    const dir = path.join(fsState.GEN_DIR, kind);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(payload, null, 2));
  } catch (e) { console.error('Could not save generation:', e.message); }
}

module.exports = { fsState, ensureDataDirs, readJSON, writeJSON, initDatabase, saveGeneration };
