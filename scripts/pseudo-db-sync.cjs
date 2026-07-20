#!/usr/bin/env node
/*
 * Sync utility between Postgres and local JSON pseudo-DB files.
 *
 * Usage:
 *   node scripts/pseudo-db-sync.cjs pull   # DB -> data/*.json
 *   node scripts/pseudo-db-sync.cjs push   # data/*.json -> DB
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const statusFile = path.join(dataDir, 'pseudo_db_sync_status.json');
const mode = String(process.argv[2] || '').toLowerCase();
const replaceMode = process.argv.includes('--replace');

const conn =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SKETCHDB_DATABASE_URL ||
  process.env.SKETCHDB_URL ||
  '';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2));
}

function writeStatus(patch) {
  ensureDataDir();
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch { /* first write */ }
  const next = { ...cur, ...patch };
  fs.writeFileSync(statusFile, JSON.stringify(next, null, 2));
}

function iso(v, fallbackNow = false) {
  if (!v) return fallbackNow ? new Date().toISOString() : null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? (fallbackNow ? new Date().toISOString() : null) : d.toISOString();
}

async function pull(pool) {
  ensureDataDir();

  const users = (await pool.query('SELECT username, salt, password_hash, role, created_at FROM users ORDER BY created_at ASC')).rows.map((r) => ({
    username: r.username,
    salt: r.salt,
    passwordHash: r.password_hash,
    role: r.role,
    createdAt: iso(r.created_at, true),
  }));
  writeJson('users.json', users);

  const games = (await pool.query('SELECT * FROM games ORDER BY finished_at ASC')).rows.map((r) => ({
    id: r.id,
    shareId: r.share_id,
    shareUrl: r.share_url,
    username: r.username,
    finishedAt: iso(r.finished_at, true),
    finishedDate: r.finished_date,
    finishedTime: r.finished_time,
    topic: r.topic,
    concept: r.concept,
    level: r.level,
    settings: r.settings,
    slides: r.slides,
    correct: r.correct,
    total: r.total,
    durationSec: r.duration_sec,
    recommendations: r.recommendations,
    questionSummary: r.question_summary,
    answerSummary: r.answer_summary,
    aiNotes: r.ai_notes,
  }));
  writeJson('games.json', games);

  const suggestedRows = (await pool.query('SELECT username, pair, cursor, last_shown_topic, updated_at, trigger_topic FROM suggested_topics_cache')).rows;
  const suggested = { defaults: readJson('suggested_topics.json', { defaults: [], users: {} }).defaults || [], users: {} };
  for (const r of suggestedRows) {
    suggested.users[r.username] = {
      pair: Array.isArray(r.pair) ? r.pair : [],
      cursor: Number.isInteger(r.cursor) ? r.cursor : 0,
      lastShownTopic: r.last_shown_topic || null,
      updatedAt: iso(r.updated_at, true),
      triggerTopic: r.trigger_topic || null,
    };
  }
  writeJson('suggested_topics.json', suggested);

  const homeRows = (await pool.query('SELECT username, topics, cursor, updated_at, trigger_topic FROM home_topics_cache')).rows;
  const home = { defaults: readJson('home_topics.json', { defaults: [], users: {} }).defaults || [], users: {} };
  for (const r of homeRows) {
    home.users[r.username] = {
      topics: Array.isArray(r.topics) ? r.topics : [],
      cursor: Number.isInteger(r.cursor) ? r.cursor : 0,
      updatedAt: iso(r.updated_at, true),
      triggerTopic: r.trigger_topic || null,
    };
  }
  writeJson('home_topics.json', home);

  const tools = (await pool.query('SELECT * FROM tools ORDER BY updated_at DESC')).rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    owner: r.owner,
    title: r.title,
    description: r.description,
    archetype: r.archetype,
    definition: r.definition,
    visibility: r.visibility,
    tags: Array.isArray(r.tags) ? r.tags : [],
    thumbnail: r.thumbnail,
    repoLastEdited: iso(r.repo_last_edited),
    repoImageUrl: r.repo_image_url || '',
    repoImageTitle: r.repo_image_title || '',
    repoImageKind: r.repo_image_kind || '',
    likeCount: Number(r.like_count) || 0,
    likedBy: Array.isArray(r.liked_by) ? r.liked_by : [],
    aiGenerated: !!r.ai_generated,
    apiKeys: r.api_keys && typeof r.api_keys === 'object' ? r.api_keys : undefined,
    createdAt: iso(r.created_at, true),
    updatedAt: iso(r.updated_at, true),
  }));
  writeJson('tools.json', tools);

  const entries = (await pool.query('SELECT * FROM entries ORDER BY created_at ASC')).rows.map((r) => ({
    id: r.id,
    toolId: r.tool_id,
    username: r.username,
    status: r.status,
    data: r.data,
    createdAt: iso(r.created_at, true),
    updatedAt: iso(r.updated_at, true),
  }));
  writeJson('entries.json', entries);

  const posts = (await pool.query('SELECT * FROM posts ORDER BY created_at ASC')).rows.map((r) => ({
    id: r.id,
    author: r.author,
    kind: r.kind,
    title: r.title,
    body: r.body,
    image: r.image,
    likeCount: Number(r.like_count) || 0,
    aiGenerated: !!r.ai_generated,
    createdAt: iso(r.created_at, true),
  }));
  writeJson('posts.json', posts);

  const comments = (await pool.query('SELECT * FROM comments ORDER BY created_at ASC')).rows.map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    author: r.author,
    body: r.body,
    aiGenerated: !!r.ai_generated,
    parentId: r.parent_id || null,
    links: Array.isArray(r.links) ? r.links : [],
    likedBy: Array.isArray(r.liked_by) ? r.liked_by : [],
    createdAt: iso(r.created_at, true),
  }));
  writeJson('comments.json', comments);

  const siteRows = (await pool.query('SELECT key, value FROM site_settings')).rows;
  const site = {};
  for (const r of siteRows) site[r.key] = r.value;
  writeJson('site_settings.json', site);

  const prefsRows = (await pool.query('SELECT username, prefs FROM user_prefs')).rows;
  const prefs = {};
  for (const r of prefsRows) prefs[r.username] = r.prefs && typeof r.prefs === 'object' ? r.prefs : {};
  writeJson('user_prefs.json', prefs);

  const usage = (await pool.query('SELECT * FROM ai_usage ORDER BY created_at ASC')).rows.map((r) => ({
    id: r.id,
    username: r.username,
    kind: r.kind,
    provider: r.provider,
    model: r.model,
    promptTokens: Number(r.prompt_tokens) || 0,
    completionTokens: Number(r.completion_tokens) || 0,
    totalTokens: Number(r.total_tokens) || 0,
    costUsd: Number(r.cost_usd) || 0,
    subject: r.subject,
    meta: r.meta && typeof r.meta === 'object' ? r.meta : {},
    createdAt: iso(r.created_at, true),
  }));
  writeJson('usage.json', usage);

  const activity = (await pool.query('SELECT * FROM activity_log ORDER BY created_at ASC')).rows.map((r) => ({
    id: r.id,
    username: r.username,
    action: r.action,
    target: r.target,
    detail: r.detail && typeof r.detail === 'object' ? r.detail : {},
    createdAt: iso(r.created_at, true),
  }));
  writeJson('activity.json', activity);

  const ttsRows = (await pool.query('SELECT key, audio, voice, created_at FROM tts_cache')).rows;
  const tts = {};
  for (const r of ttsRows) tts[r.key] = { audio: r.audio, voice: r.voice || '', createdAt: iso(r.created_at, true) };
  writeJson('tts_cache.json', tts);

  const tokenRows = (await pool.query('SELECT username, balance FROM user_tokens')).rows;
  const tokens = {};
  for (const r of tokenRows) tokens[r.username] = Number(r.balance) || 0;
  writeJson('user_tokens.json', tokens);

  const couponRows = (await pool.query('SELECT code, credits, image, created_by, created_at, redeemed_by, redeemed_at FROM coupons ORDER BY created_at ASC')).rows;
  const coupons = {};
  for (const r of couponRows) {
    coupons[r.code] = {
      code: r.code,
      credits: Number(r.credits) || 0,
      image: r.image || '',
      createdBy: r.created_by || '',
      createdAt: iso(r.created_at, true),
      redeemedBy: r.redeemed_by || null,
      redeemedAt: iso(r.redeemed_at),
    };
  }
  writeJson('coupons.json', coupons);

  console.log('Pseudo-DB pull complete: Postgres -> data/*.json');
}

