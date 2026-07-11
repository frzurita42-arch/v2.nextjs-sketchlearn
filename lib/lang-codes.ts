/* Map a human language name to a BCP-47 code for the browser Speech Recognition
 * API (and TTS hints). Falls back to English. */
const CODES: Record<string, string> = {
  english: 'en-US',
  spanish: 'es-ES',
  'mandarin chinese': 'zh-CN',
  mandarin: 'zh-CN',
  chinese: 'zh-CN',
  hindi: 'hi-IN',
  arabic: 'ar-SA',
  french: 'fr-FR',
  portuguese: 'pt-PT',
  japanese: 'ja-JP',
  german: 'de-DE',
  italian: 'it-IT',
};

export function langCode(name: string): string {
  const key = String(name || '').trim().toLowerCase();
  if (CODES[key]) return CODES[key];
  // Try a loose contains match (e.g. "Brazilian Portuguese").
  for (const [k, v] of Object.entries(CODES)) if (key.includes(k)) return v;
  return 'en-US';
}
