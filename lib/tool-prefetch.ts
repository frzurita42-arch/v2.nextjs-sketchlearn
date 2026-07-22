'use client';
/* A tiny in-memory prefetch cache for tool definitions and their run entries.
 *
 * Opening a tool from a gallery card fetches `/api/tools?slug=…` (the full
 * definition) and then the lesson player fetches that tool's entries — two
 * round-trips the user waits through after clicking. Prefetching on hover/press
 * (before the click) hides that latency: by the time the click lands, the data
 * is usually already here.
 *
 * The cache stores the in-flight Promise (so concurrent callers share one
 * request) keyed by slug, plus a short freshness window. It is intentionally
 * simple and process-local — it is a latency optimisation, never a source of
 * truth; the real fetch still runs if the cache misses or has gone stale. */
import { API } from '@/lib/api';

type Cached<T> = { at: number; promise: Promise<T> };

const TOOL_TTL = 60_000;     // a tool definition is safe to reuse for ~1 minute
const ENTRIES_TTL = 20_000;  // entries change more often — shorter window

const toolCache = new Map<string, Cached<any>>();
const entriesCache = new Map<string, Cached<any>>();

function fresh<T>(m: Map<string, Cached<T>>, key: string, ttl: number): Promise<T> | null {
  const hit = m.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  return null;
}

// Kick off (or reuse) a fetch of a tool's full definition. Safe to call on hover.
// Errors are swallowed here — a prefetch that fails just means the click-time
// fetch runs normally — but the caller of `getTool` still sees the rejection.
export function prefetchTool(slug: string): Promise<any> {
  const s = String(slug || '');
  if (!s) return Promise.resolve(null);
  const existing = fresh(toolCache, s, TOOL_TTL);
  if (existing) return existing;
  const promise = API.get(`/api/tools?slug=${encodeURIComponent(s)}`).then((r: any) => r?.tool || null);
  promise.catch(() => { toolCache.delete(s); });   // don't cache a failure past its resolution
  toolCache.set(s, { at: Date.now(), promise });
  return promise;
}

// Await a tool definition, using a warm prefetch when one is in flight/fresh.
export function getTool(slug: string): Promise<any> {
  return prefetchTool(slug);
}

// Prefetch a tool's run entries (what the lesson player's activity feed loads).
export function prefetchEntries(slug: string): Promise<any> {
  const s = String(slug || '');
  if (!s) return Promise.resolve(null);
  const existing = fresh(entriesCache, s, ENTRIES_TTL);
  if (existing) return existing;
  const promise = API.get(`/api/tools/entries?slug=${encodeURIComponent(s)}`);
  promise.catch(() => { entriesCache.delete(s); });
  entriesCache.set(s, { at: Date.now(), promise });
  return promise;
}

// Consume a fresh, in-flight entries prefetch if one exists; otherwise null so
// the caller falls back to its own fetch. Does NOT start a new request.
export function takeEntries(slug: string): Promise<any> | null {
  return fresh(entriesCache, String(slug || ''), ENTRIES_TTL);
}

// Warm both a tool and its entries — the full "about to open this" prefetch.
export function prefetchToolAndEntries(slug: string): void {
  prefetchTool(slug);
  prefetchEntries(slug);
}
