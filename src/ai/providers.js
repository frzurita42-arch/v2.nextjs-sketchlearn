/* AI provider layer: DeepSeek + Gemini text, structured-JSON generation with
 * failover/retry, image generation, and Claude SVG illustration. */
const {
  DEEPSEEK_API_KEY, DEEPSEEK_URL, deepseekEnabled,
  GEMINI_API_KEY, GEMINI_API_BASE, GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL, geminiEnabled,
  OPENROUTER_API_KEY, OPENROUTER_URL, OPENROUTER_MODEL, OPENROUTER_MODEL_REASON, OPENROUTER_MODEL_VISION, openrouterEnabled,
  MOONSHOT_API_KEY, MOONSHOT_URL, MOONSHOT_MODEL, moonshotEnabled,
  GROK_API_KEY, GROK_URL, GROK_MODEL, GROK_IMAGE_URL, GROK_IMAGE_MODEL, grokEnabled,
  IMAGE_API_KEY, IMAGE_API_URL, IMAGE_API_MODEL,
  LEONARDO_API_KEY, LEONARDO_API_BASE, LEONARDO_MODEL, LEONARDO_SIZE, leonardoEnabled,
  REPLICATE_API_TOKEN, REPLICATE_MODEL, replicateEnabled,
  POLLINATIONS_BASE, POLLINATIONS_MODEL, pollinationsEnabled,
  ANTHROPIC_API_KEY, ANTHROPIC_API_URL, ANTHROPIC_MODEL, claudeSvgEnabled,
  ELEVENLABS_API_KEY, ELEVENLABS_API_URL, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL, ttsEnabled
} = require('../config');
const { sanitizeSvg } = require('../slides/sanitize');
const { fallbackImageDataUrl } = require('../slides/visual-policy');

// fetch() has no built-in timeout: on a slow/hung provider the serverless
// function would hang until it is killed and the user only sees a generic
// "Request timed out". Bound each provider call so it fails fast with a real,
// surfaced error instead.
async function fetchWithTimeout(url, options, ms = 45000, label = 'AI request') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`${label} timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function parseModelJson(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Empty JSON response from model');

  // Some providers occasionally wrap JSON in ```json code fences.
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const extractBalanced = (src) => {
    const firstObj = src.indexOf('{');
    const firstArr = src.indexOf('[');
    const start = (firstObj === -1) ? firstArr : (firstArr === -1 ? firstObj : Math.min(firstObj, firstArr));
    if (start === -1) return null;
    const open = src[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === open) depth++;
      if (ch === close) {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    return null;
  };

  const candidates = [unfenced, extractBalanced(unfenced)].filter(Boolean);
  let lastErr = null;
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); }
    catch (e) { lastErr = e; }
  }
  throw new Error(`Model returned invalid JSON: ${lastErr ? lastErr.message : 'parse failed'}`);
}

// ---------- DeepSeek helpers ----------
async function deepseek(messages, { json = true, temperature = 0.8, maxTokens = 4096 } = {}) {
  if (!deepseekEnabled) throw new Error('DEEPSEEK_API_KEY is not configured. Set a real key in .env.');
  let lastParseErr = null;
  for (let attempt = 0; attempt < (json ? 4 : 1); attempt++) {
    const attemptMaxTokens = json ? Math.min(12288, Math.round(maxTokens * Math.pow(1.6, attempt))) : maxTokens;
    const body = {
      model: 'deepseek-chat',
      messages,
      temperature: attempt === 0 ? temperature : 0.2,
      max_tokens: attemptMaxTokens
    };
    if (json) body.response_format = { type: 'json_object' };
    const res = await fetchWithTimeout(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify(body)
    }, 45000, 'DeepSeek request');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DeepSeek API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from DeepSeek');
    if (!json) return content;
    try {
      return parseModelJson(content);
    } catch (e) {
      lastParseErr = e;
    }
  }
  throw lastParseErr || new Error('Model returned invalid JSON');
}

// Moonshot AI (Kimi) — OpenAI-compatible chat completions (same shape as DeepSeek).
async function moonshot(messages, { json = true, temperature = 0.8, maxTokens = 4096 } = {}) {
  if (!moonshotEnabled) throw new Error('MOONSHOT_API_KEY is not configured. Set a real key in .env.');
  let lastParseErr = null;
  for (let attempt = 0; attempt < (json ? 4 : 1); attempt++) {
    const attemptMaxTokens = json ? Math.min(16384, Math.round(maxTokens * Math.pow(1.6, attempt))) : maxTokens;
    const body = {
      model: MOONSHOT_MODEL,
      messages,
      temperature: attempt === 0 ? temperature : 0.2,
      max_tokens: attemptMaxTokens
    };
    if (json) body.response_format = { type: 'json_object' };
    const res = await fetchWithTimeout(MOONSHOT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MOONSHOT_API_KEY}` },
      body: JSON.stringify(body)
    }, 45000, 'Kimi (Moonshot) request');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Kimi (Moonshot) API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Kimi');
    if (!json) return content;
    try {
      return parseModelJson(content);
    } catch (e) {
      lastParseErr = e;
    }
  }
  throw lastParseErr || new Error('Model returned invalid JSON');
}

// xAI Grok — OpenAI-compatible chat completions (same shape as DeepSeek/Kimi).
// The DEFAULT text provider when GROK_API_KEY is set.
async function grok(messages, { json = true, temperature = 0.8, maxTokens = 4096 } = {}) {
  if (!grokEnabled) throw new Error('GROK_API_KEY is not configured. Set a real key in .env.');
  let lastParseErr = null;
  for (let attempt = 0; attempt < (json ? 4 : 1); attempt++) {
    const attemptMaxTokens = json ? Math.min(16384, Math.round(maxTokens * Math.pow(1.6, attempt))) : maxTokens;
    const body = {
      model: GROK_MODEL,
      messages,
      temperature: attempt === 0 ? temperature : 0.2,
      max_tokens: attemptMaxTokens
    };
    if (json) body.response_format = { type: 'json_object' };
    const res = await fetchWithTimeout(GROK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROK_API_KEY}` },
      body: JSON.stringify(body)
    }, 45000, 'Grok request');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Grok API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Grok');
    if (!json) return content;
    try {
      return parseModelJson(content);
    } catch (e) {
      lastParseErr = e;
    }
  }
  throw lastParseErr || new Error('Model returned invalid JSON');
}

