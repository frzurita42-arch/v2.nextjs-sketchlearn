'use client';
/* Image input. By default you UPLOAD a photo — it goes to the blob store (CDN)
 * and only the returned URL is kept, so the database stays light. A small ✎ toggle
 * (like the select-or-custom pencil) flips to "paste a URL" mode instead. If the
 * blob store isn't configured, upload transparently falls back to an inline data
 * URL so nothing breaks. */
import { useState } from 'react';
import { API } from '@/lib/api';
import { normalizeImageUrl, isRenderableImage } from '@/lib/img';

export function ImageField({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  const isData = String(value || '').startsWith('data:');
  // Default to upload; if the field already holds a pasted URL, start in URL mode.
  const [urlMode, setUrlMode] = useState<boolean>(!!value && !isData);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const readAsDataUrl = (file: File) => { const r = new FileReader(); r.onload = () => onChange(String(r.result || '')); r.readAsDataURL(file); };

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { alert('Please choose an image file.'); return; }
    if (file.size > 8_000_000) { alert('Please pick an image under 8 MB.'); return; }
    setBusy(true); setNote('');
    try {
      const r = await API.upload('/api/upload', file);   // -> { url } from the blob store
      if (r?.url) { onChange(r.url); setNote('Uploaded ✓'); }
      else readAsDataUrl(file);
    } catch (e: any) {
      // 501 = blob store not configured; anything else = upload failed. Either way,
      // fall back to an inline data URL so the user isn't blocked.
      readAsDataUrl(file);
      setNote(e?.status === 501 ? 'Saved inline (blob store not set up).' : 'Upload failed — saved inline.');
    }
    setBusy(false);
  };

  return (
    <label className="field" style={{ gridColumn: '1 / -1' }}>
      <span>{label}
        <button type="button" title={urlMode ? 'Upload a photo instead' : 'Paste a URL instead'} onClick={() => setUrlMode(m => !m)}
          style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>{urlMode ? '📷' : '✎'}</button>
      </span>

      {urlMode ? (
        <input type="url" placeholder="Paste an image URL (from an image host)"
          value={isData ? '' : (value ?? '')} onChange={e => onChange(normalizeImageUrl(e.target.value))} />
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" accept="image/*" disabled={busy} onChange={e => onFile(e.target.files?.[0])} style={{ fontSize: 12 }} />
          {busy && <span style={{ fontSize: 12, opacity: 0.7 }}>Uploading…</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
        {note && <small style={{ fontSize: 11, opacity: 0.7 }}>{note}</small>}
        {value && <button type="button" className="btn small ghost" onClick={() => { onChange(''); setNote(''); }}>Clear</button>}
      </div>
      <small style={{ fontSize: 11, opacity: 0.6 }}>{urlMode ? 'Tip: use a direct image link (an image host, not a plain Google Drive share link).' : 'Your photo is uploaded to storage and served from a fast CDN.'}</small>
      {isRenderableImage(value) && <img src={value} alt="" style={{ maxWidth: 160, marginTop: 6, borderRadius: 8, border: '2px solid var(--ink)' }} />}
    </label>
  );
}
