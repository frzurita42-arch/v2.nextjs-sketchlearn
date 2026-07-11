/* Minimal Wolfram Alpha connector. Uses the Short Answers API to compute a
 * one-line result for a query. Available only when WOLFRAM_APP_ID is set (the
 * connector registry reports this); callers fall back to a formula/code snippet
 * when it returns null. */
const { hasConfiguredKey } = require('../config');

function wolframAvailable() {
  return hasConfiguredKey(process.env.WOLFRAM_APP_ID);
}

async function wolframShortAnswer(query) {
  const appId = process.env.WOLFRAM_APP_ID;
  if (!hasConfiguredKey(appId) || !query) return null;
  const url = `https://api.wolframalpha.com/v1/result?appid=${encodeURIComponent(appId)}&i=${encodeURIComponent(String(query).slice(0, 300))}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null; // 501 = "could not interpret"; anything non-2xx -> fall back
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

// Full Results API: returns the computed pods as { title, text } — including the
// "Step-by-step solution" pod when Wolfram can produce one (great for showing HOW
// an equation is solved or a derivative/integral is worked out). Falls back to the
// ordinary Result/Solution pods when steps aren't available. Returns null on any
// failure so callers degrade to a formula / short answer.
async function wolframFull(query) {
  const appId = process.env.WOLFRAM_APP_ID;
  if (!hasConfiguredKey(appId) || !query) return null;
  const params = new URLSearchParams({
    appid: appId,
    input: String(query).slice(0, 300),
    output: 'json',
    format: 'plaintext',
    podstate: 'Step-by-step solution',   // ask Wolfram to expand steps where it can
  });
  const url = `https://api.wolframalpha.com/v2/query?${params.toString()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json();
    const qr = data && data.queryresult;
    if (!qr || !qr.success) return null;
    const pods = (Array.isArray(qr.pods) ? qr.pods : [])
      .filter((p) => p && p.error !== true && p.id !== 'Input')
      .map((p) => ({
        title: String(p.title || '').slice(0, 80),
        text: (Array.isArray(p.subpods) ? p.subpods : [])
          .map((sp) => String((sp && sp.plaintext) || '').trim()).filter(Boolean).join('\n').slice(0, 1500),
      }))
      .filter((p) => p.text);
    return pods.length ? pods.slice(0, 6) : null;
  } catch {
    return null;
  }
}

module.exports = { wolframAvailable, wolframShortAnswer, wolframFull };
