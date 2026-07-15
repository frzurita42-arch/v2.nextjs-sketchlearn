/* AI provider layer: DeepSeek + Gemini text, structured-JSON generation with
 * failover/retry, image generation, and Claude SVG illustration. */
const {
  DEEPSEEK_API_KEY, DEEPSEEK_URL, deepseekEnabled,
  GEMINI_API_KEY, GEMINI_API_BASE, GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL, geminiEnabled,
  OPENROUTER_API_KEY, OPENROUTER_URL, OPENROUTER_MODEL, OPENROUTER_MODEL_REASON, OPENROUTER_MODEL_VISION, openrouterEnabled,
  MOONSHOT_API_KEY, MOONSHOT_URL, MOONSHOT_MODEL, moonshotEnabled,
  IMAGE_API_KEY, IMAGE_API_URL, IMAGE_API_MODEL,
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
  const pick = opts && opts.provider;
  if (pick && pick !== 'auto') {
    if (pick === 'openrouter' && openrouterEnabled) return openrouter(messages, opts);
    if (pick === 'gemini' && geminiEnabled) return gemini(messages, opts);
    if (pick === 'moonshot' && moonshotEnabled) return moonshot(messages, opts);
    if (pick === 'deepseek' && deepseekEnabled) return deepseek(messages, opts);
    // Chosen provider isn't configured — fall through to auto failover.
  }
  // Auto: try each configured provider in order and fall through to the next when
  // one fails (e.g. Gemini 503 "high demand") — so a single provider's hiccup no
  // longer fails the whole request.
  const chain = [
    openrouterEnabled && ['OpenRouter', openrouter],
    geminiEnabled && ['Gemini', gemini],
    moonshotEnabled && ['Kimi', moonshot],
    deepseekEnabled && ['DeepSeek', deepseek],
  ].filter(Boolean);
  if (!chain.length) {
    throw new Error('No AI provider key is configured. Set OPENROUTER_API_KEY, GEMINI_API_KEY, MOONSHOT_API_KEY or DEEPSEEK_API_KEY in environment variables.');
  }
  let lastErr = null;
  for (let i = 0; i < chain.length; i++) {
    const [name, fn] = chain[i];
    try {
      return await fn(messages, opts);
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

// Generate one image. Prefers an OpenAI-compatible provider, else Gemini's image model.
async function generateImage(prompt) {
  if (IMAGE_API_KEY) {
    try {
      const res = await fetch(IMAGE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${IMAGE_API_KEY}` },
        body: JSON.stringify({ model: IMAGE_API_MODEL, prompt, size: '1024x1024', n: 1 })
      });
      if (!res.ok) { console.error('Image API error', res.status, (await res.text().catch(() => '')).slice(0, 200)); return null; }
      const data = await res.json();
      const item = data.data && data.data[0];
      if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
      if (item?.url) return item.url;
    } catch (e) { console.error('Image generation failed:', e.message); }
    return null;
  }
  if (geminiEnabled) return geminiImage(prompt);
  return null;
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
    const res = await fetch(`${GEMINI_API_BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': GEMINI_API_KEY } });
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
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
    });
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
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } })
    });
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
  const info = await discoverImageModels();
  // generateContent candidates: discovered first, then configured + known ids.
  const gcModels = [...new Set([...info.generate, GEMINI_IMAGE_MODEL, 'gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-2.0-flash-preview-image-generation'].filter(Boolean))];
  for (const model of gcModels) {
    const url = await geminiGenerateContentImage(model, prompt);
    if (url) return url;
  }
  // Imagen candidates (predict endpoint): discovered first, then known ids.
  const imagenModels = [...new Set([...info.imagen, 'imagen-3.0-generate-002', 'imagen-4.0-generate-preview-06-06'].filter(Boolean))];
  for (const model of imagenModels) {
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
async function generateSpeech(text) {
  if (!ttsEnabled) return { audio: null, error: 'ElevenLabs not configured (set ELEVENLABS_API_KEY).' };
  const clean = String(text || '').trim().slice(0, 600);
  if (!clean) return { audio: null, error: 'No text to speak.' };
  const key = String(ELEVENLABS_API_KEY || '').trim(); // trim stray spaces/newlines from the env value
  if (!key) return { audio: null, error: 'ELEVENLABS_API_KEY is empty.' };
  const base = String(ELEVENLABS_API_URL || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
  try {
    const res = await fetchWithTimeout(`${base}/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
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

module.exports = {
  parseModelJson,
  deepseek,
  gemini,
  moonshot,
  generateText,
  generateStructured, geminiDoc,
  generateVisionJSON,
  generateImage,
  geminiImage,
  generateSvgSketch,
  generateImageOrSketch,
  getLastImageError,
  fillImages,
  generateSvgWithClaude,
  illustrateWithClaude,
  generateSpeech,
  SKETCH_SVG_RULES
};
