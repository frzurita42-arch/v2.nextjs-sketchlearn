'use client';
/* The shared shell-page heading: the scribble-underlined title + subtitle, sized by
 * the header-size setting (global, or this page's override). Next to the title:
 *   • "Aa" — reveal inline sliders to resize just this page's heading.
 *   • ✎    — rename this page's title & subtitle (saved per-page), with a
 *   • 🎨   — "let AI propose a title" palette button inside the editor. */
import { useState } from 'react';
import { API } from '@/lib/api';
import { useHeaderSize, setPageTitleSize, setPageSubSize, TITLE_MIN, TITLE_MAX, SUB_MIN, SUB_MAX } from '@/lib/header-size';
import { usePageText, setPageTitle, setPageSub, clearPageText } from '@/lib/page-text';

const asText = (v: React.ReactNode): string => (typeof v === 'string' ? v : '');

export function PageHeading({ pageKey, title, subtitle }: { pageKey?: string; title: React.ReactNode; subtitle?: React.ReactNode }) {
  const { title: tSize, sub: sSize } = useHeaderSize(pageKey);
  const { title: tOverride, sub: sOverride } = usePageText(pageKey);
  const [open, setOpen] = useState(false);       // Aa size sliders
  const [edit, setEdit] = useState(false);       // ✎ rename editor
  const [tDraft, setTDraft] = useState('');
  const [sDraft, setSDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const shownTitle: React.ReactNode = tOverride ?? title;
  const shownSub: React.ReactNode = sOverride ?? subtitle;

  const openEditor = () => {
    setTDraft(tOverride ?? asText(title));
    setSDraft(sOverride ?? asText(subtitle));
    setEdit((v) => !v);
  };
  const saveEdit = () => { if (!pageKey) return; setPageTitle(pageKey, tDraft); setPageSub(pageKey, sDraft); setEdit(false); };
  const resetEdit = () => { if (!pageKey) return; clearPageText(pageKey); setEdit(false); };
  const propose = async () => {
    if (!pageKey) return;
    setBusy(true);
    try {
      const r: any = await API.post('/api/ai/propose-title', { page: pageKey, current: tDraft || asText(title), subtitle: sDraft || asText(subtitle), kind: tDraft || asText(title) });
      if (r?.title) { setTDraft(r.title); if (r.subtitle) setSDraft(r.subtitle); }
      else if (r?.error) alert(r.error);
    } catch { alert('AI unavailable — type it instead.'); }
    setBusy(false);
  };

  const toolBtn: React.CSSProperties = { background: 'none', border: '1.5px solid var(--line,#d9cfc0)', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '2px 7px', color: 'var(--muted,#8a7f70)', alignSelf: 'center', lineHeight: 1.2 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2 className="scribble-underline" style={{ display: 'inline-block', margin: '0 0 4px', fontSize: tSize, lineHeight: 1.05 }}>{shownTitle}</h2>
        {pageKey && (
          <button title="Resize this page's title & subtitle" onClick={() => { setOpen((v) => !v); setEdit(false); }}
            style={{ ...toolBtn, background: open ? 'var(--card,#fff8ee)' : 'none', fontSize: 11 }}>Aa</button>
        )}
        {pageKey && (
          <button title="Rename this page's title & subtitle" onClick={openEditor}
            style={{ ...toolBtn, background: edit ? 'var(--card,#fff8ee)' : 'none' }}>✎</button>
        )}
      </div>

      {open && pageKey && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', margin: '2px 0 8px', fontSize: 11, color: 'var(--muted,#8a7f70)' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Title
            <input type="range" min={TITLE_MIN} max={TITLE_MAX} value={tSize} onChange={(e) => setPageTitleSize(pageKey, parseInt(e.target.value, 10))} style={{ width: 100, accentColor: 'var(--green,#7fb069)' }} /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Subtitle
            <input type="range" min={SUB_MIN} max={SUB_MAX} value={sSize} onChange={(e) => setPageSubSize(pageKey, parseInt(e.target.value, 10))} style={{ width: 100, accentColor: 'var(--green,#7fb069)' }} /></label>
        </div>
      )}

      {edit && pageKey && (
        <div style={{ border: '2px dashed var(--line,#d9cfc0)', borderRadius: 10, padding: '10px 12px', margin: '4px 0 10px', background: 'rgba(0,0,0,0.015)', maxWidth: 460 }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
            TITLE
            <button className="btn small blue" disabled={busy} onClick={propose} title="Let AI propose a title & subtitle for this page" style={{ padding: '0 6px' }}>{busy ? '…' : '🎨 AI'}</button>
          </div>
          <input value={tDraft} onChange={(e) => setTDraft(e.target.value)} placeholder={asText(title)} style={{ width: '100%', fontSize: 15, marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 3 }}>SUBTITLE</div>
          <input value={sDraft} onChange={(e) => setSDraft(e.target.value)} placeholder={asText(subtitle)} style={{ width: '100%', fontSize: 14, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn small ghost" onClick={resetEdit}>Reset to default</button>
            <button className="btn small ghost" onClick={() => setEdit(false)}>Cancel</button>
            <button className="btn small green" onClick={saveEdit}>Save</button>
          </div>
        </div>
      )}

      {shownSub !== undefined && shownSub !== null && <p style={{ margin: '0 0 12px', color: 'var(--muted,#8a7f70)', fontSize: sSize }}>{shownSub}</p>}
    </div>
  );
}
