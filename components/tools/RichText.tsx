'use client';
/* A text value with speaker (TTS) + translate actions. Used in app entry
 * displays and inside the lesson player, so any content can be read aloud or
 * translated. The speaker and translate controls are EMOJIS (🔊 / 🌐), not
 * buttons. When `speakable` is set (a language lesson), every WORD is clickable
 * to hear its pronunciation on its own, in the chosen voice. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { AudioButton } from '@/components/ui/AudioButton';
import { renderInlineMath } from '@/components/ui/shared';
import { speakWord, cleanWordForSpeech } from '@/lib/tts';

export function RichText({ text, translateTo = 'English', block = false, speakable = false, voiceId }: {
  text: string; translateTo?: string; block?: boolean; speakable?: boolean; voiceId?: string;
}) {
  const [tr, setTr] = useState('');        // cached translation for THIS text
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  // Turning to a new slide reuses this component with new text — drop the previous
  // slide's translation and hide it, so each slide starts untranslated.
  useEffect(() => { setTr(''); setShown(false); setBusy(false); }, [text]);
  if (!text) return <></>;
  const speak = text.replace(/\$/g, '');            // don't read the math delimiters aloud
  // Toggle: show the translation, or hide it if it's already showing. Cached once.
  const toggle = async () => {
    if (shown) { setShown(false); return; }
    if (tr) { setShown(true); return; }
    setBusy(true);
    try { const r = await API.post('/api/tools/translate', { text: speak, to: translateTo }); if (r?.translation) { setTr(r.translation); setShown(true); } } catch { /* ignore */ }
    setBusy(false);
  };

  // The body: either KaTeX-typeset prose (STEM), or — for a language lesson —
  // word-by-word clickable text so each word can be pronounced on its own.
  const body = speakable
    ? <span>{text.split(/(\s+)/).map((tok, i) => {
        if (/^\s+$/.test(tok) || !cleanWordForSpeech(tok)) return <span key={i}>{tok}</span>;
        return <span key={i} className="sl-word" title="Click to hear this word" onClick={() => speakWord(tok, voiceId)}>{tok}</span>;
      })}</span>
    : <span dangerouslySetInnerHTML={{ __html: renderInlineMath(text) }} />;

  return (
    <span style={block ? { display: 'block' } : undefined}>
      {body}{' '}
      <AudioButton text={speak} voiceId={voiceId} showTextOnFail={false} title="Read aloud" />{' '}
      <span role="button" tabIndex={0} className="sl-emoji-btn" aria-label={shown ? 'Hide translation' : `Translate to ${translateTo}`}
        title={shown ? 'Hide translation' : `Translate to ${translateTo}`}
        onClick={() => { if (!busy) toggle(); }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); toggle(); } }}
        style={{ cursor: busy ? 'wait' : 'pointer', fontSize: 17, lineHeight: 1, userSelect: 'none', opacity: shown ? 1 : 0.85 }}>
        {busy ? '…' : '🌐'}
      </span>
      {shown && tr && <em style={{ display: 'block', fontSize: 13, opacity: 0.8, marginTop: 2 }}>→ {tr}</em>}
    </span>
  );
}
