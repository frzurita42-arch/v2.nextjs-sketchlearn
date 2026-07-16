'use client';
/* A text value with speaker (TTS) + translate actions. Used in app entry
 * displays and inside the lesson player, so any content can be read aloud or
 * translated — the "speaker/translation options when appropriate". */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { AudioButton } from '@/components/ui/AudioButton';
import { renderInlineMath } from '@/components/ui/shared';

export function RichText({ text, translateTo = 'English', block = false }: { text: string; translateTo?: string; block?: boolean }) {
  const [tr, setTr] = useState('');        // cached translation for THIS text
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  // Turning to a new slide reuses this component with new text — drop the previous
  // slide's translation and hide it, so each slide starts untranslated and the
  // learner asks fresh only if they need it here.
  useEffect(() => { setTr(''); setShown(false); setBusy(false); }, [text]);
  if (!text) return <></>;
  const speak = text.replace(/\$/g, '');            // don't read the math delimiters aloud
  // Toggle: show the translation, or hide it if it's already showing. The clip is
  // fetched once and cached, so re-showing on the same slide is instant.
  const toggle = async () => {
    if (shown) { setShown(false); return; }
    if (tr) { setShown(true); return; }
    setBusy(true);
    try { const r = await API.post('/api/tools/translate', { text: speak, to: translateTo }); if (r?.translation) { setTr(r.translation); setShown(true); } } catch { /* ignore */ }
    setBusy(false);
  };
  return (
    <span style={block ? { display: 'block' } : undefined}>
      {/* Inline $...$ segments typeset with KaTeX; the rest is escaped prose. */}
      <span dangerouslySetInnerHTML={{ __html: renderInlineMath(text) }} />{' '}
      <AudioButton text={speak} label="🔊" small showTextOnFail={false} />{' '}
      <button className={`btn small ${shown ? 'green' : 'ghost'}`} onClick={toggle} disabled={busy} title={shown ? 'Hide translation' : `Translate to ${translateTo}`}>{busy ? '…' : '🌐'}</button>
      {shown && tr && <em style={{ display: 'block', fontSize: 13, opacity: 0.8, marginTop: 2 }}>→ {tr}</em>}
    </span>
  );
}