async function push(pool) {
  const keep = {
    users: new Set(), games: new Set(), tools: new Set(), entries: new Set(), posts: new Set(), comments: new Set(),
    site: new Set(), prefs: new Set(), usage: new Set(), activity: new Set(), tts: new Set(), tokens: new Set(), coupons: new Set(),
    suggested: new Set(), home: new Set(),
  };

  const users = readJson('users.json', []);
  for (const u of users) {
    keep.users.add(String(u.username || ''));
    await pool.query(
      `INSERT INTO users (username, salt, password_hash, role, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (username) DO UPDATE SET
       salt = EXCLUDED.salt,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       created_at = EXCLUDED.created_at`,
      [u.username, u.salt, u.passwordHash, u.role, iso(u.createdAt, true)]
    );
  }

  const games = readJson('games.json', []);
  for (const g of games) {
    keep.games.add(String(g.id || ''));
    await pool.query(
      `INSERT INTO games (
        id, share_id, share_url, username, finished_at, finished_date, finished_time,
        topic, concept, level, settings, slides, correct, total, duration_sec,
        recommendations, question_summary, answer_summary, ai_notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,
        $16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        share_id = EXCLUDED.share_id,
        share_url = EXCLUDED.share_url,
        username = EXCLUDED.username,
        finished_at = EXCLUDED.finished_at,
        finished_date = EXCLUDED.finished_date,
        finished_time = EXCLUDED.finished_time,
        topic = EXCLUDED.topic,
        concept = EXCLUDED.concept,
        level = EXCLUDED.level,
        settings = EXCLUDED.settings,
        slides = EXCLUDED.slides,
        correct = EXCLUDED.correct,
        total = EXCLUDED.total,
        duration_sec = EXCLUDED.duration_sec,
        recommendations = EXCLUDED.recommendations,
        question_summary = EXCLUDED.question_summary,
        answer_summary = EXCLUDED.answer_summary,
        ai_notes = EXCLUDED.ai_notes`,
      [
        g.id, g.shareId, g.shareUrl || null, g.username, iso(g.finishedAt, true), g.finishedDate || null, g.finishedTime || null,
        g.topic || null, g.concept || null, g.level || null,
        JSON.stringify(g.settings || null), JSON.stringify(g.slides || null),
        Number.isFinite(g.correct) ? g.correct : null,
        Number.isFinite(g.total) ? g.total : null,
        Number.isFinite(g.durationSec) ? g.durationSec : null,
        JSON.stringify(g.recommendations || null), JSON.stringify(g.questionSummary || null), JSON.stringify(g.answerSummary || null), JSON.stringify(g.aiNotes || null),
      ]
    );
  }

  const suggested = readJson('suggested_topics.json', { users: {} });
  for (const [username, entry] of Object.entries(suggested.users || {})) {
    keep.suggested.add(String(username || ''));
    await pool.query(
      `INSERT INTO suggested_topics_cache (username, pair, cursor, last_shown_topic, updated_at, trigger_topic)
       VALUES ($1,$2::jsonb,$3,$4,$5,$6)
       ON CONFLICT (username) DO UPDATE SET
         pair = EXCLUDED.pair,
         cursor = EXCLUDED.cursor,
         last_shown_topic = EXCLUDED.last_shown_topic,
         updated_at = EXCLUDED.updated_at,
         trigger_topic = EXCLUDED.trigger_topic`,
      [
        username,
        JSON.stringify(Array.isArray(entry.pair) ? entry.pair : []),
        Number.isInteger(entry.cursor) ? entry.cursor : 0,
        entry.lastShownTopic || null,
        iso(entry.updatedAt, true),
        entry.triggerTopic || null,
      ]
    );
  }

  const home = readJson('home_topics.json', { users: {} });
  for (const [username, entry] of Object.entries(home.users || {})) {
    keep.home.add(String(username || ''));
    await pool.query(
      `INSERT INTO home_topics_cache (username, topics, cursor, updated_at, trigger_topic)
       VALUES ($1,$2::jsonb,$3,$4,$5)
       ON CONFLICT (username) DO UPDATE SET
         topics = EXCLUDED.topics,
         cursor = EXCLUDED.cursor,
         updated_at = EXCLUDED.updated_at,
         trigger_topic = EXCLUDED.trigger_topic`,
      [
        username,
        JSON.stringify(Array.isArray(entry.topics) ? entry.topics : []),
        Number.isInteger(entry.cursor) ? entry.cursor : 0,
        iso(entry.updatedAt, true),
        entry.triggerTopic || null,
      ]
    );
  }

  const tools = readJson('tools.json', []);
  for (const t of tools) {
    keep.tools.add(String(t.slug || ''));
    await pool.query(
      `INSERT INTO tools (
        id, slug, owner, title, description, archetype, definition, visibility,
        tags, thumbnail, repo_last_edited, repo_image_url, repo_image_title,
        repo_image_kind, like_count, liked_by, ai_generated, api_keys, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7::jsonb,$8,
        $9::jsonb,$10,$11,$12,$13,
        $14,$15,$16::jsonb,$17,$18::jsonb,$19,$20
      )
      ON CONFLICT (slug) DO UPDATE SET
        owner = EXCLUDED.owner,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        archetype = EXCLUDED.archetype,
        definition = EXCLUDED.definition,
        visibility = EXCLUDED.visibility,
        tags = EXCLUDED.tags,
        thumbnail = EXCLUDED.thumbnail,
        repo_last_edited = EXCLUDED.repo_last_edited,
        repo_image_url = EXCLUDED.repo_image_url,
        repo_image_title = EXCLUDED.repo_image_title,
        repo_image_kind = EXCLUDED.repo_image_kind,
        like_count = EXCLUDED.like_count,
        liked_by = EXCLUDED.liked_by,
        ai_generated = EXCLUDED.ai_generated,
        api_keys = EXCLUDED.api_keys,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`,
      [
        t.id, t.slug, t.owner, t.title, t.description || '', t.archetype,
        JSON.stringify(t.definition || {}), t.visibility || 'private',
        JSON.stringify(Array.isArray(t.tags) ? t.tags : []), t.thumbnail || null,
        t.repoLastEdited ? iso(t.repoLastEdited) : null,
        t.repoImageUrl || null, t.repoImageTitle || null, t.repoImageKind || null,
        Number(t.likeCount) || 0,
        JSON.stringify(Array.isArray(t.likedBy) ? t.likedBy : []),
        !!t.aiGenerated,
        JSON.stringify(t.apiKeys && typeof t.apiKeys === 'object' ? t.apiKeys : {}),
        iso(t.createdAt, true), iso(t.updatedAt, true),
      ]
    );
  }

  const entries = readJson('entries.json', []);
  for (const e of entries) {
    keep.entries.add(String(e.id || ''));
    await pool.query(
      `INSERT INTO entries (id, tool_id, username, status, data, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         tool_id = EXCLUDED.tool_id,
         username = EXCLUDED.username,
         status = EXCLUDED.status,
         data = EXCLUDED.data,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [e.id, e.toolId, e.username || null, e.status || 'active', JSON.stringify(e.data || {}), iso(e.createdAt, true), iso(e.updatedAt, true)]
    );
  }

  const posts = readJson('posts.json', []);
  for (const p of posts) {
    keep.posts.add(String(p.id || ''));
    await pool.query(
      `INSERT INTO posts (id, author, kind, title, body, image, like_count, ai_generated, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         author = EXCLUDED.author,
         kind = EXCLUDED.kind,
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         image = EXCLUDED.image,
         like_count = EXCLUDED.like_count,
         ai_generated = EXCLUDED.ai_generated,
         created_at = EXCLUDED.created_at`,
      [p.id, p.author, p.kind || 'text', p.title || null, p.body || '', p.image || null, Number(p.likeCount) || 0, !!p.aiGenerated, iso(p.createdAt, true)]
    );
  }

  const comments = readJson('comments.json', []);
  for (const c of comments) {
    keep.comments.add(String(c.id || ''));
    await pool.query(
      `INSERT INTO comments (id, target_type, target_id, author, body, ai_generated, parent_id, links, liked_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
       ON CONFLICT (id) DO UPDATE SET
         target_type = EXCLUDED.target_type,
         target_id = EXCLUDED.target_id,
         author = EXCLUDED.author,
         body = EXCLUDED.body,
         ai_generated = EXCLUDED.ai_generated,
         parent_id = EXCLUDED.parent_id,
         links = EXCLUDED.links,
         liked_by = EXCLUDED.liked_by,
         created_at = EXCLUDED.created_at`,
      [
        c.id, c.targetType, c.targetId, c.author, c.body || '', !!c.aiGenerated,
        c.parentId || null,
        JSON.stringify(Array.isArray(c.links) ? c.links : []),
        JSON.stringify(Array.isArray(c.likedBy) ? c.likedBy : []),
        iso(c.createdAt, true),
      ]
    );
  }

  const siteSettings = readJson('site_settings.json', {});
  for (const [key, value] of Object.entries(siteSettings)) {
    keep.site.add(String(key || ''));
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ($1,$2::jsonb,NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
  }

  const prefs = readJson('user_prefs.json', {});
  for (const [username, value] of Object.entries(prefs)) {
    keep.prefs.add(String(username || ''));
    await pool.query(
      `INSERT INTO user_prefs (username, prefs, updated_at) VALUES ($1,$2::jsonb,NOW())
       ON CONFLICT (username) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = NOW()`,
      [username, JSON.stringify(value || {})]
    );
  }

  const usage = readJson('usage.json', []);
  for (const u of usage) {
    keep.usage.add(String(u.id || ''));
    await pool.query(
      `INSERT INTO ai_usage (id, username, kind, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, subject, meta, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         kind = EXCLUDED.kind,
         provider = EXCLUDED.provider,
         model = EXCLUDED.model,
         prompt_tokens = EXCLUDED.prompt_tokens,
         completion_tokens = EXCLUDED.completion_tokens,
         total_tokens = EXCLUDED.total_tokens,
         cost_usd = EXCLUDED.cost_usd,
         subject = EXCLUDED.subject,
         meta = EXCLUDED.meta,
         created_at = EXCLUDED.created_at`,
      [
        u.id, u.username || null, u.kind || 'text', u.provider || '', u.model || '',
        Number(u.promptTokens) || 0, Number(u.completionTokens) || 0, Number(u.totalTokens) || 0,
        Number(u.costUsd) || 0, u.subject || '', JSON.stringify(u.meta || {}), iso(u.createdAt, true),
      ]
    );
  }

  const activity = readJson('activity.json', []);
  for (const a of activity) {
    keep.activity.add(String(a.id || ''));
    await pool.query(
      `INSERT INTO activity_log (id, username, action, target, detail, created_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         action = EXCLUDED.action,
         target = EXCLUDED.target,
         detail = EXCLUDED.detail,
         created_at = EXCLUDED.created_at`,
      [a.id, a.username || 'anon', a.action || '', a.target || '', JSON.stringify(a.detail || {}), iso(a.createdAt, true)]
    );
  }

  const tts = readJson('tts_cache.json', {});
  for (const [key, v] of Object.entries(tts)) {
    keep.tts.add(String(key || ''));
    await pool.query(
      `INSERT INTO tts_cache (key, audio, voice, created_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (key) DO UPDATE SET
         audio = EXCLUDED.audio,
         voice = EXCLUDED.voice,
         created_at = EXCLUDED.created_at`,
      [key, String(v.audio || ''), String(v.voice || ''), iso(v.createdAt, true)]
    );
  }

  const tokens = readJson('user_tokens.json', {});
  for (const [username, balance] of Object.entries(tokens)) {
    keep.tokens.add(String(username || ''));
    await pool.query(
      `INSERT INTO user_tokens (username, balance, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (username) DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW()`,
      [username, Math.trunc(Number(balance) || 0)]
    );
  }

  const coupons = readJson('coupons.json', {});
  for (const [code, c] of Object.entries(coupons)) {
    keep.coupons.add(String(code || ''));
    await pool.query(
      `INSERT INTO coupons (code, credits, image, created_by, created_at, redeemed_by, redeemed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE SET
         credits = EXCLUDED.credits,
         image = EXCLUDED.image,
         created_by = EXCLUDED.created_by,
         created_at = EXCLUDED.created_at,
         redeemed_by = EXCLUDED.redeemed_by,
         redeemed_at = EXCLUDED.redeemed_at`,
      [
        code,
        Math.trunc(Number(c.credits) || 0),
        c.image || '',
        c.createdBy || '',
        iso(c.createdAt, true),
        c.redeemedBy || null,
        c.redeemedAt ? iso(c.redeemedAt) : null,
      ]
    );
  }

  if (replaceMode) {
    const del = async (table, column, values) => {
      const keepVals = Array.from(values).filter(Boolean);
      if (!keepVals.length) {
        await pool.query(`DELETE FROM ${table}`);
        return;
      }
      await pool.query(`DELETE FROM ${table} WHERE ${column} <> ALL($1::text[])`, [keepVals]);
    };

    await del('users', 'username', keep.users);
    await del('games', 'id', keep.games);
    await del('tools', 'slug', keep.tools);
    await del('entries', 'id', keep.entries);
    await del('posts', 'id', keep.posts);
    await del('comments', 'id', keep.comments);
    await del('site_settings', 'key', keep.site);
    await del('user_prefs', 'username', keep.prefs);
    await del('ai_usage', 'id', keep.usage);
    await del('activity_log', 'id', keep.activity);
    await del('tts_cache', 'key', keep.tts);
    await del('user_tokens', 'username', keep.tokens);
    await del('coupons', 'code', keep.coupons);
    await del('suggested_topics_cache', 'username', keep.suggested);
    await del('home_topics_cache', 'username', keep.home);
    console.log('Replace mode complete: removed DB rows not present in JSON files.');
  }

  console.log('Pseudo-DB push complete: data/*.json -> Postgres');
}

async function main() {
  if (!conn) {
    writeStatus({
      mode,
      replaceMode,
      finishedAt: new Date().toISOString(),
      running: false,
      ok: false,
      error: 'No DATABASE_URL/POSTGRES_URL found in env.',
    });
    fail('No DATABASE_URL/POSTGRES_URL found in env.');
  }
  if (mode !== 'pull' && mode !== 'push') {
    writeStatus({
      mode,
      replaceMode,
      finishedAt: new Date().toISOString(),
      running: false,
      ok: false,
      error: 'Usage: node scripts/pseudo-db-sync.cjs <pull|push> [--replace]',
    });
    fail('Usage: node scripts/pseudo-db-sync.cjs <pull|push> [--replace]');
  }

  const startedAt = new Date();
  writeStatus({
    mode,
    replaceMode,
    startedAt: startedAt.toISOString(),
    running: true,
    ok: null,
    error: '',
  });

  const pool = new Pool({
    connectionString: conn,
    ssl: /localhost|127\.0\.0\.1/.test(conn) ? false : { rejectUnauthorized: false },
  });

  try {
    if (mode === 'pull') await pull(pool);
    else await push(pool);
    writeStatus({
      mode,
      replaceMode,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      running: false,
      ok: true,
      error: '',
    });
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  writeStatus({
    mode,
    replaceMode,
    finishedAt: new Date().toISOString(),
    running: false,
    ok: false,
    error: e && e.message ? e.message : String(e),
  });
  console.error('Pseudo-DB sync failed:', e && e.message ? e.message : e);
  process.exit(1);
});