// Google Gemini text generation (OpenAI-style messages translated to Gemini's shape).
async function gemini(messages, { json = true, temperature = 0.8, maxTokens = 4096 } = {}) {
  if (!geminiEnabled) throw new Error('GEMINI_API_KEY is not configured. Set a real key in .env.');
  const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content) }]
  }));
  if (!contents.length) contents.push({ role: 'user', parts: [{ text: String(messages[messages.length - 1]?.content || '') }] });
  let lastParseErr = null;
  for (let attempt = 0; attempt < (json ? 4 : 1); attempt++) {
    const attemptMaxTokens = json ? Math.min(12288, Math.round(maxTokens * Math.pow(1.6, attempt))) : maxTokens;
    const body = {
      contents,
      generationConfig: {
        temperature: attempt === 0 ? temperature : 0.2,
        maxOutputTokens: attemptMaxTokens,
        // Gemini 2.5/3 Flash think by default, and thinking tokens are billed
        // against maxOutputTokens — that stalls replies and truncates our JSON.
        // We don't need chain-of-thought here, so turn it off for speed + full
        // output budget. (Override GEMINI_TEXT_MODEL to a non-thinking model if
        // this ever errors.)
        thinkingConfig: { thinkingBudget: 0 },
        ...(json ? { responseMimeType: 'application/json' } : {})
      }
    };
    if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
    const res = await fetchWithTimeout(`${GEMINI_API_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify(body)
    }, 45000, 'Gemini request');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) {
        throw new Error('Gemini API quota/rate limit hit (429). This is usually per-model or per-minute quota for this API key/project, not your overall billing balance.');
      }
      if (res.status === 503) {
        throw new Error('Gemini service is temporarily overloaded (503). Please retry in a moment.');
      }
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const content = parts.map(p => p.text).filter(Boolean).join('');
    if (!content) throw new Error('Empty response from Gemini');
    if (!json) return content;
    try {
      return parseModelJson(content);
    } catch (e) {
      lastParseErr = e;
    }
  }
  throw lastParseErr || new Error('Model returned invalid JSON');
}

// ── Real YouTube video recommendations via Gemini + Google Search grounding ──
// Gemini's built-in google_search tool grounds the answer in live web results, so
// it returns REAL, currently-available videos instead of hallucinated links. We
// then validate every candidate against YouTube's keyless oEmbed endpoint (drops
// dead/private IDs and gives us the canonical title, channel + thumbnail).

// Pull the 11-char YouTube id out of any watch/short/embed/youtu.be URL.
function youtubeIdFrom(url) {
  const s = String(url || '');
  const m = s.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Keyless validation: youtube.com/oembed returns 200 (+ title/author/thumbnail)
// for a real, embeddable public video, and 401/404 for a dead or private one.
async function youtubeOEmbed(videoId) {
  try {
    const u = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`;
    const res = await fetchWithTimeout(u, {}, 8000, 'YouTube oEmbed');
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j || !j.title) return null;
    return {
      videoId,
      title: String(j.title).slice(0, 160),
      channel: String(j.author_name || '').slice(0, 100),
      thumb: j.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      embed: `https://www.youtube-nocookie.com/embed/${videoId}`,
    };
  } catch { return null; }
}

