/* Activity log store — a trail of what admins/users did: which dashboard tab
 * they opened, which filter they set, and which setting/preset they changed
 * (old → new). DB-backed (activity_log table) with a JSON-file fallback, exactly
 * like the AI-usage store. Surfaced as the dashboard's Activity table. */
const { db, dbQuery, withDbTimeout } = require('./pool');
const { readJSON, writeJSON } = require('./persistence');

function fileAppend(row) {
  try { const all = readJSON('activity.json', []); all.push(row); writeJSON('activity.json', all.slice(-5000)); } catch (e) { /* ignore */ }
}

async function logActivity(rec = {}) {
  const row = {
    id: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    username: String(rec.username || 'anon').slice(0, 60),
    action: String(rec.action || '').slice(0, 40),
    target: String(rec.target || '').slice(0, 120),
    detail: (rec.detail && typeof rec.detail === 'object') ? rec.detail : {},
    createdAt: new Date().toISOString(),
  };
  if (!db.pool) { fileAppend(row); return row; }
  try {
    await withDbTimeout(dbQuery(
      `INSERT INTO activity_log (id, username, action, target, detail, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [row.id, row.username, row.action, row.target, JSON.stringify(row.detail), row.createdAt]
    ), 8000, 'Log activity');
  } catch (e) {
    console.error('Activity log write failed; using file:', e.message);
    fileAppend(row);
  }
  return row;
}

async function listActivity({ limit = 300 } = {}) {
  const lim = Math.max(1, Math.min(2000, limit));
  if (!db.pool) {
    return readJSON('activity.json', []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, lim);
  }
  try {
    const { rows } = await withDbTimeout(dbQuery('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1', [lim]), 8000, 'List activity');
    return rows.map((r) => ({
      id: r.id, username: r.username, action: r.action, target: r.target,
      detail: (r.detail && typeof r.detail === 'object') ? r.detail : {},
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
  } catch (e) {
    console.error('Activity list failed; using file:', e.message);
    return readJSON('activity.json', []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, lim);
  }
}

module.exports = { logActivity, listActivity };
