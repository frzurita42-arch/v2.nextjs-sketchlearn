// ---------------------------------------------------------------------------
// Document store: Postgres (DATABASE_URL) with a JSON-file fallback.
//
// Every entity lives in a named collection as a JSON document. In Postgres a
// single table `sl_docs (collection, id, data jsonb)` holds everything; when
// no DATABASE_URL is configured, documents are kept in one JSON file per
// collection under DATA_DIR (default ./data, falling back to the system tmp
// dir when the project directory is read-only, e.g. on serverless hosts).
// ---------------------------------------------------------------------------

import fs from "fs";
import os from "os";
import path from "path";
import type { Pool } from "pg";

type Doc = { id: string };

const usePg = !!process.env.DATABASE_URL;

// --- Postgres driver -------------------------------------------------------

let pool: Pool | null = null;
let pgReady: Promise<void> | null = null;

async function getPool(): Promise<Pool> {
  if (!pool) {
    const { Pool: PgPool } = await import("pg");
    pool = new PgPool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: process.env.DATABASE_URL?.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
    });
  }
  if (!pgReady) {
    pgReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS sl_docs (
           collection text NOT NULL,
           id text NOT NULL,
           data jsonb NOT NULL,
           PRIMARY KEY (collection, id)
         )`
      )
      .then(() => undefined);
  }
  await pgReady;
  return pool;
}

// --- File driver -----------------------------------------------------------

let dataDir: string | null = null;

function getDataDir(): string {
  if (dataDir) return dataDir;
  const preferred = process.env.DATA_DIR || path.join(process.cwd(), "data");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    dataDir = preferred;
  } catch {
    const tmp = path.join(os.tmpdir(), "sketchlearn-data");
    fs.mkdirSync(tmp, { recursive: true });
    dataDir = tmp;
  }
  return dataDir;
}

const fileCache = new Map<string, Map<string, Doc>>();

function fileFor(collection: string): string {
  return path.join(getDataDir(), `${collection}.json`);
}

function loadCollection(collection: string): Map<string, Doc> {
  let cached = fileCache.get(collection);
  if (cached) return cached;
  cached = new Map();
  try {
    const raw = fs.readFileSync(fileFor(collection), "utf8");
    const parsed = JSON.parse(raw) as Doc[];
    for (const doc of parsed) cached.set(doc.id, doc);
  } catch {
    // Missing or corrupt file: start empty.
  }
  fileCache.set(collection, cached);
  return cached;
}

function persistCollection(collection: string): void {
  const docs = [...loadCollection(collection).values()];
  const file = fileFor(collection);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(docs, null, 2));
  fs.renameSync(tmp, file);
}

// --- Public API ------------------------------------------------------------

export async function listDocs<T extends Doc>(collection: string): Promise<T[]> {
  if (usePg) {
    const pg = await getPool();
    const res = await pg.query(
      "SELECT data FROM sl_docs WHERE collection = $1",
      [collection]
    );
    return res.rows.map((r) => r.data as T);
  }
  return [...loadCollection(collection).values()] as T[];
}

export async function getDoc<T extends Doc>(
  collection: string,
  id: string
): Promise<T | null> {
  if (usePg) {
    const pg = await getPool();
    const res = await pg.query(
      "SELECT data FROM sl_docs WHERE collection = $1 AND id = $2",
      [collection, id]
    );
    return (res.rows[0]?.data as T) ?? null;
  }
  return (loadCollection(collection).get(id) as T) ?? null;
}

export async function putDoc<T extends Doc>(
  collection: string,
  doc: T
): Promise<T> {
  if (usePg) {
    const pg = await getPool();
    await pg.query(
      `INSERT INTO sl_docs (collection, id, data) VALUES ($1, $2, $3)
       ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data`,
      [collection, doc.id, JSON.stringify(doc)]
    );
    return doc;
  }
  loadCollection(collection).set(doc.id, doc);
  persistCollection(collection);
  return doc;
}

export async function delDoc(collection: string, id: string): Promise<void> {
  if (usePg) {
    const pg = await getPool();
    await pg.query("DELETE FROM sl_docs WHERE collection = $1 AND id = $2", [
      collection,
      id,
    ]);
    return;
  }
  loadCollection(collection).delete(id);
  persistCollection(collection);
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}
