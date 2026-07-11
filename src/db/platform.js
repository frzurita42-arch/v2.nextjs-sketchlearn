/* Platform stores for the general-purpose tool maker: published tool definitions,
 * the generic per-tool entry store, and comments. Each mirrors games.js — Postgres
 * when a pool exists, JSON-file fallback otherwise, so nothing is lost when the DB
 * is slow or unset. Key values are never handled here; this is pure persistence. */
const { db, dbQuery, withDbTimeout } = require('./pool');
const { readJSON, writeJSON } = require('./persistence');

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
    definition: r.definition,
    visibility: r.visibility,
    tags: r.tags || [],
    thumbnail: r.thumbnail,
    likeCount: r.like_count,
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
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        record.id, record.slug, record.owner, record.title, record.description || null,
        record.archetype, record.definition, record.visibility || 'private',
        record.tags || null, record.thumbnail || null, record.likeCount || 0,
        !!record.aiGenerated,
      ]
    ), 8000, 'Save tool');
  } catch (e) {
    console.error('DB insert for tool failed; saving to file instead:', e.message);
    insertToolFile(record);
  }
}

async function getToolBySlug(slug) {
  if (!db.pool) return readJSON('tools.json', []).find(t => t.slug === slug) || null;
  try {
    const { rows } = await withDbTimeout(dbQuery('SELECT * FROM tools WHERE slug = $1', [slug]), 8000, 'Get tool');
    return rows[0] ? mapToolRow(rows[0]) : null;
  } catch (e) {
    console.error('DB read for tool failed; falling back to file:', e.message);
    return readJSON('tools.json', []).find(t => t.slug === slug) || null;
  }
}

// Public gallery: visible tools, newest first. Owner sees their own private ones too.
async function listTools({ viewer = null, includePrivateFor = null, limit = 50 } = {}) {
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  if (!db.pool) {
    return readJSON('tools.json', [])
      .filter(t => t.visibility === 'public' || (includePrivateFor && t.owner === includePrivateFor))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, lim);
  }
  try {
    const { rows } = await withDbTimeout(dbQuery(
      `SELECT * FROM tools
       WHERE visibility = 'public' OR ($1::text IS NOT NULL AND owner = $1)
       ORDER BY updated_at DESC LIMIT $2`,
      [includePrivateFor, lim]
    ), 8000, 'List tools');
    return rows.map(mapToolRow);
  } catch (e) {
    console.error('DB list tools failed; falling back to file:', e.message);
    return readJSON('tools.json', [])
      .filter(t => t.visibility === 'public' || (includePrivateFor && t.owner === includePrivateFor))
      .slice(0, lim);
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
    data: r.data,
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
       VALUES ($1,$2,$3,$4,$5)`,
      [record.id, record.toolId, record.username || null, record.status || 'active', record.data]
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

module.exports = {
  insertTool, getToolBySlug, listTools,
  insertEntry, listEntries, setEntryStatus,
  insertComment, listComments,
  insertPost, listPosts,
};
