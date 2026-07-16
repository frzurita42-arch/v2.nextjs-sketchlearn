'use client';
/* Admin dashboard: a single place to see the platform's data, grouped into tables
 * — created slide tools, created repositories, saved presentation runs (grades by
 * user), users (with add/edit), and the built-in game statistics. The storage stays
 * normalised (separate tools / entries / users tables); the dashboard just joins
 * and groups what it needs to display.
 *
 * Every table shows at most 4 rows and paginates; any cell longer than 100 chars is
 * clipped with an 👁 button that opens the full text in a popup. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { downloadCsv } from '@/lib/util';
import { useApp } from '@/components/AppContext';
import { Loading } from '@/components/ui/Loading';

const fmtDate = (v: any) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); };
const fmtDay = (v: any) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(); };

const ROWS_PER_PAGE = 4;
const CELL_LIMIT = 100;
// A cell is plain text/number, or a { node } for interactive content (buttons).
type Cell = string | number | null | undefined | { node: React.ReactNode };

// A table that shows ROWS_PER_PAGE rows at a time (with Prev/Next) and clips any
// text cell over CELL_LIMIT chars, revealing the full value in a popup via 👁.
function PagedTable({ headers, rows, empty }: { headers: string[]; rows: Cell[][]; empty: string }) {
  const [page, setPage] = useState(0);
  const [view, setView] = useState<{ title: string; text: string } | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const p = Math.min(page, pages - 1);
  const slice = rows.slice(p * ROWS_PER_PAGE, p * ROWS_PER_PAGE + ROWS_PER_PAGE);
  return (
    <>
      <div className="table-wrap"><table className="sketch"><tbody>
        <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        {slice.length ? slice.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, ci) => {
              if (c && typeof c === 'object' && 'node' in c) return <td key={ci}>{c.node}</td>;
              const s = String(c ?? '');
              if (s.length > CELL_LIMIT) return (
                <td key={ci}>{s.slice(0, CELL_LIMIT)}…{' '}
                  <button className="btn small ghost" style={{ padding: '0 5px' }} title="Show the full text" onClick={() => setView({ title: headers[ci] || '', text: s })}>👁</button>
                </td>
              );
              return <td key={ci}>{s || '—'}</td>;
            })}
          </tr>
        )) : <tr><td colSpan={headers.length}>{empty}</td></tr>}
      </tbody></table></div>
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
          <button className="btn small ghost" disabled={p <= 0} onClick={() => setPage(p - 1)}>‹ Prev</button>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Page {p + 1} / {pages} · {rows.length} rows</span>
          <button className="btn small ghost" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next ›</button>
        </div>
      )}
      {view && (
        <div onClick={() => setView(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', padding: '16px 18px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>{view.title || 'Full text'}</b><button className="btn small ghost" onClick={() => setView(null)}>✕</button></div>
            <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 14, lineHeight: 1.5 }}>{view.text}</p>
          </div>
        </div>
      )}
    </>
  );
}

export function DashboardView() {
  const app = useApp();
  const [usersList, setUsersList] = useState<any[] | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [dash, setDash] = useState<{ tools: any[]; runs: any[] } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [userErr, setUserErr] = useState('');

  useEffect(() => {
    if (app.user?.role !== 'admin') { app.nav('home'); return; }
    let cancelled = false;
    Promise.all([API.get('/api/users'), API.get('/api/games'), API.get('/api/dashboard')])
      .then(([u, g, d]: any[]) => { if (!cancelled) { setUsersList(u); setGames(g); setDash(d && Array.isArray(d.tools) ? d : { tools: [], runs: [] }); } })
      .catch((e: any) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [reload, app]);

  const slideTools = useMemo(() => (dash?.tools || []).filter((t: any) => t.archetype === 'lesson'), [dash]);
  const repoTools = useMemo(() => (dash?.tools || []).filter((t: any) => t.archetype !== 'lesson'), [dash]);
  const runs = dash?.runs || [];

  if (error) return <div className="card">{error}</div>;
  if (usersList === null || dash === null) return <Loading text="Opening the teacher’s desk…" />;

  const addUser = async () => {
    try {
      await API.post('/api/users', { username: newUser.trim(), password: newPass, role: newRole });
      setNewUser(''); setNewPass(''); setUserErr(''); setReload(n => n + 1);
    } catch (e: any) { setUserErr(e.message); }
  };
  const setPassword = async (username: string) => {
    const p = prompt(`New password for ${username}:`);
    if (!p) return;
    try { await API.post(`/api/users/${encodeURIComponent(username)}/password`, { password: p }); alert('Password updated.'); }
    catch (e: any) { alert(e.message); }
  };
  const delUser = async (username: string) => {
    if (!confirm(`Delete user ${username}? Their game history stays in the records.`)) return;
    try { await API.del(`/api/users/${encodeURIComponent(username)}`); setReload(n => n + 1); }
    catch (e: any) { alert(e.message); }
  };
  const exportRows = (name: string, headers: string[], rows: (string | number)[][]) => {
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  // ---- table data (plain string rows: reused for both the table and CSV) ----
  const slideHeaders = ['Title', 'Owner', 'Visibility', 'Slides', 'Saved deck', 'AI', 'Created'];
  const slideRows: (string | number)[][] = slideTools.map((t: any) => [t.title, `@${t.owner}`, t.visibility, t.slideCount || '—', t.hasSavedDeck ? '📖 yes' : '—', t.aiGenerated ? '✦' : '—', fmtDate(t.createdAt)]);

  const repoHeaders = ['Title', 'Owner', 'Visibility', 'Cards', 'Kind', 'AI', 'Created'];
  const repoRows: (string | number)[][] = repoTools.map((t: any) => [t.title, `@${t.owner}`, t.visibility, t.cardCount || '—', t.archetype, t.aiGenerated ? '✦' : '—', fmtDate(t.createdAt)]);

  const runHeaders = ['User', 'Presentation', 'Topic', 'Level', 'Theme', 'Slides', 'Grade', 'Date'];
  const runRows: (string | number)[][] = runs.map((r: any) => [`@${r.user}`, r.toolTitle, r.topic || '—', r.level || '—', r.theme || '—', r.slides || '—', r.score == null ? '—' : `${r.score}%`, fmtDate(r.createdAt)]);

  const gameHeaders = ['User', 'Date', 'Topic', 'Concept', 'Level', 'Score', 'Time'];
  const gameRows: (string | number)[][] = games.slice().reverse().map((g: any) => [g.username, fmtDate(g.finishedAt), g.topic, g.concept, g.level, `${g.correct}/${g.total}`, `${Math.floor(g.durationSec / 60)}:${String(g.durationSec % 60).padStart(2, '0')}`]);

  const userHeaders = ['Username', 'Role', 'Created', 'Games', 'Actions'];
  const userRows: Cell[][] = usersList.map((u: any) => [u.username, u.role, fmtDay(u.createdAt), u.gamesPlayed, {
    node: <>
      <button className="btn small" onClick={() => setPassword(u.username)}>Set password</button>
      {u.username !== app.user?.username && <button className="btn small ghost" onClick={() => delUser(u.username)}>✘ delete</button>}
    </>,
  }]);

  const sectionHead = (title: string, count: number, onCsv?: () => void) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <h3 style={{ margin: 0 }}>{title} <span style={{ opacity: 0.5, fontWeight: 400 }}>({count})</span></h3>
      {onCsv && count > 0 && <button className="btn small" onClick={onCsv}>⬇ CSV</button>}
    </div>
  );

  return (
    <>
      <h1 className="view-title">Teacher’s <span className="scribble-underline">dashboard</span></h1>
      <p className="view-sub" style={{ textAlign: 'center' }}>Every group of data on the platform, in its own table (4 rows per page).</p>

      <div className="card">
        {sectionHead('🎞️ Created slide tools', slideTools.length, () => exportRows('slide-tools', slideHeaders, slideRows))}
        <PagedTable headers={slideHeaders} rows={slideRows} empty="No slide tools yet." />
      </div>

      <div className="card">
        {sectionHead('🗂️ Created repositories', repoTools.length, () => exportRows('repositories', repoHeaders, repoRows))}
        <PagedTable headers={repoHeaders} rows={repoRows} empty="No repositories yet." />
      </div>

      <div className="card alt">
        {sectionHead('📊 Presentation runs — grades by user', runs.length, () => exportRows('presentation-runs', runHeaders, runRows))}
        <PagedTable headers={runHeaders} rows={runRows} empty="No saved runs yet — a moderator plays a presentation to the end and it lands here." />
      </div>

      <div className="card">
        {sectionHead('👥 Users', usersList.length)}
        <PagedTable headers={userHeaders} rows={userRows} empty="No users." />
        <h3 style={{ marginTop: 18 }}>➕ Add a user</h3>
        <div className="settings-grid" style={{ marginTop: 8 }}>
          <label className="field"><span>Username</span><input type="text" value={newUser} onChange={e => setNewUser(e.target.value)} /></label>
          <label className="field"><span>Password</span><input type="text" value={newPass} onChange={e => setNewPass(e.target.value)} /></label>
          <label className="field"><span>Role</span>
            <select value={newRole} onChange={e => setNewRole(e.target.value)}>
              <option value="user">user</option><option value="moderator">moderator</option><option value="admin">admin</option>
            </select></label>
        </div>
        <p className="form-error">{userErr}</p>
        <button className="btn green" disabled={!newUser.trim() || !newPass} onClick={addUser}>Add user</button>
      </div>

      <div className="card alt">
        {sectionHead('📈 Activity statistics', games.length)}
        <PagedTable headers={gameHeaders} rows={gameRows} empty="No games played yet." />
        <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
          <button className="btn small" onClick={downloadCsv}>⬇ Export all as CSV</button>
        </div>
      </div>
    </>
  );
}