// Ask grounded Gemini for `limit` real educational YouTube videos on `query`,
// then validate each. Returns a (possibly shorter) array of verified videos.
async function geminiSearchVideos(query, limit = 4) {
  if (!geminiEnabled) throw new Error('Video recommendations need GEMINI_API_KEY (Google Search grounding).');
  const want = Math.max(1, Math.min(6, Number(limit) || 4));
  const prompt = [
    `Use Google Search to find ${want + 3} real, currently-available YouTube videos that TEACH or clearly EXPLAIN this learning topic: "${query}".`,
    'Prefer reputable educational channels and lessons/tutorials/explainers. Only include videos you actually found via search (never invent a link).',
    'Reply with ONLY a JSON array (no prose), each item: {"title": string, "channel": string, "url": "https://www.youtube.com/watch?v=VIDEOID"}.',
  ].join(' ');
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  };
  const res = await fetchWithTimeout(`${GEMINI_API_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body),
  }, 45000, 'Gemini video search');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini video search error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts.map((p) => p.text).filter(Boolean).join('');

  // Collect candidate ids from the model's JSON AND from any raw youtube URLs it
  // (or its grounding citations) surfaced, de-duped, in first-seen order.
  const ids = [];
  const pushId = (id) => { if (id && !ids.includes(id)) ids.push(id); };
  try {
    const arr = parseModelJson(content);
    if (Array.isArray(arr)) arr.forEach((v) => pushId(youtubeIdFrom(v && v.url)));
  } catch { /* fall through to regex scan */ }
  const blob = JSON.stringify(data) + '\n' + content;
  const re = /(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/g;
  let m; while ((m = re.exec(blob))) pushId(m[1]);

  // Validate candidates (keyless oEmbed) until we have `want` real videos.
  const out = [];
  for (const id of ids.slice(0, want + 6)) {
    const v = await youtubeOEmbed(id);
    if (v) out.push(v);
    if (out.length >= want) break;
  }
  return out;
}

// Gemini with an attached DOCUMENT (a PDF or text file, base64) — Gemini reads
// the file natively. `system` sets the rules, `userText` frames the ask, and
// `docs` is [{ mimeType, data(base64) }]. Returns parsed JSON.
async function geminiDoc(system, userText, docs = [], { maxTokens = 4096, temperature = 0.4 } = {}) {
  if (!geminiEnabled) throw new Error('GEMINI_API_KEY is not configured.');
  const parts = [{ text: String(userText || '') }];
  for (const d of docs) { if (d && d.data && d.mimeType) parts.push({ inlineData: { mimeType: d.mimeType, data: d.data } }); }
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, maxOutputTokens: Math.min(16384, maxTokens), thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
  };
  if (system) body.systemInstruction = { parts: [{ text: String(system) }] };
  const res = await fetchWithTimeout(`${GEMINI_API_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY }, body: JSON.stringify(body),
  }, 60000, 'Gemini document request');
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Gemini API error ${res.status}: ${t.slice(0, 300)}`); }
  const data = await res.json();
  const content = (data.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join('');
  if (!content) throw new Error('Empty response from Gemini');
  return parseModelJson(content);
}

// Gemini vision: send an image (data URL) + a prompt, get back parsed JSON.
// Used to CHECK a learner's handwriting drawing against a target character.
// Returns null when Gemini isn't configured (caller falls back to self-check).
async function generateVisionJSON(prompt, imageDataUrl) {
  const m = String(imageDataUrl || '').match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) return null;
  // Prefer OpenRouter (a vision model reads the handwriting); fall back to Gemini.
  if (openrouterEnabled) {
    try {
      const messages = [{ role: 'user', content: [{ type: 'text', text: String(prompt) }, { type: 'image_url', image_url: { url: imageDataUrl } }] }];
      return await openrouter(messages, { json: true, temperature: 0.2, maxTokens: 700, task: 'vision' });
    } catch (e) {
      if (!geminiEnabled) return null;
      console.warn('OpenRouter vision failed; falling back to Gemini vision:', String(e && e.message || '').slice(0, 120));
    }
  }
  if (!geminiEnabled) return null;
  const body = {
    contents: [{ role: 'user', parts: [{ text: String(prompt) }, { inlineData: { mimeType: m[1], data: m[2] } }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
  };
  const res = await fetchWithTimeout(`${GEMINI_API_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY }, body: JSON.stringify(body),
  }, 20000, 'Gemini vision');
  if (!res.ok) return null;
  const data = await res.json();
  const content = (data.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join('');
  if (!content) return null;
  try { return parseModelJson(content); } catch { return null; }
}

// Pick the OpenRouter model: an explicit per-request model wins; otherwise "auto"
// chooses the best-fit configured model for the task (vision reads images,
// reason/math uses the reasoning model), else the general default.
function pickOpenRouterModel(opts = {}) {
  if (opts.model) return String(opts.model);
  if (opts.task === 'vision') return OPENROUTER_MODEL_VISION;
  if (opts.task === 'reason' || opts.task === 'math') return OPENROUTER_MODEL_REASON;
  return OPENROUTER_MODEL;
}

// OpenRouter — one key, many models via an OpenAI-compatible endpoint. Retries
// once on the safe default model if a chosen model slug is rejected.
async function openrouter(messages, { json = true, temperature = 0.8, maxTokens = 4096, model, task } = {}) {
  const chosen = pickOpenRouterModel({ model, task });
  const call = async (mdl, useJson) => {
    const body = { model: mdl, messages, temperature, max_tokens: maxTokens };
    if (useJson) body.response_format = { type: 'json_object' };
    const res = await fetchWithTimeout(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://sketchlearn.app', 'X-Title': 'SketchLearn' },
      body: JSON.stringify(body),
    }, 45000, 'OpenRouter request');
    if (!res.ok) { const t = await res.text().catch(() => ''); const err = new Error(`OpenRouter API error ${res.status}: ${t.slice(0, 250)}`); err.status = res.status; throw err; }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenRouter');
    return json ? parseModelJson(content) : content;
  };
  try { return await call(chosen, json); }
  catch (e) {
    const msg = String(e && e.message || '');
    // Bad/unknown model slug OR a model that rejects json_object -> retry safely.
    if (chosen !== OPENROUTER_MODEL && /400|404|model|not.*found/i.test(msg)) return call(OPENROUTER_MODEL, json);
    if (json && /response_format|json/i.test(msg)) return call(chosen, false);
    throw e;
  }
}

