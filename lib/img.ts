/* Image src helpers. Images can be a pasted URL (lightweight — stored as a short
 * string) or an uploaded data: URL (heavier). We prefer URLs to save DB space. */

// Render only true image sources: a data: URL or an http(s) URL.
export function isRenderableImage(v: any): boolean {
  const s = String(v || '');
  return s.startsWith('data:image') || /^https?:\/\//i.test(s);
}

// Best-effort: turn a Google Drive SHARE link into a direct-view link so <img>
// (and a server-side fetch for AI vision) has a chance of loading it. Note: this
// is unreliable — Google throttles hotlinking and shows scan interstitials —
// so a real image host is recommended. Non-Drive URLs pass through unchanged.
export function normalizeImageUrl(url: string): string {
  const u = String(url || '').trim();
  const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^]*id=)([\w-]{10,})/);
  if (m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  return u;
}
