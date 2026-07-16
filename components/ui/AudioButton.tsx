'use client';
/* Reusable text-to-speech speaker. Plays `text` via the server TTS proxy
 * (ElevenLabs) in the chosen voice. It is an EMOJI, not a button box: 🔊 to play,
 * and while playing it becomes 🔇 (click to stop & rewind, click again to restart
 * from the beginning). Falls back to showing the text + the real error when audio
 * is unavailable. Used by the language slides, the reading text, and coach chat. */
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';

export function AudioButton({ text, voiceId, size = 18, showTextOnFail = true, title = 'Play audio' }: {
  text: string; voiceId?: string; size?: number; showTextOnFail?: boolean; title?: string;
  // `label`/`small` kept optional for older call sites but no longer used (emoji only).
  label?: string; small?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcRef = useRef<string | null>(null);
  // Stop playback if this button unmounts (e.g. the learner clicks Next mid-audio).
  useEffect(() => () => { try { audioRef.current?.pause(); } catch { /* ignore */ } }, []);
  // If the TEXT or VOICE changes, drop the cached clip and reset — otherwise it
  // would replay the previous slide's audio (or the old voice).
  useEffect(() => { try { audioRef.current?.pause(); } catch { /* ignore */ } srcRef.current = null; setState('idle'); setPlaying(false); setErr(''); }, [text, voiceId]);

  const startFromBeginning = () => {
    const a = audioRef.current;
    if (!a) return;
    try { a.currentTime = 0; } catch { /* ignore */ }
    a.play().catch(() => {});
  };

  // Click toggles: playing → STOP (rewind so the next click restarts); otherwise
  // play from the start. First press fetches the audio, then plays.
  const toggle = async () => {
    if (playing) {
      const a = audioRef.current;
      if (a) { try { a.pause(); a.currentTime = 0; } catch { /* ignore */ } }
      setPlaying(false);
      return;
    }
    if (srcRef.current) { startFromBeginning(); return; }
    setState('loading');
    try {
      const r = await API.post('/api/ai/language/tts', { text, voiceId: voiceId || '' });
      if (r?.audio) { srcRef.current = r.audio; setState('ready'); setTimeout(startFromBeginning, 50); }
      else { setErr(r?.error || ''); setState('unavailable'); }
    } catch (e: any) { setErr(e?.message || ''); setState('unavailable'); }
  };

  const glyph = state === 'loading' ? '…' : state === 'unavailable' ? '🔈' : playing ? '🔇' : '🔊';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, verticalAlign: 'middle' }}>
      <span role="button" tabIndex={0} aria-label={playing ? 'Stop audio' : title}
        title={playing ? 'Stop — click again to replay' : title}
        onClick={() => { if (state !== 'loading') toggle(); }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && state !== 'loading') { e.preventDefault(); toggle(); } }}
        style={{ cursor: state === 'loading' ? 'wait' : 'pointer', fontSize: size, lineHeight: 1, userSelect: 'none', opacity: state === 'unavailable' ? 0.6 : 1 }}>
        {glyph}
      </span>
      {srcRef.current && <audio ref={audioRef} src={srcRef.current}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />}
      {state === 'unavailable' && showTextOnFail && (
        <small style={{ fontStyle: 'italic', opacity: 0.85 }}>“{text}” (showing text{err ? ` — ${err}` : ''})</small>
      )}
    </span>
  );
}