// Text-provider dispatcher with failover: OpenRouter → Gemini → DeepSeek.
// An explicit opts.provider ('openrouter'|'gemini'|'deepseek'|'moonshot') routes
// straight to that provider when it's configured; 'auto' (or an unavailable
// choice) uses the normal failover order below.
async function generateText(messages, opts = {}) {
  // Report which provider actually produced the text (for "generated by …"
  // attribution). Best-effort, optional.
  const note = (name) => { try { if (opts && typeof opts.onProvider === 'function') opts.onProvider(name); } catch { /* ignore */ } };
  const pick = opts && opts.provider;
  if (pick && pick !== 'auto') {
    if (pick === 'deepseek' && deepseekEnabled) { note('DeepSeek'); return deepseek(messages, opts); }
    if (pick === 'grok' && grokEnabled) { note('Grok'); return grok(messages, opts); }
    if (pick === 'openrouter' && openrouterEnabled) { note('OpenRouter'); return openrouter(messages, opts); }
    if (pick === 'gemini' && geminiEnabled) { note('Gemini'); return gemini(messages, opts); }
    if (pick === 'moonshot' && moonshotEnabled) { note('Kimi'); return moonshot(messages, opts); }
    // Chosen provider isn't configured — fall through to auto failover.
  }
  // Auto: try each configured provider in order and fall through to the next when
  // one fails (e.g. Gemini 503 "high demand") — so a single provider's hiccup no
  // longer fails the whole request. DeepSeek is the DEFAULT (tried first when set).
  const chain = [
    deepseekEnabled && ['DeepSeek', deepseek],
    grokEnabled && ['Grok', grok],
    openrouterEnabled && ['OpenRouter', openrouter],
    geminiEnabled && ['Gemini', gemini],
    moonshotEnabled && ['Kimi', moonshot],
  ].filter(Boolean);
  if (!chain.length) {
    throw new Error('No AI provider key is configured. Set DEEPSEEK_API_KEY, GROK_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY or MOONSHOT_API_KEY in environment variables.');
  }
  let lastErr = null;
  for (let i = 0; i < chain.length; i++) {
    const [name, fn] = chain[i];
    try {
      const out = await fn(messages, opts);
      note(name);
      return out;
    } catch (e) {
      lastErr = e;
      if (i < chain.length - 1) console.warn(`${name} unavailable; trying the next provider:`, String(e && e.message || '').slice(0, 140));
    }
  }
  throw lastErr;
}

async function generateStructured(messages, opts = {}, { attempts = 3 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await generateText(messages, {
        ...opts,
        json: true,
        temperature: i === 0 ? (opts.temperature ?? 0.8) : 0.2,
        maxTokens: Math.min(12288, Math.round((opts.maxTokens || 4096) * Math.pow(1.5, i)))
      });
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message || '');
      // Retry only when the model output is malformed/truncated JSON.
      if (!/invalid JSON|Unterminated string|Unexpected end of JSON input|JSON/i.test(msg)) break;
    }
  }
  throw lastErr || new Error('Could not generate structured JSON');
}

// One attempt at an OpenAI-compatible image API (IMAGE_API_KEY).
async function openaiCompatImage(prompt) {
  try {
    const res = await fetch(IMAGE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${IMAGE_API_KEY}` },
      body: JSON.stringify({ model: IMAGE_API_MODEL, prompt, size: '1024x1024', n: 1 })
    });
    if (!res.ok) { lastImageError = `image API: ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`; return null; }
    const data = await res.json();
    const item = data.data && data.data[0];
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    if (item?.url) return item.url;
  } catch (e) { lastImageError = `image API: ${e.message}`; }
  return null;
}

// xAI Grok image generation — OpenAI-compatible /images/generations. The DEFAULT
// image backend when GROK_API_KEY is set. Grok's image model takes no `size`
// param (it ignores/rejects it), so we omit it. Returns a data URL or hosted URL.
async function grokImage(prompt) {
  try {
    const res = await fetchWithTimeout(GROK_IMAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROK_API_KEY}` },
      body: JSON.stringify({ model: GROK_IMAGE_MODEL, prompt: String(prompt || '').slice(0, 1400), n: 1, response_format: 'b64_json' })
    }, 45000, 'Grok image');
    if (!res.ok) { lastImageError = `grok image: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`; return null; }
    const data = await res.json();
    const item = data.data && data.data[0];
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
    if (item?.url) return item.url;
    lastImageError = 'grok image: response had no image';
  } catch (e) { lastImageError = `grok image: ${e.message}`; }
  return null;
}

// Leonardo AI image generation. Async: create a generation job, then poll for the
// finished image URL. Used as a fallback when Google/Gemini image generation is
// unavailable. Returns a hosted image URL (renders in <img>) or null.
async function leonardoImage(prompt) {
  try {
    const size = LEONARDO_SIZE;
    const create = await fetchWithTimeout(`${LEONARDO_API_BASE}/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${LEONARDO_API_KEY}` },
      body: JSON.stringify({ modelId: LEONARDO_MODEL, prompt: String(prompt || '').slice(0, 1400), width: size, height: size, num_images: 1 })
    }, 30000, 'Leonardo create');
    if (!create.ok) { lastImageError = `leonardo create: ${create.status} ${(await create.text().catch(() => '')).slice(0, 200)}`; return null; }
    const cd = await create.json();
    const genId = cd?.sdGenerationJob?.generationId;
    if (!genId) { lastImageError = 'leonardo: no generationId returned'; return null; }
    // Poll — Leonardo renders asynchronously (usually a few seconds).
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 2500));
      const gr = await fetchWithTimeout(`${LEONARDO_API_BASE}/generations/${genId}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${LEONARDO_API_KEY}` } }, 20000, 'Leonardo poll').catch(() => null);
      if (!gr || !gr.ok) continue;
      const gd = await gr.json();
      const g = gd?.generations_by_pk;
      const url = g?.generated_images?.[0]?.url;
      if (g?.status === 'COMPLETE' && url) return url;
      if (g?.status === 'FAILED') { lastImageError = 'leonardo: generation failed'; return null; }
    }
    lastImageError = 'leonardo: timed out waiting for the image';
  } catch (e) { lastImageError = `leonardo: ${e.message}`; }
  return null;
}

