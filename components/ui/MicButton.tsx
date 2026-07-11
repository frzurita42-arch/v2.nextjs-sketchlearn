'use client';
/* Reusable speech-to-text mic button using the browser's built-in Web Speech API
 * (no backend, no key). Progressive enhancement: renders nothing when the browser
 * doesn't support it. Set `lang` (BCP-47) so it transcribes in the right language;
 * `onText` receives the recognized transcript. */
import { useEffect, useRef, useState } from 'react';

export function MicButton({ lang = 'en-US', onText, title = 'Speak your answer', small = true, append = false }: {
  lang?: string; onText: (text: string, append: boolean) => void; title?: string; small?: boolean; append?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR = (typeof window !== 'undefined') && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setSupported(!!SR);
    return () => { try { recRef.current?.stop(); } catch { /* ignore */ } };
  }, []);

  const toggle = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { try { recRef.current?.stop(); } catch { /* ignore */ } return; }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0]?.transcript || '').join(' ').trim();
      if (t) onText(t, append);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  if (!supported) return null;
  return (
    <button
      type="button"
      className={`btn ${small ? 'small ' : ''}${listening ? 'red' : 'ghost'}`}
      title={listening ? 'Listening… tap to stop' : title}
      aria-label={title}
      aria-pressed={listening}
      onClick={toggle}
    >
      {listening ? '● Listening…' : '🎤'}
    </button>
  );
}
