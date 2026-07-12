'use client';
/* Owner/admin-only settings page for a tool. Two things:
 *  1) BYO API keys — name + key rows, add as many as you like.
 *  2) Edit-with-AI — describe a change ("add a color field", "let people attach
 *     files") and the AI rewrites the tool's definition; preview, then apply.
 * Gated server-side too (403 for anyone but the owner/admin). */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';

type Key = { name: string; key: string };

export function ToolSettingsView() {
  const app = useApp();
  const slug = appState.activeTool?.slug;
  const [tool, setTool] = useState<any>(null);
  const [keys, setKeys] = useState<Key[]>([]);
  const [denied, setDenied] = useState(false);
  const [saved, setSaved] = useState('');
  const [visibility, setVisibility] = useState('private');

  // AI edit state
  const [req, setReq] = useState('');
  const [proposal, setProposal] = useState<any>(null);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!slug) return;
    API.get(`/api/tools/settings?slug=${encodeURIComponent(slug)}`).then((r: any) => {
      setTool(r.tool); setKeys(Array.isArray(r.apiKeys) ? r.apiKeys : []); setVisibility(r.tool?.visibility || 'private');
    }).catch((e: any) => { if (/403/.test(e?.message || '')) setDenied(true); });
  }, [slug]);

  if (!slug) return <><h1 className="view-title">Tool settings</h1><p className="view-sub">No tool selected. <button className="btn small" onClick={() => app.nav('tools')}>← Tools</button></p></>;
  if (denied) return <><h1 className="view-title">Tool settings</h1><p className="view-sub">Only the tool&apos;s owner or an admin can open this. <button className="btn small" onClick={() => app.nav('tool')}>← Back</button></p></>;

  const setKey = (i: number, patch: Partial<Key>) => setKeys(ks => ks.map((k, j) => j === i ? { ...k, ...patch } : k));
  const addKey = () => setKeys(ks => [...ks, { name: '', key: '' }]);
  const removeKey = (i: number) => setKeys(ks => ks.filter((_, j) => j !== i));

  const saveKeys = async () => {
    setSaved('');
    try { await API.put('/api/tools/settings', { slug, apiKeys: keys.filter(k => k.name && k.key), visibility }); setSaved('Saved ✓'); setTimeout(() => setSaved(''), 2500); }
    catch (e: any) { setErr(e?.message || 'Save failed'); }
  };

  const askEdit = async () => {
    const request = req.trim(); if (!request || !tool) return;
    setBusy(true); setErr(''); setProposal(null); setSummary('');
    try {
      const r = await API.post('/api/tools/edit', { definition: tool.definition, request });
      setProposal(r.definition); setSummary(r.summary || 'Updated.');
    } catch (e: any) { setErr(e?.message || 'The AI could not make that change.'); }
    setBusy(false);
  };

  const deleteTool = async () => {
    if (!confirm(`Delete “${tool?.title}”? This permanently removes the tool and its activities.`)) return;
    try { await API.del(`/api/tools?slug=${encodeURIComponent(slug)}`); appState.activeTool = null; app.nav('tools'); }
    catch (e: any) { setErr(e?.message || 'Could not delete.'); }
  };

  const applyEdit = async () => {
    if (!proposal) return;
    setBusy(true); setErr('');
    try {
      await API.put('/api/tools/settings', { slug, definition: proposal });
      const updated = { ...tool, definition: proposal, title: proposal.title, description: proposal.description, archetype: proposal.archetype };
      setTool(updated); appState.activeTool = updated;   // reflect in the runner
      setProposal(null); setReq(''); setSummary('Applied ✓');
      setTimeout(() => setSummary(''), 2500);
    } catch (e: any) { setErr(e?.message || 'Apply failed'); }
    setBusy(false);
  };

  const fields = tool?.definition?.archetype === 'app' ? (tool.definition.app?.entryFields || []) : (tool?.definition?.settings || []);

  // Repository default display (owner/admin) — how the top-level cards are arranged.
  const isRepo = tool?.definition?.archetype === 'repo';
  const saveDisplay = async (display: 'bars' | 'grid') => {
    if (!tool?.definition?.repo) return;
    const nextDef = { ...tool.definition, repo: { ...tool.definition.repo, display } };
    setTool({ ...tool, definition: nextDef }); appState.activeTool = { ...appState.activeTool, definition: nextDef };
    try { await API.put('/api/tools/settings', { slug, definition: nextDef }); setSaved('Saved ✓'); setTimeout(() => setSaved(''), 2500); }
    catch (e: any) { setErr(e?.message || 'Save failed'); }
  };

  return (
    <>
      <h1 className="view-title">Settings — <span className="scribble-underline">{tool?.title || 'tool'}</span></h1>
      <p className="view-sub">Owner tools for this post.{' '}
        <button className="btn small ghost" onClick={() => app.nav('tool')}>← Back to tool</button></p>

      <section style={{ maxWidth: 720, margin: '8px auto 0' }}>
        {/* API keys */}
        <div className="card alt" style={{ padding: '14px 16px' }}>
          <h4 style={{ margin: '0 0 4px' }}>🔑 Your API keys</h4>
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>Only you and admins can see these. Used by this tool. (Stored server-side — avoid your most sensitive keys until encryption is added.)</p>
          {keys.map((k, i) => (
            <div key={i} className="chat-input-row" style={{ marginBottom: 6 }}>
              <input type="text" placeholder="Name (e.g. OpenAI)" value={k.name} onChange={e => setKey(i, { name: e.target.value })} style={{ maxWidth: 180 }} />
              <input type="password" placeholder="Key" value={k.key} onChange={e => setKey(i, { key: e.target.value })} />
              <button className="btn small ghost" onClick={() => removeKey(i)}>✕</button>
            </div>
          ))}
          <div className="slide-actions" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 6 }}>
            <button className="btn small" onClick={addKey}>＋ Add another</button>
            <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Visibility</span>
              <select value={visibility} onChange={e => setVisibility(e.target.value)}>
                <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
              </select></label>
            <button className="btn green" onClick={saveKeys}>Save</button>
            {saved && <span style={{ color: 'var(--accent,#5c80bc)', fontSize: 13 }}>{saved}</span>}
          </div>
        </div>

        {/* Repository default display */}
        {isRepo && (
          <div className="card alt" style={{ padding: '14px 16px', marginTop: 16 }}>
            <h4 style={{ margin: '0 0 4px' }}>🗂️ Default display</h4>
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>How the top-level cards are arranged. (Each card also has its own “Children as” setting that cascades to everything inside it.)</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['bars', 'grid'] as const).map((d) => (
                <button key={d} className={`btn small ${(tool.definition.repo?.display || 'bars') === d ? 'green' : 'ghost'}`} onClick={() => saveDisplay(d)}>
                  {d === 'bars' ? 'Horizontal bars' : 'Grid of cards'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI edit chat */}
        <div className="card alt" style={{ padding: '14px 16px', marginTop: 16 }}>
          <h4 style={{ margin: '0 0 4px' }}>✨ Edit this tool with AI</h4>
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 0 }}>Describe a change and the AI rewrites the tool. E.g. “add a color field”, “let people attach a file”, “add a difficulty setting”.</p>
          <div className="chat-input-row">
            <textarea value={req} placeholder="What should change?" onChange={e => setReq(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askEdit(); } }} />
            <button className="btn primary" disabled={busy} onClick={askEdit}>{busy ? '…' : 'Ask'}</button>
          </div>
          {err && <p style={{ color: 'var(--danger,#e4572e)', fontSize: 13 }}>{err}</p>}
          {summary && !proposal && <p style={{ fontSize: 13, color: 'var(--accent,#5c80bc)' }}>{summary}</p>}

          {proposal && (
            <div className="card" style={{ padding: '12px 14px', marginTop: 10 }}>
              <p style={{ margin: '0 0 6px' }}><b>Proposed change:</b> {summary}</p>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                <div><b>Title:</b> {proposal.title} <span style={{ opacity: 0.6 }}>({proposal.archetype})</span></div>
                <div><b>Fields:</b> {(proposal.archetype === 'app' ? proposal.app?.entryFields : proposal.settings || []).map((f: any) => `${f.label} (${f.type})`).join(', ') || '—'}</div>
              </div>
              <div className="slide-actions" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 10 }}>
                <button className="btn green" disabled={busy} onClick={applyEdit}>Apply change</button>
                <button className="btn ghost" onClick={() => setProposal(null)}>Discard</button>
              </div>
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 12 }}>
          Current fields: {fields.map((f: any) => `${f.label} (${f.type})`).join(', ') || '—'}
        </p>

        {/* Danger zone */}
        <div className="card" style={{ padding: '12px 14px', marginTop: 16, borderColor: 'var(--danger,#e4572e)' }}>
          <h4 style={{ margin: '0 0 6px', color: 'var(--danger,#e4572e)' }}>Delete tool</h4>
          <p style={{ fontSize: 13, opacity: 0.8, margin: '0 0 8px' }}>Permanently removes this tool and its activities.</p>
          <button className="btn" style={{ borderColor: 'var(--danger,#e4572e)', color: 'var(--danger,#e4572e)' }} onClick={deleteTool}>🗑 Delete this tool</button>
        </div>
      </section>
    </>
  );
}
