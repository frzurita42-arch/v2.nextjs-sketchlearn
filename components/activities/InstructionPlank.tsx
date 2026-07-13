'use client';
/* A slab of wood with a white paper note pinned on it, carrying an activity's
 * how-to. Two modes:
 *  - static: pass `children` (rich JSX) — a fixed note.
 *  - editable: pass a `settingKey` (+ `defaultText`) — the note becomes admin-
 *    editable page copy, persisted for everyone. Admins get ✎ (type your own),
 *    ✨ (ask the AI to write it from a request) and 🎨 (distort/reword) controls.
 *    Non-admins (even privileged users) can read it but not change it. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { useApp } from '@/components/AppContext';

export function InstructionPlank({ children, settingKey, defaultText }: {
  children?: React.ReactNode;
  settingKey?: string;
  defaultText?: string;
}) {
  const app = useApp();
  const isAdmin = app.user?.role === 'admin';
  const editable = !!settingKey;
  const [text, setText] = useState(defaultText || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settingKey) return;
    let cancelled = false;
    API.get('/api/site-settings').then((r: any) => {
      const v = r?.settings?.[settingKey];
      if (!cancelled && typeof v === 'string' && v) setText(v);
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [settingKey]);

  const save = async (v: string) => {
    const t = v.trim(); if (!t) { setEditing(false); return; }
    setText(t); setEditing(false);
    try { await API.put('/api/site-settings', { key: settingKey, value: t }); } catch { /* ignore */ }
  };
  const distort = async () => {
    setBusy(true);
    try { const r = await API.post('/api/site-settings/remix', { text, kind: 'banner' }); if (r?.text) await save(r.text); else if (r?.error) alert(r.error); }
    catch { /* ignore */ } finally { setBusy(false); }
  };
  const aiRequest = async () => {
    const instruction = window.prompt('Describe what this banner should say:', '');
    if (instruction == null || !instruction.trim()) return;
    setBusy(true);
    try { const r = await API.post('/api/site-settings/remix', { text, kind: 'banner', instruction }); if (r?.text) await save(r.text); else if (r?.error) alert(r.error); }
    catch { /* ignore */ } finally { setBusy(false); }
  };

  const icon = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 6, fontSize: 14, lineHeight: 1, verticalAlign: 'middle' } as const;

  return (
    <div className="instruction-plank">
      <div className="plank-note">
        {editable && editing ? (
          <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
            onBlur={() => save(draft)}
            style={{ width: '100%', minHeight: 84, fontSize: 14, padding: '8px 10px', borderRadius: 4, border: '1.5px solid #b99', resize: 'vertical' }} />
        ) : (
          <p style={{ margin: 0 }}>
            {editable ? text : children}
            {editable && isAdmin && (
              <span style={{ whiteSpace: 'nowrap' }}>
                <button title="Edit — type your own" style={icon} onClick={() => { setDraft(text); setEditing(true); }}>✎</button>
                <button title="Ask the AI to write this banner" style={icon} disabled={busy} onClick={aiRequest}>{busy ? '…' : '✨'}</button>
                <button title="AI tap-mixer — reword this banner" style={icon} disabled={busy} onClick={distort}>{busy ? '…' : '🎨'}</button>
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
