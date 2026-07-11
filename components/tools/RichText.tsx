'use client';
/* A text value with speaker (TTS) + translate actions. Used in app entry
 * displays and inside the lesson player, so any content can be read aloud or
 * translated — the "speaker/translation options when appropriate". */
import { useState } from 'react';
import { API } from '@/lib/api';
import { AudioButton } from '@/components/ui/AudioButton';

export function RichText({ text, translateTo = 'English', block = false }: { text: string; translateTo?: string; block?: boolean }) {
  const [tr, setTr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!text) return <></>;
  const translate = async () => {
    setBusy(true);
    try { const r = await API.post('/api/tools/translate', { text, to: translateTo }); setTr(r?.translation || ''); } catch { /* ignore */ }
    setBusy(false);
  };
  return (
    <span style={block ? { display: 'block' } : undefined}>
      {text}{' '}
      <AudioButton text={text} label="🔊" small showTextOnFail={false} />{' '}
      <button className="btn small ghost" onClick={translate} disabled={busy} title={`Translate to ${translateTo}`}>{busy ? '…' : '🌐'}</button>
      {tr && <em style={{ display: 'block', fontSize: 13, opacity: 0.8, marginTop: 2 }}>→ {tr}</em>}
    </span>
  );
}
