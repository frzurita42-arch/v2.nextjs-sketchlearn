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

module.exports = { wolframAvailable, wolframShortAnswer };
