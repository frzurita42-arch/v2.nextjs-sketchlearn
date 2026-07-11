/* Connector registry — the single source of truth for every external API the
 * platform can plug into. Each connector DECLARES the env var(s) that turn it on;
 * it "lights up" automatically the moment those keys exist in the environment and
 * stays dormant (but visible) otherwise. Nothing here calls an API — this is the
 * catalogue + availability + graceful-degradation resolver that the rest of the
 * app reads so a tool can say "I need a `text` model" or "I need `flights` data"
 * without hard-coding a vendor.
 *
 * To add a new API to the whole platform: add one entry below. No other file has
 * to change to make the site AWARE of it (wiring the actual fetch is a separate,
 * per-connector step). This is the "make space for all the APIs; use them if the
 * key is set, adapt if not" foundation. */
const { hasConfiguredKey } = require('./config');

// kind: what the connector produces — steers which UI/action components can use it.
//   text  = language model (chat / structured generation)
//   image = image generation
//   audio = speech / voice
//   data  = a data source you fetch + display (dashboards, cards, maps)
//   comms = outbound messaging (email / sms)
//   compute = factual/computational answers
// envKeys: ALL must be present for the connector to be "available". Empty array =
//   always available (no key needed, e.g. browser Web Speech, free open endpoints).
const CONNECTORS = [
  // ---------- AI: text / chat / structured ----------
  { id: 'gemini',   name: 'Google Gemini',   kind: 'text',  category: 'AI',
    envKeys: ['GEMINI_API_KEY'], capabilities: ['text', 'image'],
    docs: 'https://ai.google.dev/', blurb: 'Fast multimodal model — default text + native image generation.' },
  { id: 'deepseek', name: 'DeepSeek',        kind: 'text',  category: 'AI',
    envKeys: ['DEEPSEEK_API_KEY'], capabilities: ['text'],
    docs: 'https://api-docs.deepseek.com/', blurb: 'Text failover provider.' },
  { id: 'grok',     name: 'xAI Grok',        kind: 'text',  category: 'AI',
    envKeys: ['XAI_API_KEY'], capabilities: ['text', 'image', 'live-social'],
    docs: 'https://docs.x.ai/', blurb: 'Chat + image gen + real-time X/Twitter signal. Permissive content policy.' },
  { id: 'anthropic', name: 'Anthropic Claude', kind: 'text', category: 'AI',
    envKeys: ['ANTHROPIC_API_KEY'], capabilities: ['text', 'svg'],
    docs: 'https://docs.anthropic.com/', blurb: 'High-accuracy SVG/diagram drawing + reasoning.' },

  // ---------- AI: image ----------
  { id: 'openai-image', name: 'OpenAI-compatible Images', kind: 'image', category: 'AI',
    envKeys: ['IMAGE_API_KEY'], capabilities: ['image'],
    docs: 'https://platform.openai.com/docs/guides/images', blurb: 'Dedicated image-generation endpoint.' },

  // ---------- Voice ----------
  { id: 'elevenlabs', name: 'ElevenLabs', kind: 'audio', category: 'Voice',
    envKeys: ['ELEVENLABS_API_KEY'], capabilities: ['tts'],
    docs: 'https://elevenlabs.io/docs', blurb: 'High-quality multilingual text-to-speech.' },
  { id: 'web-speech', name: 'Browser Web Speech', kind: 'audio', category: 'Voice',
    envKeys: [], capabilities: ['stt'],
    docs: 'https://developer.mozilla.org/docs/Web/API/Web_Speech_API', blurb: 'Client-side speech-to-text, no key. Chrome/Edge/Safari.' },

  // ---------- Compute / knowledge ----------
  { id: 'wolfram', name: 'Wolfram Alpha', kind: 'compute', category: 'Knowledge',
    envKeys: ['WOLFRAM_APP_ID'], capabilities: ['compute', 'facts'],
    docs: 'https://products.wolframalpha.com/llm-api/documentation', blurb: 'Math, units, science, factual computation. LLM-friendly API.' },

  // ---------- Data: web / social / news ----------
  { id: 'newsapi', name: 'News', kind: 'data', category: 'Web & Social',
    envKeys: ['NEWS_API_KEY'], capabilities: ['news'],
    docs: 'https://newsapi.org/docs', blurb: 'Headlines & articles for feeds, dashboards, current-events tools.' },
  { id: 'reddit', name: 'Reddit', kind: 'data', category: 'Web & Social',
    envKeys: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'], capabilities: ['social'],
    docs: 'https://www.reddit.com/dev/api/', blurb: 'Subreddit content & sentiment. Check current API terms/pricing.' },
  { id: 'youtube', name: 'YouTube Data', kind: 'data', category: 'Web & Social',
    envKeys: ['YOUTUBE_API_KEY'], capabilities: ['video-search', 'embed'],
    docs: 'https://developers.google.com/youtube/v3', blurb: 'Video search & metadata for embeds and feeds.' },

  // ---------- Data: travel / tracking (niche builders) ----------
  { id: 'flights', name: 'Flights (Amadeus)', kind: 'data', category: 'Travel',
    envKeys: ['AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET'], capabilities: ['flights', 'hotels'],
    docs: 'https://developers.amadeus.com/', blurb: 'Flight & hotel search, fares, deals.' },
  { id: 'flight-tracking', name: 'Live Aircraft (OpenSky)', kind: 'data', category: 'Travel',
    envKeys: [], capabilities: ['aircraft-tracking'],
    docs: 'https://openskynetwork.github.io/opensky-api/', blurb: 'Live ADS-B aircraft positions. Free tier, no key for basic use.' },
  { id: 'maritime', name: 'Ship Tracking (AIS)', kind: 'data', category: 'Travel',
    envKeys: ['AISHUB_API_KEY'], capabilities: ['ship-tracking'],
    docs: 'https://www.aishub.net/', blurb: 'Live vessel positions for port/logistics tools.' },

  // ---------- Data: markets / crypto ----------
  { id: 'stocks', name: 'Markets (Alpha Vantage)', kind: 'data', category: 'Finance',
    envKeys: ['ALPHAVANTAGE_API_KEY'], capabilities: ['stocks', 'forex'],
    docs: 'https://www.alphavantage.co/documentation/', blurb: 'Equities, FX, indicators for finance dashboards.' },
  { id: 'crypto', name: 'Crypto (CoinGecko)', kind: 'data', category: 'Finance',
    envKeys: [], capabilities: ['crypto'],
    docs: 'https://www.coingecko.com/en/api', blurb: 'Coin prices & market data. Free tier, no key for basics.' },

  // ---------- Data: place / weather / space ----------
  { id: 'maps', name: 'Maps (Mapbox)', kind: 'data', category: 'Place & Earth',
    envKeys: ['MAPBOX_TOKEN'], capabilities: ['maps', 'geocoding'],
    docs: 'https://docs.mapbox.com/', blurb: 'Interactive maps, geocoding, places for location tools.' },
  { id: 'weather', name: 'Weather (OpenWeather)', kind: 'data', category: 'Place & Earth',
    envKeys: ['OPENWEATHER_API_KEY'], capabilities: ['weather'],
    docs: 'https://openweathermap.org/api', blurb: 'Current & forecast weather for planners and alerts.' },
  { id: 'space', name: 'Space (NASA / Launch Library)', kind: 'data', category: 'Place & Earth',
    envKeys: [], capabilities: ['space', 'launches'],
    docs: 'https://api.nasa.gov/', blurb: 'NASA imagery + rocket-launch schedule (pairs with countdown).' },

  // ---------- Data: media / entertainment ----------
  { id: 'tmdb', name: 'Film & TV (TMDB)', kind: 'data', category: 'Media',
    envKeys: ['TMDB_API_KEY'], capabilities: ['film-tv'],
    docs: 'https://developer.themoviedb.org/', blurb: 'Movie/TV metadata for watchlists & pickers.' },

  // ---------- Comms: outbound ----------
  { id: 'email', name: 'Email (Resend)', kind: 'comms', category: 'Notifications',
    envKeys: ['RESEND_API_KEY'], capabilities: ['email'],
    docs: 'https://resend.com/docs', blurb: 'Transactional email. Needs a verified sending domain (SPF/DKIM).' },
  { id: 'sms', name: 'SMS / WhatsApp (Twilio)', kind: 'comms', category: 'Notifications',
    envKeys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], capabilities: ['sms', 'whatsapp'],
    docs: 'https://www.twilio.com/docs', blurb: 'SMS & WhatsApp notifications for schedulers/alerts.' },
];

