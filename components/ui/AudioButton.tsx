'use client';
/* Reusable text-to-speech button. Plays `text` via the server TTS proxy
 * (ElevenLabs). Falls back to showing the text + the real error when audio is
 * unavailable. Used by the language listening/spelling slides and coach chat. */
import { useRef, useState } from 'react';
import { API } from '@/lib/api';

export function AudioButton({ text, label = '🔊 Play', small = false, showTextOnFail = true }: {
  text: string; label?: string; small?: boolean; showTextOnFail?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [err, setErr] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcRef = useRef<string | null>(null);

  const play = async () => {
    if (srcRef.current) { audioRef.current?.play().catch(() => {}); return; }
    setState('loading');
    try {
      const r = await API.post('/api/ai/language/tts', { text });
      if (r?.audio) { srcRef.current = r.audio; setState('ready'); setTimeout(() => audioRef.current?.play().catch(() => {}), 50); }
      else { setErr(r?.error || ''); setState('unavailable'); }
    } catch (e: any) { setErr(e?.message || ''); setState('unavailable'); }
  };

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button className={`btn ${small ? 'small ' : ''}blue`} type="button" title="Play audio" onClick={play} disabled={state === 'loading'}>
        {state === 'loading' ? '…' : state === 'unavailable' ? '🔇 Audio off' : label}
      </button>
      {srcRef.current && <audio ref={audioRef} src={srcRef.current} />}
      {state === 'unavailable' && showTextOnFail && (
        <small style={{ fontStyle: 'italic', opacity: 0.85 }}>“{text}” (showing text{err ? ` — ${err}` : ''})</small>
      )}
    </span>
  );
}
