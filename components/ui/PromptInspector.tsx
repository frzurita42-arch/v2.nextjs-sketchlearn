'use client';
/* PromptInspector — a reusable, read-only view of the ACTUAL prompt(s) a tool sends to
 * the AI, so any settings screen can show "how it replies" (the same idea as the chat's
 * "How I reply" page). Fetches from /api/ai/prompt-inspect for a `kind`; renders each
 * prompt as a labelled, scrollable box with a footnote on the expected response. Drop it
 * into any wizard step. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';

type PromptEntry = { label: string; system: string; footnote: string };

export function PromptInspector({ kind, topic, level }: { kind: string; topic?: string; level?: string }) {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true); setErr('');
    API.post('/api/ai/prompt-inspect', { kind, topic, level })
      .then((r: any) => setPrompts(Array.isArray(r?.prompts) ? r.prompts : []))
      .catch((e: any) => setErr(e?.message || 'failed'))
      .finally(() => setLoading(false));
  }, [kind, topic, level]);

  const copy = (t: string) => { try { navigator.clipboard?.writeText(t); } catch { /* ignore */ } };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ fontSize: 11.3, color: 'var(--muted,#8a7f70)', lineHeight: 1.4 }}>
        These are the exact instructions this tool sends to the AI. Each result is produced from these instructions
        + your settings + the topic/attachments you provide → the AI model. Read-only.
      </div>
      {loading && <div style={{ fontSize: 12, opacity: 0.6 }}>Loading the current instructions…</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--danger,#e4572e)' }}>Could not load: {err}</div>}
      {prompts.map((p, i) => (
        <div key={i} style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 3px' }}>
            <b style={{ fontSize: 12.5 }}>{p.label}</b>
            <span style={{ fontSize: 10, opacity: 0.5 }}>{p.system.length.toLocaleString()} chars</span>
            <button className="btn small ghost" style={{ marginLeft: 'auto', padding: '0 8px' }} onClick={() => copy(p.system)} title="Copy this prompt">📋</button>
          </div>
          <textarea readOnly value={p.system}
            style={{ width: '100%', height: 150, boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              fontSize: 10.5, lineHeight: 1.45, padding: '8px 10px', border: '2px solid var(--ink,#2d2a26)', borderRadius: 8,
              background: 'var(--card,#fff8ee)', color: 'var(--ink,#2d2a26)', resize: 'vertical', overflowY: 'auto', whiteSpace: 'pre-wrap' }} />
          <div style={{ fontSize: 10.8, color: 'var(--muted,#8a7f70)', margin: '3px 2px 0', lineHeight: 1.4 }}>ℹ️ {p.footnote}</div>
        </div>
      ))}
    </div>
  );
}
