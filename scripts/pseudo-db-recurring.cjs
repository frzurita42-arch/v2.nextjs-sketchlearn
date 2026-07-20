#!/usr/bin/env node
/*
 * Recurring pseudo-DB sync runner.
 *
 * Usage:
 *   node scripts/pseudo-db-recurring.cjs pull
 *   node scripts/pseudo-db-recurring.cjs push
 *
 * Env:
 *   PSEUDO_DB_SYNC_MS=120000   # default 120s
 */
const { spawn } = require('child_process');
const path = require('path');

const mode = String(process.argv[2] || '').toLowerCase();
if (mode !== 'pull' && mode !== 'push') {
  console.error('Usage: node scripts/pseudo-db-recurring.cjs <pull|push>');
  process.exit(1);
}

const intervalMs = Math.max(15000, parseInt(process.env.PSEUDO_DB_SYNC_MS || '120000', 10) || 120000);
const syncScript = path.join(__dirname, 'pseudo-db-sync.cjs');
let running = false;

function tick() {
  if (running) return;
  running = true;
  const started = new Date();
  const child = spawn(process.execPath, [syncScript, mode], { stdio: 'inherit' });
  child.on('exit', (code) => {
    const took = Math.round((Date.now() - started.getTime()) / 1000);
    const stamp = new Date().toISOString();
    if (code === 0) console.log(`[pseudo-db-recurring] ${stamp} ${mode} ok (${took}s)`);
    else console.error(`[pseudo-db-recurring] ${stamp} ${mode} failed (exit ${code})`);
    running = false;
  });
}

console.log(`[pseudo-db-recurring] starting ${mode} every ${Math.round(intervalMs / 1000)}s`);
tick();
setInterval(tick, intervalMs);
