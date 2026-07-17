/* AI usage / token-consumption log across file or Postgres storage. Best-effort:
 * logging never throws (a failed write must not break a generation). */
const crypto = require('crypto');
const { db, dbQuery, withDbTimeout } = require('./pool');
const { readJSON, writeJSON } = require('./persistence');

function fileAppend(row) {
  try { const all = readJSON('usage.json', []); all.push(row); writeJSON('usage.json', all.slice(-5000)); } catch (e) { /* ignore */ }
}

// Record one generation event. Returns the stored row.
async function logUsage(rec = {}) {
  const promptTokens = Math.max(0, parseInt(rec.promptTokens, 10) || 0);
  const completionTokens = Math.max(0, parseInt(rec.completionTokens, 10) || 0);
  const row = {
    id: rec.id || `au-${crypto.randomUUID().slice(0, 12)}`,
    username: String(rec.username || 'anon').slice(0, 60),
    kind: String(rec.kind || 'text').slice(0, 40),
    provider: String(rec.provider || '').slice(0, 40),
    model: String(rec.model || '').slice(0, 60),
    promptTokens, completionTokens,
    totalTokens: Math.max(0, parseInt(rec.totalTokens, 10) || (promptTokens + completionTokens)),
    costUsd: Number(rec.costUsd) || 0,
    subject: String(rec.subject || '').slice(0, 200),
    meta: (rec.meta && typeof rec.meta === 'object') ? rec.meta : {},
    createdAt: new Date().toISOString(),
  };
  // Debit the user's token wallet by what this event cost. Admins are effectively
  // unlimited (their balance is floored at 0 and never shown/enforced), so debiting
  // them is harmless; a non-admin's balance actually goes down here. Best-effort —
  // a wallet failure must never break logging or the generation.
  if (row.username && row.username !== 'anon' && row.totalTokens > 0) {
    try { const { addUserTokens } = require('./platform'); await addUserTokens(row.username, -row.totalTokens); } catch { /* ignore */ }
  }
  if (!db.pool) { fileAppend(row); return row; }
  try {
    await withDbTimeout(dbQuery(
      `INSERT INTO ai_usage (id, username, kind, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, subject, meta, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb, NOW())`,
      [row.id, row.username, row.kind, row.provider, row.model, row.promptTokens, row.completionTokens, row.totalTokens, row.costUsd, row.subject, JSON.stringify(row.meta)]
    ), 8000, 'Log AI usage');
  } catch (e) {
    console.error('DB usage log failed; file fallback:', e.message);
    fileAppend(row);
  }
  return row;
}

async function listUsage({ limit = 300 } = {}) {
  const lim = Math.max(1, Math.min(2000, parseInt(limit, 10) || 300));
  if (!db.pool) {
    return readJSON('usage.json', []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, lim);
  }
  try {
    const { rows } = await withDbTimeout(dbQuery('SELECT * FROM ai_usage ORDER BY created_at DESC LIMIT $1', [lim]), 8000, 'List AI usage');
    return rows.map(r => ({
      id: r.id, username: r.username, kind: r.kind, provider: r.provider, model: r.model,
      promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens, totalTokens: r.total_tokens,
      costUsd: Number(r.cost_usd) || 0, subject: r.subject, meta: r.meta,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));
  } catch (e) {
    console.error('DB list usage failed; file fallback:', e.message);
    return readJSON('usage.json', []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, lim);
  }
}

module.exports = { logUsage, listUsage };