function isAvailable(conn) {
  // No keys required → always available. Otherwise every declared key must be set.
  return conn.envKeys.every(k => hasConfiguredKey(process.env[k]));
}

// Public view of one connector — never leaks key VALUES, only whether it's on.
function describe(conn) {
  return {
    id: conn.id,
    name: conn.name,
    kind: conn.kind,
    category: conn.category,
    capabilities: conn.capabilities,
    blurb: conn.blurb,
    docs: conn.docs,
    available: isAvailable(conn),
    // which keys are still missing, so an admin knows what to add (names only)
    missingKeys: conn.envKeys.filter(k => !hasConfiguredKey(process.env[k])),
  };
}

// The whole catalogue, each annotated with live availability.
function listConnectors() {
  return CONNECTORS.map(describe);
}

// Graceful degradation: given a capability (e.g. 'text', 'image', 'flights'),
// return the first AVAILABLE connector's id that provides it, honoring an optional
// preference order, else null so the caller can adapt/fallback.
function resolveCapability(capability, prefer = []) {
  const providers = CONNECTORS.filter(c => c.capabilities.includes(capability) && isAvailable(c));
  if (!providers.length) return null;
  for (const id of prefer) {
    const hit = providers.find(c => c.id === id);
    if (hit) return hit.id;
  }
  return providers[0].id;
}

// Does the platform have ANY provider for this capability right now?
function hasCapability(capability) {
  return CONNECTORS.some(c => c.capabilities.includes(capability) && isAvailable(c));
}

module.exports = { CONNECTORS, listConnectors, describe, resolveCapability, hasCapability, isAvailable };