// Replicate.com image generation. Create a prediction on the chosen model (default
// Flux Schnell) with `Prefer: wait` for a near-synchronous result, then poll if it
// isn't done yet. The output is a hosted URL, which we fetch and return as a data
// URL so it stays valid after Replicate's temporary link expires.
async function replicateImage(prompt) {
  try {
    const model = String(REPLICATE_MODEL || 'black-forest-labs/flux-schnell');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${REPLICATE_API_TOKEN}` };
    const create = await fetchWithTimeout(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'wait' },
      body: JSON.stringify({ input: { prompt: String(prompt || '').slice(0, 1600) } }),
    }, 60000, 'Replicate create');
    if (!create.ok) { lastImageError = `replicate: ${create.status} ${(await create.text().catch(() => '')).slice(0, 160)}`; return null; }
    let data = await create.json();
    // Poll if the synchronous wait didn't finish it.
    for (let i = 0; i < 20 && data && data.status && !['succeeded', 'failed', 'canceled'].includes(data.status); i++) {
      await new Promise(r => setTimeout(r, 2000));
      const get = data.urls && data.urls.get;
      if (!get) break;
      const gr = await fetchWithTimeout(get, { headers }, 20000, 'Replicate poll').catch(() => null);
      if (!gr || !gr.ok) continue;
      data = await gr.json();
    }
    if (!data || data.status === 'failed' || data.status === 'canceled') { lastImageError = `replicate: ${(data && (data.error || data.status)) || 'failed'}`; return null; }
    const out = data.output;
    const url = Array.isArray(out) ? out[0] : (typeof out === 'string' ? out : (out && out[0]));
    if (!url) { lastImageError = 'replicate: no output image'; return null; }
    // Fetch the bytes and inline as a data URL (Replicate URLs are temporary).
    const img = await fetchWithTimeout(String(url), {}, 30000, 'Replicate fetch').catch(() => null);
    if (!img || !img.ok) return String(url);
    const ct = img.headers.get('content-type') || 'image/png';
    if (!/^image\//i.test(ct)) return String(url);
    const buf = Buffer.from(await img.arrayBuffer());
    return buf.length ? `data:${ct};base64,${buf.toString('base64')}` : String(url);
  } catch (e) { lastImageError = `replicate: ${e.message}`; return null; }
}

// Pollinations.ai — a FREE, keyless image generator: a plain GET to
// image.pollinations.ai/prompt/<url-encoded prompt> returns the image bytes. We
// fetch them and return a data URL so it's stable (not re-generated on each view).
// This is the always-available final fallback so images work with no API key.
async function pollinationsImage(prompt) {
  try {
    const clean = String(prompt || '').slice(0, 1600);
    const base = String(POLLINATIONS_BASE || 'https://image.pollinations.ai/prompt/').replace(/\/?$/, '/');
    // A fresh random seed each call so repeated presses don't return a cached
    // (sometimes blank) image, and a smaller 768² render so it completes faster.
    const seed = Math.floor(Math.random() * 1e9);
    const url = `${base}${encodeURIComponent(clean)}?width=768&height=768&nologo=true&seed=${seed}&model=${encodeURIComponent(POLLINATIONS_MODEL || 'flux')}`;
    // Keep this UNDER the serverless maxDuration (45s) so a slow render fails fast
    // and the caller can fall back / report a friendly error instead of the whole
    // function being killed by the platform gateway (a raw 504 to the browser).
    const res = await fetchWithTimeout(url, { headers: { Accept: 'image/*' } }, 18000, 'Pollinations image');
    if (!res.ok) { lastImageError = `pollinations: ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`; return null; }
    const ct = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//i.test(ct)) { lastImageError = 'pollinations: non-image response'; return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) { lastImageError = 'pollinations: empty image'; return null; }
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch (e) { lastImageError = `pollinations: ${e.message}`; return null; }
}

// Generate one image. Each backend is tried in order, falling through on failure.
// Default order: OpenAI-compatible API (gpt-image-1, real photos) → Grok →
// Replicate (Flux) → Leonardo → Gemini (Nano Banana) → Pollinations (free, keyless)
// LAST. Pass opts.provider ('openai'|'grok'|'replicate'|'leonardo'|'gemini'|
// 'pollinations') to TRY that backend first (it still falls back to the others).
// Like generateImage but also reports WHICH backend produced the image, so the UI
// can show "made by <provider>" (and reveal when a fallback kicked in). Returns
// { url, provider } — provider is null when nothing worked.
async function generateImageWithMeta(prompt, opts = {}) {
  const backends = {
    openai: () => (IMAGE_API_KEY ? openaiCompatImage(prompt) : null),
    grok: () => (grokEnabled ? grokImage(prompt) : null),
    replicate: () => (replicateEnabled ? replicateImage(prompt) : null),
    leonardo: () => (leonardoEnabled ? leonardoImage(prompt) : null),
    gemini: () => (geminiEnabled ? geminiImage(prompt) : null),
    pollinations: () => (pollinationsEnabled ? pollinationsImage(prompt) : null),
  };
  // Preferred order: Gemini (Nano Banana) → OpenAI (gpt-image-1) → Leonardo → then
  // the rest, with keyless Pollinations always last as the free fallback. Each is
  // skipped unless its API key is configured, so this is the priority among the
  // providers that ARE enabled.
  const defaultOrder = ['gemini', 'openai', 'leonardo', 'grok', 'replicate', 'pollinations'];
  const pick = opts && opts.provider;
  const order = (pick && backends[pick]) ? [pick, ...defaultOrder.filter((p) => p !== pick)] : defaultOrder;
  for (const p of order) {
    const u = await backends[p]();
    if (u) return { url: u, provider: p };
  }
  return { url: null, provider: null };
}

async function generateImage(prompt, opts = {}) {
  const r = await generateImageWithMeta(prompt, opts);
  return r.url;
}

// The last image-generation failure reason (status + message), so callers can
// surface WHY instead of a generic "could not generate".
let lastImageError = '';
function getLastImageError() { return lastImageError; }

// Ask Gemini which models THIS key can actually use and collect the image-capable
// ones (Gemini "*image*" via generateContent, and Imagen "*imagen*" via predict).
// Cached after the first lookup. Different keys/regions expose different image
// model ids, so we discover instead of hard-coding a name.
let _imageModelInfo;   // undefined = not looked up; { generate:[], imagen:[], all:[] }
async function discoverImageModels() {
  if (_imageModelInfo !== undefined) return _imageModelInfo;
  _imageModelInfo = { generate: [], imagen: [], all: [] };
  try {
    const res = await fetchWithTimeout(`${GEMINI_API_BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': GEMINI_API_KEY } }, 8000, 'Gemini models list');
    if (!res.ok) { lastImageError = `models list: ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`; return _imageModelInfo; }
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    for (const m of models) {
      const name = String(m.name || '').replace(/^models\//, '');
      const methods = m.supportedGenerationMethods || [];
      const looksImage = /image/i.test(name) || /image/i.test(m.displayName || '') || /image/i.test(m.description || '');
      if (!looksImage) continue;
      _imageModelInfo.all.push(name);
      if (/imagen/i.test(name) || methods.includes('predict')) _imageModelInfo.imagen.push(name);
      if (methods.includes('generateContent') || (!methods.length && !/imagen/i.test(name))) _imageModelInfo.generate.push(name);
    }
  } catch (e) { lastImageError = `models list error: ${e.message}`; }
  return _imageModelInfo;
}

// One attempt at Gemini's native image generation (generateContent). Returns a
// data URL or null (setting lastImageError).
async function geminiGenerateContentImage(model, prompt) {
  try {
    const res = await fetchWithTimeout(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
    }, 11000, `Gemini image (${model})`);
    if (!res.ok) { lastImageError = `${model}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 180)}`; return null; }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const inline = (parts.find(p => p.inlineData?.data || p.inline_data?.data) || {});
    const d = inline.inlineData || inline.inline_data;
    if (d?.data) return `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`;
    lastImageError = `${model}: response had no image`;
  } catch (e) { lastImageError = `${model}: ${e.message}`; }
  return null;
}

// One attempt at an Imagen model (the :predict endpoint, different request shape).
async function imagenPredictImage(model, prompt) {
  try {
    const res = await fetchWithTimeout(`${GEMINI_API_BASE}/models/${model}:predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } })
    }, 11000, `Imagen (${model})`);
    if (!res.ok) { lastImageError = `${model}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 180)}`; return null; }
    const data = await res.json();
    const pred = (data.predictions || [])[0] || {};
    const b64 = pred.bytesBase64Encoded || pred.image?.bytesBase64Encoded;
    if (b64) return `data:${pred.mimeType || 'image/png'};base64,${b64}`;
    lastImageError = `${model}: predict response had no image`;
  } catch (e) { lastImageError = `${model}: ${e.message}`; }
  return null;
}

// Gemini image generation (returns a base64 data URL). Tries the models the key
// actually exposes (discovered from its model list) using the right endpoint for
// each (generateContent for gemini-*-image, predict for imagen-*), then a few
// well-known ids as fallbacks. On total failure the error lists the image models
// the key DOES expose, so the exact name to set in GEMINI_IMAGE_MODEL is visible.
async function geminiImage(prompt) {
  // Nano Banana (Gemini image) can hang or be very slow. Cap the WHOLE Gemini
  // attempt so we stop trying more models and fall through to the next provider
  // (Pollinations) / the SVG sketch well within the route's budget.
  const deadline = Date.now() + 16000;
  const info = await discoverImageModels();
  // generateContent candidates: discovered first, then configured + known ids.
  const gcModels = [...new Set([...info.generate, GEMINI_IMAGE_MODEL, 'gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-2.0-flash-preview-image-generation'].filter(Boolean))];
  for (const model of gcModels) {
    if (Date.now() > deadline) { lastImageError = 'Gemini image timed out — falling back'; return null; }
    const url = await geminiGenerateContentImage(model, prompt);
    if (url) return url;
  }
  // Imagen candidates (predict endpoint): discovered first, then known ids.
  const imagenModels = [...new Set([...info.imagen, 'imagen-3.0-generate-002', 'imagen-4.0-generate-preview-06-06'].filter(Boolean))];
  for (const model of imagenModels) {
    if (Date.now() > deadline) { lastImageError = 'Gemini image timed out — falling back'; return null; }
    const url = await imagenPredictImage(model, prompt);
    if (url) return url;
  }
  // Nothing worked — help the caller by naming what the key actually has.
  if (info.all.length) lastImageError = `${lastImageError} | image models available to your key: ${info.all.join(', ')} — set GEMINI_IMAGE_MODEL to one of these`;
  else lastImageError = `${lastImageError || 'no image model'} | your Gemini key exposes no image models — enable image generation / Imagen on the key, or upload images`;
  return null;
}

// A TEXT-model fallback "image": ask the configured text model (Gemini/Kimi/
// DeepSeek/OpenRouter — whatever works for this deployment) to draw a friendly
// hand-sketched SVG of the subject, returned as an image data URL. This lets the
// 🎨 / 🖼️ buttons still produce a picture on keys that have text but NO image
// model (e.g. where Gemini image generation is unavailable). Renders in <img>.
async function generateSvgSketch(brief) {
  if (!(openrouterEnabled || geminiEnabled || deepseekEnabled || moonshotEnabled)) return null;
  const system = 'You are an illustrator. You reply with ONLY a single self-contained <svg>…</svg> and nothing else.';
  const user = `Draw a clean, friendly hand-sketched SVG illustration that represents: "${String(brief || 'a learning tool').slice(0, 400)}".
Requirements:
- Return ONLY the <svg>...</svg> markup — no prose, no code fences, no markdown.
- One <svg> with viewBox "0 0 400 300". No <script>, no external images, no <foreignObject>, no href except "#".
- Hand-sketched style: stroke="#2d2a26" stroke-width="2.5" stroke-linecap="round", slightly irregular strokes. Fills ONLY from this palette: #f9a03f orange, #7fb069 green, #5c80bc blue, #e4572e red, #f7f3e9 paper, #fadf63 yellow.
- Depict the idea with real objects or a gentle visual metaphor — warm, uplifting, readable small. A few <text> labels (font-size 14+) are fine; keep it mostly visual.`;
  try {
    // json:false — we want the raw SVG text back, not JSON-parsed.
    const text = await generateText([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.7, maxTokens: 2200, json: false });
    const svg = sanitizeSvg(String(text || ''));
    if (!svg || !/<svg[\s>]/i.test(svg)) return null;
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  } catch { return null; }
}

// Best-effort picture: a real generated image if an image model is available,
// otherwise a text-model SVG sketch. Always the same shape (data URL or null).
async function generateImageOrSketch(prompt, brief) {
  const img = await generateImage(prompt);
  if (img) return img;
  return generateSvgSketch(brief || prompt);
}

// Turn any {type:"image", prompt} components into real images; drop ones that fail.
async function fillImages(components) {
  for (const c of components) {
    if (c && c.type === 'image' && !c.url && c.prompt) {
      c.url = await generateImage(`${c.prompt}. Educational illustration in a hand-drawn sketch / paper-collage style, muted warm palette (paper cream, soft orange, green, blue), clear and uncluttered.`);
      if (!c.url) c.url = fallbackImageDataUrl(c.prompt, c.caption);
      delete c.prompt;
    }
  }
  return components.filter(c => !(c && c.type === 'image' && !c.url));
}

// Ask Claude (Anthropic Messages API) to DRAW one concept-accurate SVG for a slide.
// `brief` describes exactly what this slide teaches; `context` carries the concept,
// level and recent history so the drawing stays consistent with the lesson's progress.
async function generateSvgWithClaude(brief, context = {}) {
  if (!claudeSvgEnabled) return null;
  const historyLine = (context.history && context.history.length)
    ? `The lesson so far: ${context.history.map(h => h.title).filter(Boolean).join(' → ')}.`
    : 'This is the first slide of the lesson.';
  const prompt = `You are illustrating ONE slide of a "${context.topic}" lesson for a ${context.level} learner. The current concept is "${context.concept}". ${historyLine}

Draw a single self-contained SVG that ACCURATELY depicts what THIS slide teaches:
"""
${brief}
"""

Requirements:
- Return ONLY the <svg>...</svg> markup, nothing else — no prose, no code fences, no markdown.
- One <svg> with a viewBox around "0 0 400 260". No <script>, no external images, no <foreignObject>, no href to anything but "#".
- Hand-sketched style: stroke="#2d2a26" stroke-width="2.5" stroke-linecap="round", slightly irregular strokes. Fills ONLY from this palette: #f9a03f orange, #7fb069 green, #5c80bc blue, #e4572e red, #f7f3e9 paper, #fadf63 yellow.
- The drawing must genuinely illustrate the SPECIFIC idea (a real diagram/graph/labeled figure or clear visual metaphor), NOT a generic decorative shape. Label the important parts with <text> (font-size 14 or larger).
- Build on the earlier slides where it helps continuity, but this drawing must stand on its own for the current concept.`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) { console.error('Anthropic SVG error', res.status, (await res.text().catch(() => '')).slice(0, 200)); return null; }
    const data = await res.json();
    const text = Array.isArray(data.content)
      ? data.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : '';
    const svg = sanitizeSvg(text);
    return svg || null;
  } catch (e) { console.error('Claude SVG generation failed:', e.message); return null; }
}

// Replace (or add) a slide's SVG with a Claude-drawn one, using the slide's own
// text as the drawing brief so the illustration matches the lesson exactly.
async function illustrateWithClaude(slide, context) {
  if (!claudeSvgEnabled) return;
  const brief = [
    slide.title,
    slide.summary,
    ...(slide.components || []).filter(c => c.type === 'text').map(c => c.content),
    ...(slide.components || []).filter(c => c.type === 'definition').map(c => `${c.term}: ${c.content}`)
  ].filter(Boolean).join(' ').slice(0, 1500);

  const svg = await generateSvgWithClaude(brief, context);
  if (!svg) return; // keep DeepSeek's own svg (if any) on failure
  const caption = slide.components?.find(c => c.type === 'svg')?.caption || '';
  // drop DeepSeek's svg components, then add Claude's illustration once
  slide.components = (slide.components || []).filter(c => c.type !== 'svg');
  slide.components.push({ type: 'svg', svg, caption, drawnBy: 'claude' });
}

// ElevenLabs text-to-speech for the language listening/spelling activities.
// Returns { audio: base64 data URL | null, error: string | null } so the caller can
// surface the real reason (401 bad key, 402 quota, …) instead of a silent failure.
async function generateSpeech(text, voiceId) {
  if (!ttsEnabled) return { audio: null, error: 'ElevenLabs not configured (set ELEVENLABS_API_KEY).' };
  const clean = String(text || '').trim().slice(0, 600);
  if (!clean) return { audio: null, error: 'No text to speak.' };
  const key = String(ELEVENLABS_API_KEY || '').trim(); // trim stray spaces/newlines from the env value
  if (!key) return { audio: null, error: 'ELEVENLABS_API_KEY is empty.' };
  const base = String(ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
  // A caller-chosen voice (a valid ElevenLabs voice id) overrides the default.
  const voice = /^[A-Za-z0-9]{16,40}$/.test(String(voiceId || '')) ? String(voiceId) : ELEVENLABS_VOICE_ID;
  try {
    const res = await fetchWithTimeout(`${base}/text-to-speech/${voice}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: clean, model_id: ELEVENLABS_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    }, 30000, 'ElevenLabs TTS');
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.error('ElevenLabs error', res.status, detail);
      let hint = '';
      if (/unusual[_ ]?activity|abuse|vpn|proxy/i.test(detail)) hint = ' — ElevenLabs free tier blocks requests from cloud/server IPs (like Vercel). A paid ElevenLabs plan (even the cheapest) removes this block.';
      else if (res.status === 401 || /unauthor|invalid.?api|missing.?api/i.test(detail)) hint = ' — key rejected: confirm ELEVENLABS_API_KEY is exact, that the key has Text-to-Speech permission (unrestricted), and that you redeployed after adding it.';
      else if (res.status === 402 || /quota|credit|limit/i.test(detail)) hint = ' — ElevenLabs character quota/credits exhausted for this key.';
      return { audio: null, error: `ElevenLabs ${res.status}: ${detail || 'request rejected'}${hint}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { audio: `data:audio/mpeg;base64,${buf.toString('base64')}`, error: null };
  } catch (e) { console.error('TTS failed:', e.message); return { audio: null, error: e.message }; }
}

const SKETCH_SVG_RULES = `SVG rules: self-contained <svg> with a viewBox (around 0 0 400 260), no external references, no scripts, no <text> smaller than 14px. Draw in a hand-sketched style: stroke-based shapes with stroke="#2d2a26" stroke-width="2.5" stroke-linecap="round", slightly irregular lines, fills only from this palette: #f9a03f (orange), #7fb069 (green), #5c80bc (blue), #e4572e (red), #f7f3e9 (paper), #fadf63 (yellow). CRITICAL: the drawing must accurately depict THIS slide's specific concept — a real diagram, labeled figure, graph, or visual metaphor of what the paragraphs explain. Label its parts with <text> so a viewer can map the picture onto the idea. A generic, decorative, or unrelated shape (a plain circle, a random zig-zag) is unacceptable; if the concept is a process show the steps, if it is a relationship show the axes/quantities, if it is a structure show and name the parts.`;

// Look up CURRENT public API prices for a set of models using OpenRouter's web
// search (the ':online' model suffix). Returns { data } with the parsed price
// table, or { error }. Best-effort — web-sourced prices are estimates.
async function fetchModelPricesOnline(models) {
  if (!openrouterEnabled) return { error: 'Web price search needs OPENROUTER_API_KEY (OpenRouter provides the web results).' };
  const list = (Array.isArray(models) ? models : [])
    .map((m) => `- provider "${m.provider}", ${m.kind} model "${m.model}" (${m.label})`).join('\n');
  const sys = 'You are a pricing researcher with live web access. Search the web for the vendors\' CURRENT public API prices and answer ONLY with strict JSON.';
  const user = `Find today's public API prices for these AI models:\n${list}\n\nReturn strictly this JSON shape:\n{"text":{"<provider>":{"in":<USD per 1K INPUT tokens>,"out":<USD per 1K OUTPUT tokens>}},"image":{"<provider>":<USD per generated image>}}\nRules: use the exact provider keys given. Put text models under "text" and image models under "image". Free services (e.g. pollinations) are 0. Convert any per-million-token price to per-1K (divide by 1000). Give your best current number for each; do not omit a provider. No commentary, JSON only.`;
  try {
    const res = await fetchWithTimeout(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://sketchlearn.app', 'X-Title': 'SketchLearn' },
      body: JSON.stringify({
        model: `${OPENROUTER_MODEL_REASON || OPENROUTER_MODEL}:online`,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0.1, max_tokens: 1400, response_format: { type: 'json_object' },
      }),
    }, 60000, 'OpenRouter web price search');
    if (!res.ok) { const t = await res.text().catch(() => ''); return { error: `OpenRouter ${res.status}: ${t.slice(0, 200)}` }; }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { error: 'Empty response from the price search.' };
    const parsed = parseModelJson(content);
    if (!parsed || typeof parsed !== 'object') return { error: 'Could not parse the price results.' };
    return { data: parsed };
  } catch (e) { return { error: (e && e.message) || 'Price search failed.' }; }
}

module.exports = {
  parseModelJson,
  fetchModelPricesOnline,
  deepseek,
  gemini,
  moonshot,
  grok,
  generateText,
  generateStructured, geminiDoc,
  geminiSearchVideos,
  generateVisionJSON,
  generateImage,
  generateImageWithMeta,
  geminiImage,
  grokImage,
  leonardoImage,
  replicateImage,
  pollinationsImage,
  generateSvgSketch,
  generateImageOrSketch,
  getLastImageError,
  fillImages,
  generateSvgWithClaude,
  illustrateWithClaude,
  generateSpeech,
  SKETCH_SVG_RULES
};
