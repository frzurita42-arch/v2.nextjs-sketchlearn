/* Platform stores for the general-purpose tool maker: published tool definitions,
 * the generic per-tool entry store, and comments. Each mirrors games.js — Postgres
 * when a pool exists, JSON-file fallback otherwise, so nothing is lost when the DB
 * is slow or unset. Key values are never handled here; this is pure persistence. */
const { db, dbQuery, withDbTimeout } = require('./pool');
const { readJSON, writeJSON } = require('./persistence');

// JSONB columns should come back parsed, but some drivers/paths hand back a raw
// string. Coerce defensively so the client always receives real objects/arrays
// (a stray JSON string is what makes `tags.map`/`def.settings` blow up).
function parseJsonb(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}
function asArr(v) { const p = parseJsonb(v, []); return Array.isArray(p) ? p : []; }

// Strip owner-only secrets before returning a tool through any PUBLIC read
// (the file-storage path stores the whole object, incl. apiKeys, on disk).
function stripSecret(t) {
  if (!t) return t;
  const { apiKeys, api_keys, ...rest } = t;
  return rest;
}

// ---------------------------------------------------------------------------
// tools — published Tool Definitions (the spec the runtime interprets)
// ---------------------------------------------------------------------------
function mapToolRow(r) {
  return {
    id: r.id,
    slug: r.slug,
    owner: r.owner,
    title: r.title,
    description: r.description,
    archetype: r.archetype,
    definition: parseJsonb(r.definition, {}),
    visibility: r.visibility,
    tags: asArr(r.tags),
    thumbnail: r.thumbnail,
    likeCount: r.like_count,
    likedBy: asArr(r.liked_by),
    aiGenerated: r.ai_generated,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

function insertToolFile(record) {
  const tools = readJSON('tools.json', []);
  tools.push(record);
  writeJSON('tools.json', tools);
}

async function insertTool(record) {
  if (!db.pool) { insertToolFile(record); return; }
  try {
    await withDbTimeout(dbQuery(
      `INSERT INTO tools (id, slug, owner, title, description, archetype, definition,
         visibility, tags, thumbnail, like_count, ai_generated)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12)`,
      [
        record.id, record.slug, record.owner, record.title, record.description || null,
        record.archetype, JSON.stringify(record.definition || {}), record.visibility || 'private',
        JSON.stringify(record.tags || []), record.thumbnail || null, record.likeCount || 0,
        !!record.aiGenerated,
      ]
    ), 8000, 'Save tool');
  } catch (e) {
    console.error('DB insert for tool failed; saving to file instead:', e.message);
    insertToolFile(record);
  }
}

async function getToolBySlug(slug) {
  if (!db.pool) return stripSecret(readJSON('tools.json', []).find(t => t.slug === slug)) || null;
  try {
    const { rows } = await withDbTimeout(dbQuery('SELECT * FROM tools WHERE slug = $1', [slug]), 8000, 'Get tool');
    return rows[0] ? mapToolRow(rows[0]) : null;
  } catch (e) {
    console.error('DB read for tool failed; falling back to file:', e.message);
    return stripSecret(readJSON('tools.json', []).find(t => t.slug === slug)) || null;
  }
}

// Owner-only read that INCLUDES the stored API keys (never use for public reads).
async function getToolWithKeys(slug) {
  if (!db.pool) {
    const t = readJSON('tools.json', []).find(x => x.slug === slug) || null;
    return t ? { ...t, apiKeys: Array.isArray(t.apiKeys) ? t.apiKeys : [] } : null;
  }
  try {
    const { rows } = await withDbTimeout(dbQuery('SELECT * FROM tools WHERE slug = $1', [slug]), 8000, 'Get tool w/keys');
    if (!rows[0]) return null;
    return { ...mapToolRow(rows[0]), apiKeys: asArr(rows[0].api_keys) };
  } catch (e) {
    console.error('DB read (with keys) failed; file fallback:', e.message);
    const t = readJSON('tools.json', []).find(x => x.slug === slug) || null;
    return t ? { ...t, apiKeys: Array.isArray(t.apiKeys) ? t.apiKeys : [] } : null;
  }
}

// Update a tool's definition / visibility / api keys. Only fields provided change.
async function updateTool(slug, patch) {
  if (!db.pool) {
    const tools = readJSON('tools.json', []);
    const t = tools.find(x => x.slug === slug);
    if (!t) return false;
    if (patch.definition !== undefined) { t.definition = patch.definition; t.title = patch.definition.title || t.title; t.description = patch.definition.description || t.description; t.archetype = patch.definition.archetype || t.archetype; t.tags = patch.definition.tags || t.tags; }
    if (patch.title !== undefined) { t.title = patch.title; if (t.definition) t.definition.title = patch.title; }
    if (patch.description !== undefined) { t.description = patch.description; if (t.definition) t.definition.description = patch.description; }
    if (patch.thumbnail !== undefined) t.thumbnail = patch.thumbnail;
    if (patch.visibility !== undefined) t.visibility = patch.visibility;
    if (patch.apiKeys !== undefined) t.apiKeys = patch.apiKeys;
    t.updatedAt = new Date().toISOString();
    writeJSON('tools.json', tools);
    return true;
  }
  try {
    const sets = []; const vals = []; let i = 1;
    if (patch.definition !== undefined) {
      sets.push(`definition = $${i++}::jsonb`, `title = $${i++}`, `description = $${i++}`, `archetype = $${i++}`, `tags = $${i++}::jsonb`);
      vals.push(JSON.stringify(patch.definition), patch.definition.title || '', patch.definition.description || '', patch.definition.archetype || 'app', JSON.stringify(patch.definition.tags || []));
    }
    if (patch.title !== undefined) { sets.push(`title = $${i++}`); vals.push(patch.title); }
    if (patch.description !== undefined) { sets.push(`description = $${i++}`); vals.push(patch.description); }
    if (patch.thumbnail !== undefined) { sets.push(`thumbnail = $${i++}`); vals.push(patch.thumbnail); }
    if (patch.visibility !== undefined) { sets.push(`visibility = $${i++}`); vals.push(patch.visibility); }
    if (patch.apiKeys !== undefined) { sets.push(`api_keys = $${i++}::jsonb`); vals.push(JSON.stringify(patch.apiKeys)); }
    if (!sets.length) return true;
    sets.push(`updated_at = NOW()`);
    vals.push(slug);
    const { rowCount } = await withDbTimeout(dbQuery(`UPDATE tools SET ${sets.join(', ')} WHERE slug = $${i}`, vals), 8000, 'Update tool');
    return rowCount > 0;
  } catch (e) {
    console.error('DB update tool failed:', e.message);
    return false;
  }
}

// Delete a tool by slug. Entries cascade via the FK; comments are left (harmless).
async function deleteTool(slug) {
  if (!db.pool) {
    const tools = readJSON('tools.json', []);
    const next = tools.filter(t => t.slug !== slug);
    if (next.length === tools.length) return false;
    writeJSON('tools.json', next);
    return true;
  }
  try {
    const { rowCount } = await withDbTimeout(dbQuery('DELETE FROM tools WHERE slug = $1', [slug]), 8000, 'Delete tool');
    return rowCount > 0;
  } catch (e) {
    console.error('DB delete tool failed:', e.message);
    return false;
  }
}

// Adjust a tool's like counter by delta (+1 / -1). Returns the new count or null.
async function setToolLikeDelta(slug, delta, username = null) {
  const d = Math.sign(parseInt(delta, 10) || 0);
  const applyUser = (arr) => {
    const s = new Set(Array.isArray(arr) ? arr : []);
    if (username) { if (d > 0) s.add(username); else s.delete(username); }
    return [...s];
  };
  if (!db.pool) {
    const tools = readJSON('tools.json', []);
    const t = tools.find(x => x.slug === slug);
    if (!t) return null;
    t.likeCount = Math.max(0, (t.likeCount || 0) + d);
    if (username) t.likedBy = applyUser(t.likedBy);
    writeJSON('tools.json', tools);
    return t.likeCount;
  }
  try {
    // Read the current likers, adjust in JS, write count + set back (simple + correct).
    let likedBy = null;
    if (username) {
      const cur = await withDbTimeout(dbQuery('SELECT liked_by FROM tools WHERE slug = $1', [slug]), 8000, 'Read likers');
      likedBy = applyUser(asArr(cur.rows[0] && cur.rows[0].liked_by));
    }
    const sql = username
      ? 'UPDATE tools SET like_count = GREATEST(0, like_count + $2), liked_by = $3::jsonb WHERE slug = $1 RETURNING like_count'
      : 'UPDATE tools SET like_count = GREATEST(0, like_count + $2) WHERE slug = $1 RETURNING like_count';
    const params = username ? [slug, d, JSON.stringify(likedBy)] : [slug, d];
    const { rows } = await withDbTimeout(dbQuery(sql, params), 8000, 'Like tool');
    return rows[0] ? rows[0].like_count : null;
  } catch (e) {
    console.error('DB like update failed:', e.message);
    return null;
  }
}

// Gallery listing. A viewer sees: public tools, their OWN tools (any visibility),
// and tools authored by an ADMIN. An admin viewer sees everything. Others' private
// AND unlisted tools never appear here.
async function listTools({ viewer = null, includePrivateFor = null, adminOwners = [], viewerIsAdmin = false, limit = 50 } = {}) {
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const me = includePrivateFor || viewer;
  const admins = Array.isArray(adminOwners) ? adminOwners : [];
  const fileFilter = (t) => viewerIsAdmin || t.visibility === 'public' || (me && t.owner === me) || admins.includes(t.owner);
  if (!db.pool) {
    return readJSON('tools.json', [])
      .filter(fileFilter)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, lim).map(stripSecret);
  }
  try {
    const { rows } = await withDbTimeout(dbQuery(
      `SELECT * FROM tools
       WHERE $1 OR visibility = 'public' OR ($2::text IS NOT NULL AND owner = $2) OR owner = ANY($3::text[])
       ORDER BY updated_at DESC LIMIT $4`,
      [!!viewerIsAdmin, me, admins, lim]
    ), 8000, 'List tools');
    return rows.map(mapToolRow);
  } catch (e) {
    console.error('DB list tools failed; falling back to file:', e.message);
    return readJSON('tools.json', [])
      .filter(fileFilter)
      .slice(0, lim).map(stripSecret);
  }
}

// ---------------------------------------------------------------------------
// entries — rows a tool creates at runtime (storage items, submissions, notes)
// ---------------------------------------------------------------------------
function mapEntryRow(r) {
  return {
    id: r.id,
    toolId: r.tool_id,
    username: r.username,
    status: r.status,
    data: parseJsonb(r.data, {}),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

function insertEntryFile(record) {
  const entries = readJSON('entries.json', []);
  entries.push(record);
  writeJSON('entries.json', entries);
}

async function insertEntry(record) {
  if (!db.pool) { insertEntryFile(record); return; }
  try {
    await withDbTimeout(dbQuery(
      `INSERT INTO entries (id, tool_id, username, status, data)
       VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [record.id, record.toolId, record.username || null, record.status || 'active', JSON.stringify(record.data || {})]
    ), 8000, 'Save entry');
  } catch (e) {
    console.error('DB insert for entry failed; saving to file instead:', e.message);
    insertEntryFile(record);
  }
}

async function listEntries(toolId, { limit = 200 } = {}) {
  const lim = Math.max(1, Math.min(1000, parseInt(limit, 10) || 200));
  if (!db.pool) {
    return readJSON('entries.json', [])
      .filter(e => e.toolId === toolId)
      .slice(-lim);
  }
  try {
    const { rows } = await withDbTimeout(dbQuery(
      'SELECT * FROM entries WHERE tool_id = $1 ORDER BY created_at DESC LIMIT $2',
      [toolId, lim]
    ), 8000, 'List entries');
    return rows.map(mapEntryRow);
  } catch (e) {
    console.error('DB list entries failed; falling back to file:', e.message);
    return readJSON('entries.json', []).filter(e => e.toolId === toolId).slice(-lim);
  }
}

// Move an entry through its status state machine (e.g. pending -> approved).
async function setEntryStatus(entryId, status) {
  if (!db.pool) {
    const entries = readJSON('entries.json', []);
    const hit = entries.find(e => e.id === entryId);
    if (!hit) return false;
    hit.status = status; hit.updatedAt = new Date().toISOString();
    writeJSON('entries.json', entries);
    return true;
  }
  const { rowCount } = await dbQuery(
    'UPDATE entries SET status = $2, updated_at = NOW() WHERE id = $1', [entryId, status]
  );
  return rowCount > 0;
}

// Fetch a single entry (to check ownership before editing/deleting).
async function getEntry(entryId) {
  if (!db.pool) return readJSON('entries.json', []).find(e => e.id === entryId) || null;
  const { rows } = await withDbTimeout(dbQuery('SELECT * FROM entries WHERE id = $1', [entryId]), 8000, 'Get entry');
  return rows[0] ? mapEntryRow(rows[0]) : null;
}

// Merge a patch into an entry's `data` (e.g. a distorted title/description or a
// generated thumbnail on a rendition card). Returns the merged data or null.
async function updateEntryData(entryId, patch) {
  if (!db.pool) {
    const entries = readJSON('entries.json', []);
    const hit = entries.find(e => e.id === entryId);
    if (!hit) return null;
    hit.data = { ...(hit.data || {}), ...(patch || {}) };
    hit.updatedAt = new Date().toISOString();
    writeJSON('entries.json', entries);
    return hit.data;
  }
  const { rows } = await withDbTimeout(dbQuery(
    `UPDATE entries SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
     WHERE id = $1 RETURNING data`,
    [entryId, JSON.stringify(patch || {})]
  ), 8000, 'Update entry data');
  return rows[0] ? parseJsonb(rows[0].data, {}) : null;
}

// Delete a rendition/entry (author, tool owner, or admin — enforced in the route).
async function deleteEntry(entryId) {
  if (!db.pool) {
    const entries = readJSON('entries.json', []);
    const next = entries.filter(e => e.id !== entryId);
    if (next.length === entries.length) return false;
    writeJSON('entries.json', next);
    return true;
  }
  const { rowCount } = await dbQuery('DELETE FROM entries WHERE id = $1', [entryId]);
  return rowCount > 0;
}

// ---------------------------------------------------------------------------
// comments — on a tool or a feed post
// ---------------------------------------------------------------------------
function mapCommentRow(r) {
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    author: r.author,
    body: r.body,
    aiGenerated: r.ai_generated,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

function insertCommentFile(record) {
  const comments = readJSON('comments.json', []);
  comments.push(record);
  writeJSON('comments.json', comments);
}

async function insertComment(record) {
  if (!db.pool) { insertCommentFile(record); return; }
  try {
    await withDbTimeout(dbQuery(
      `INSERT INTO comments (id, target_type, target_id, author, body, ai_generated)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [record.id, record.targetType, record.targetId, record.author, record.body, !!record.aiGenerated]
    ), 8000, 'Save comment');
  } catch (e) {
    console.error('DB insert for comment failed; saving to file instead:', e.message);
    insertCommentFile(record);
  }
}

async function listComments(targetType, targetId, { limit = 200 } = {}) {
  const lim = Math.max(1, Math.min(500, parseInt(limit, 10) || 200));
  if (!db.pool) {
    return readJSON('comments.json', [])
      .filter(c => c.targetType === targetType && c.targetId === targetId)
      .slice(-lim);
  }
  try {
    const { rows } = await withDbTimeout(dbQuery(
      'SELECT * FROM comments WHERE target_type = $1 AND target_id = $2 ORDER BY created_at DESC LIMIT $3',
      [targetType, targetId, lim]
    ), 8000, 'List comments');
    return rows.map(mapCommentRow);
  } catch (e) {
    console.error('DB list comments failed; falling back to file:', e.message);
    return readJSON('comments.json', [])
      .filter(c => c.targetType === targetType && c.targetId === targetId).slice(-lim);
  }
}

// ---------------------------------------------------------------------------
// posts — real user feed posts (dummy posts are generated, not stored)
// ---------------------------------------------------------------------------
function mapPostRow(r) {
  return {
    id: r.id,
    author: r.author,
    kind: r.kind,
    title: r.title,
    body: r.body,
    image: r.image,
    likeCount: r.like_count,
    aiGenerated: r.ai_generated,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

function insertPostFile(record) {
  const posts = readJSON('posts.json', []);
  posts.push(record);
  writeJSON('posts.json', posts);
}

async function insertPost(record) {
  if (!db.pool) { insertPostFile(record); return; }
  try {
    await withDbTimeout(dbQuery(
      `INSERT INTO posts (id, author, kind, title, body, image, like_count, ai_generated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [record.id, record.author, record.kind || 'text', record.title || null, record.body,
       record.image || null, record.likeCount || 0, !!record.aiGenerated]
    ), 8000, 'Save post');
  } catch (e) {
    console.error('DB insert for post failed; saving to file instead:', e.message);
    insertPostFile(record);
  }
}

async function listPosts({ limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
  if (!db.pool) {
    return readJSON('posts.json', [])
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, lim);
  }
  try {
    const { rows } = await withDbTimeout(dbQuery(
      'SELECT * FROM posts ORDER BY created_at DESC LIMIT $1', [lim]
    ), 8000, 'List posts');
    return rows.map(mapPostRow);
  } catch (e) {
    console.error('DB list posts failed; falling back to file:', e.message);
    return readJSON('posts.json', []).slice(-lim);
  }
}

// ---------------------------------------------------------------------------
// site_settings — a tiny admin-editable key/value store for page copy
// ---------------------------------------------------------------------------
async function getSiteSettings() {
  if (!db.pool) return readJSON('site_settings.json', {});
  try {
    const { rows } = await withDbTimeout(dbQuery('SELECT key, value FROM site_settings', []), 8000, 'Site settings');
    const o = {};
    for (const r of rows) o[r.key] = parseJsonb(r.value, null);
    return o;
  } catch (e) {
    console.error('Site settings read failed; falling back to file:', e.message);
    return readJSON('site_settings.json', {});
  }
}

async function setSiteSetting(key, value) {
  key = String(key || '').slice(0, 60);
  if (!key) return false;
  if (!db.pool) {
    const s = readJSON('site_settings.json', {});
    s[key] = value; writeJSON('site_settings.json', s);
    return true;
  }
  try {
    await withDbTimeout(dbQuery(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    ), 8000, 'Set site setting');
    return true;
  } catch (e) {
    console.error('Site settings write failed:', e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// user_prefs — per-user key/value preferences (e.g. a page's saved sort order)
// ---------------------------------------------------------------------------
async function getUserPrefs(username) {
  username = String(username || '');
  if (!username) return {};
  if (!db.pool) { const all = readJSON('user_prefs.json', {}); return all[username] || {}; }
  try {
    const { rows } = await withDbTimeout(dbQuery('SELECT prefs FROM user_prefs WHERE username = $1', [username]), 8000, 'User prefs');
    return rows[0] ? parseJsonb(rows[0].prefs, {}) : {};
  } catch (e) { console.error('User prefs read failed:', e.message); return {}; }
}

async function setUserPref(username, key, value) {
  username = String(username || ''); key = String(key || '').slice(0, 60);
  if (!username || !key) return false;
  if (!db.pool) {
    const all = readJSON('user_prefs.json', {});
    all[username] = { ...(all[username] || {}), [key]: value };
    writeJSON('user_prefs.json', all);
    return true;
  }
  try {
    await withDbTimeout(dbQuery(
      `INSERT INTO user_prefs (username, prefs, updated_at) VALUES ($1, jsonb_build_object($2::text, $3::jsonb), NOW())
       ON CONFLICT (username) DO UPDATE SET prefs = user_prefs.prefs || jsonb_build_object($2::text, $3::jsonb), updated_at = NOW()`,
      [username, key, JSON.stringify(value)]
    ), 8000, 'Set user pref');
    return true;
  } catch (e) { console.error('User prefs write failed:', e.message); return false; }
}

module.exports = {
  insertTool, getToolBySlug, listTools, setToolLikeDelta, getToolWithKeys, updateTool, deleteTool,
  insertEntry, listEntries, setEntryStatus, getEntry, updateEntryData, deleteEntry,
  insertComment, listComments,
  insertPost, listPosts,
  getSiteSettings, setSiteSetting,
  getUserPrefs, setUserPref,
};
