// Text-to-speech helpers shared by the lesson player. A small set of ElevenLabs
// public preset voices the learner can pick from, plus a lightweight "speak one
// word" utility used for click-to-pronounce (separate from the AudioButton, which
// owns the whole-text speaker + its play/stop state).
import { API } from '@/lib/api';

export const TTS_VOICES: { id: string; label: string }[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel · warm female' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella · soft female' },
  { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi · strong female' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli · young female' },
  { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni · calm male' },
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam · deep male' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh · young male' },
  { id: 'VR6AewLTigWG4xSOukaG', label: 'Arnold · bold male' },
];

// Trim word-attached punctuation before speaking so "café." reads as "café".
export function cleanWordForSpeech(w: string): string {
  return String(w || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
}

// Cache generated clips per (voice, text) so re-clicking a word is instant, and
// keep ONE audio element so a new word interrupts the previous one.
const wordCache = new Map<string, string>();
let wordAudio: HTMLAudioElement | null = null;

// Play a single word/phrase's pronunciation in the target language. Best-effort:
// silently does nothing when TTS isn't configured.
export async function speakWord(text: string, voiceId?: string): Promise<void> {
  const clean = cleanWordForSpeech(text);
  if (!clean) return;
  const key = `${voiceId || ''}:${clean}`;
  try {
    if (wordAudio) { try { wordAudio.pause(); } catch { /* ignore */ } }
    let src = wordCache.get(key);
    if (!src) {
      const r = await API.post('/api/ai/language/tts', { text: clean, voiceId: voiceId || '' });
      if (!r?.audio) return;
      src = r.audio as string;
      wordCache.set(key, src);
    }
    wordAudio = new Audio(src);
    await wordAudio.play().catch(() => { /* autoplay/gesture guard */ });
  } catch { /* ignore */ }
}
