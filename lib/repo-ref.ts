// A short, stable REFERENCE CODE for a repository, derived deterministically from its
// slug. The slug (and title) can be long, so the run record shows this compact code
// (e.g. "#K3F9A") instead — and because it is a pure function of the stable slug, the
// same repo always maps to the same code, so a lesson's origin code can be matched back
// to the repo (which displays its own code on its page).
export function repoRef(slug: string): string {
  const s = String(slug || '');
  if (!s) return '';
  let h = 2166136261;                       // FNV-1a-ish hash → stable 32-bit int
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36).toUpperCase().slice(0, 5).padStart(5, '0');
}
