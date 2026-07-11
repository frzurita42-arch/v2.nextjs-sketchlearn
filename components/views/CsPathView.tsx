'use client';
/* Cybersecurity Academy — adaptive career-path editor.
 * Estimates the learner's level, surfaces gaps, and recommends the next five
 * courses with timeframes. Courses can be PINNED (kept as in-progress) so an
 * "Update path" re-run builds around them and folds in new interests. All
 * offensive learning is framed for AUTHORIZED, sanctioned environments only.
 * Persists to appState.csAcademy + localStorage so the path survives navigation. */
import { useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { withTimeout } from '@/lib/util';
import { useApp } from '@/components/AppContext';
import { InstructionPlank } from '@/components/activities/InstructionPlank';

const ROLES = ['Penetration Tester', 'Red Team Operator', 'SOC Analyst', 'Security Engineer', 'Malware Analyst', 'GRC / Risk'];

function loadSaved(): any {
  if (appState.csAcademy) return appState.csAcademy;
  try { const s = JSON.parse(localStorage.getItem('sl_cs_academy') || 'null'); if (s) { appState.csAcademy = s; return s; } } catch { /* ignore */ }
  return { goalRole: 'Penetration Tester', interests: '', knownAreas: '', hoursPerWeek: 6, pinned: [], path: null };
}
function persist(state: any) { appState.csAcademy = state; try { localStorage.setItem('sl_cs_academy', JSON.stringify(state)); } catch { /* ignore */ } }

function Bar({ label, score }: { label: string; score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div style={{ margin: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
        <span>{label}</span><span style={{ opacity: 0.7 }}>{pct}</span>
      </div>
      <div style={{ height: 10, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden', border: '1.5px solid var(--ink)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent, #5c80bc)' }} />
      </div>
    </div>
  );
}

export function CsPathView() {
  const app = useApp();
  const [st, setSt] = useState<any>(() => loadSaved());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const patch = (p: any) => setSt((prev: any) => { const next = { ...prev, ...p }; persist(next); return next; });

  const path = st.path;
  const pinned: string[] = st.pinned || [];

  const generate = async (isUpdate = false) => {
    setBusy(true); setErr('');
    try {
      const body = {
        goalRole: st.goalRole,
        knownAreas: String(st.knownAreas || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        interests: String(st.interests || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        hoursPerWeek: parseInt(st.hoursPerWeek, 10) || 6,
        currentCourses: pinned,
        priorPath: isUpdate && path ? { areaScores: path.areaScores, nextCourses: path.nextCourses?.map((c: any) => c.title) } : null,
      };
      const r = await withTimeout(API.post('/api/cs/path', body), 60000, 'Path generation timed out.');
      patch({ path: r });
    } catch (e: any) {
      setErr(e?.message || 'Could not generate the path.');
    }
    setBusy(false);
  };

  const pin = (title: string) => { if (!pinned.includes(title)) patch({ pinned: [...pinned, title] }); };
  const unpin = (title: string) => patch({ pinned: pinned.filter(p => p !== title) });

  return (
    <>
      <h1 className="view-title">Cybersecurity <span className="scribble-underline">Academy</span></h1>
      <p className="view-sub">An adaptive path that estimates what you know, finds your gaps, and keeps re-planning your next steps.{' '}
        <button className="btn small ghost" onClick={() => app.nav('home')}>← Home</button></p>

      <section style={{ maxWidth: 820, margin: '8px auto 0' }}>
        <InstructionPlank>
          All offensive/red-team learning here is framed for <b>authorized environments only</b> — sanctioned labs (Hack The Box, TryHackMe, PortSwigger), CTFs, and systems you own or have written permission to test.
        </InstructionPlank>

        <div className="card alt" style={{ padding: '14px 16px' }}>
          <div className="settings-compact">
            <label className="field"><span>Target role</span>
              <select value={st.goalRole} onChange={e => patch({ goalRole: e.target.value })}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select></label>
            <label className="field"><span>Hours / week</span>
              <input type="number" min={1} max={40} value={st.hoursPerWeek}
                onChange={e => patch({ hoursPerWeek: e.target.value })} /></label>
          </div>
          <label className="field" style={{ marginTop: 8 }}><span>What you already know (comma-separated)</span>
            <input type="text" value={st.knownAreas} placeholder="e.g. Python, basic Linux, HTTP"
              onChange={e => patch({ knownAreas: e.target.value })} /></label>
          <label className="field" style={{ marginTop: 8 }}><span>Interests (comma-separated)</span>
            <input type="text" value={st.interests} placeholder="e.g. web exploitation, cloud, malware"
              onChange={e => patch({ interests: e.target.value })} /></label>
          <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 12, gap: 8 }}>
            <button className="btn green" disabled={busy} onClick={() => generate(false)}>
              {busy ? 'Planning…' : (path ? 'Rebuild from scratch' : 'Build my path →')}
            </button>
            {path && <button className="btn blue" disabled={busy} onClick={() => generate(true)}>↻ Update path (keep pinned)</button>}
          </div>
          {err && <p style={{ color: 'var(--danger,#e4572e)', marginTop: 8, fontSize: 13 }}>{err}</p>}
        </div>

        {path && (
          <div style={{ marginTop: 16 }}>
            {path.fallback && (
              <p style={{ fontSize: 12, fontStyle: 'italic', opacity: 0.7 }}>Showing a built-in starter path (no AI provider connected).</p>
            )}
            <div className="card" style={{ padding: '14px 16px' }}>
              <h3 style={{ margin: '0 0 4px' }}>Estimated level: {path.estimatedLevel?.overall || '—'}</h3>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{path.estimatedLevel?.rationale}</p>
              {Array.isArray(path.areaScores) && path.areaScores.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {path.areaScores.map((a: any, i: number) => <Bar key={i} label={a.area} score={a.score} />)}
                </div>
              )}
            </div>

            {Array.isArray(path.gaps) && path.gaps.length > 0 && (
              <div className="card alt" style={{ padding: '14px 16px', marginTop: 12 }}>
                <h4 style={{ margin: '0 0 6px' }}>Biggest gaps</h4>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {path.gaps.map((g: any, i: number) => <li key={i} style={{ marginBottom: 4, fontSize: 14 }}><b>{g.area}:</b> {g.why}</li>)}
                </ul>
              </div>
            )}

            <h4 style={{ margin: '16px 0 6px' }}>Your next 5 courses</h4>
            {path.nextCourses?.map((c: any, i: number) => (
              <div key={i} className="card" style={{ padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{i + 1}. {c.title}</strong>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{c.area} · {c.difficulty} · ~{c.estWeeks}w</span>
                </div>
                <p style={{ margin: '6px 0', fontSize: 13 }}>{c.why}</p>
                {Array.isArray(c.resources) && c.resources.length > 0 && (
                  <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Resources: {c.resources.join(' · ')}</p>
                )}
                <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                  {pinned.includes(c.title)
                    ? <button className="btn small" onClick={() => unpin(c.title)}>📌 Pinned (keep) — unpin</button>
                    : <button className="btn small ghost" onClick={() => pin(c.title)}>📌 Pin as in-progress</button>}
                </div>
              </div>
            ))}

            {pinned.length > 0 && (
              <p style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
                Pinned (kept on every update): {pinned.join(', ')}
              </p>
            )}
            {path.adaptationNote && (
              <p style={{ fontSize: 13, fontStyle: 'italic', marginTop: 10, opacity: 0.85 }}>↻ {path.adaptationNote}</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
