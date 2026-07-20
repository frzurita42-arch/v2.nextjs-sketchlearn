/* Postgres connection pool + query helpers.
 *
 * IMPORTANT: the pool is reassigned at runtime — if the configured DB is
 * unreachable at boot we downgrade to file storage by setting the pool to null.
 * require() hands out a live reference to this module's exports object, so we
 * expose a MUTABLE HOLDER (`db.pool`) rather than the Pool itself. Every consumer
 * reads `db.pool`, and the boot downgrade does `db.pool = null`, which all
 * consumers then see. Never destructure the pool out by value. */
const { DATABASE_URL, dbEnabled } = require('../config');

// Neon's serverless driver talks to Neon over HTTP/WebSocket instead of a raw TCP
// Postgres connection. On Vercel this wakes a suspended free-tier Neon database
// fast and avoids the connection stalls that made saves (My Stats history) hang and
// fall back to throwaway per-instance storage. We use it whenever DATABASE_URL points
// at a Neon host, and fall back to node-postgres for any other Postgres (e.g. a local
// dev database), since the Neon driver only speaks to Neon endpoints.
const isNeon = /\.neon\.tech/i.test(DATABASE_URL || '');

function makePool() {
  if (!dbEnabled) return null;
  if (isNeon) {
    const neon = require('@neondatabase/serverless');
    // Node needs a WebSocket implementation for pooled sessions/transactions.
    try { neon.neonConfig.webSocketConstructor = require('ws'); } catch { /* global WebSocket on newer Node */ }
    return new neon.Pool({ connectionString: DATABASE_URL });
  }
  const { Pool } = require('pg');
  return new Pool({
    connectionString: DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
    // Fail an unreachable non-Neon DB fast at boot (then downgrade to file storage);
    // slow queries are bounded per-call by withDbTimeout.
    max: 5,
    connectionTimeoutMillis: 6000,
    idleTimeoutMillis: 30000,
  });
}

const db = { pool: makePool() };

if (db.pool) {
  // A pool 'error' on an idle client would otherwise crash the process.
  db.pool.on('error', (err) => console.error('Postgres pool error:', err.message));
}

async function dbQuery(text, params = []) {
  if (!db.pool) throw new Error('Database is not configured');
  // Bound EVERY query so a slow/overloaded Postgres (or an exhausted connection
  // pool under a burst of concurrent requests) rejects fast and callers can fall
  // back to file storage, instead of hanging until the serverless function dies.
  return withDbTimeout(db.pool.query(text, params), 10000, 'DB query');
}

async function degradeDb(reason = 'Database unavailable') {
  if (!db.pool) return;
  try { await db.pool.end(); } catch { /* ignore */ }
  db.pool = null;
  console.error(`${reason}; downgraded to file storage for this run.`);
}

// Bound a DB operation so a slow/hung query rejects quickly and callers can fall back.
function withDbTimeout(promise, ms = 8000, label = 'DB operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { db, dbQuery, withDbTimeout, degradeDb };
