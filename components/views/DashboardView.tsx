'use client';
/* Admin dashboard: a single place to see the platform's data, grouped into tables
 * — created slide tools, created repositories, saved presentation runs (grades by
 * user), users (with add/edit), and the built-in game statistics. The storage stays
 * normalised (separate tools / entries / users tables); the dashboard just joins
 * and groups what it needs to display. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { downloadCsv } from '@/lib/util';
import { useApp } from '@/components/AppContext';
import { Loading } from '@/components/ui/Loading';

const fmtDate = (v: any) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); };
const fmtDay = (v: any) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(); };

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

  // Split the tool list into the two galleries' kinds: slide decks vs. everything
  // else (repositories / apps / generators).
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
  // Download any of the dashboard tables as its own CSV.
  const exportRows = (name: string, headers: string[], rows: (string | number)[][]) => {
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  return (
    <>
      <h1 className="view-title">Teacher’s <span className="scribble-underline">dashboard</span></h1>
      <p className="view-sub" style={{ textAlign: 'center' }}>Every group of data on the platform, in its own table.</p>

      {/* 🎞️ Created slide tools (presentations) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>🎞️ Created slide tools <span style={{ opacity: 0.5, fontWeight: 400 }}>({slideTools.length})</span></h3>
          {slideTools.length > 0 && <button className="btn small" onClick={() => exportRows('slide-tools', ['Title', 'Owner', 'Visibility', 'Slides', 'Saved deck', 'AI', 'Created'], slideTools.map((t: any) => [t.title, t.owner, t.visibility, t.slideCount, t.hasSavedDeck ? 'yes' : 'no', t.aiGenerated ? 'yes' : 'no', fmtDate(t.createdAt)]))}>⬇ CSV</button>}
        </div>
        <div className="table-wrap"><table className="sketch"><tbody>
          <tr><th>Title</th><th>Owner</th><th>Visibility</th><th>Slides</th><th>Saved deck</th><th>AI</th><th>Created</th></tr>
          {slideTools.length ? slideTools.map((t: any) => (
            <tr key={t.id}>
              <td>{t.title}</td><td>@{t.owner}</td><td>{t.visibility}</td><td>{t.slideCount || '—'}</td>
              <td>{t.hasSavedDeck ? '📖 yes' : '—'}</td><td>{t.aiGenerated ? '✦' : '—'}</td><td>{fmtDate(t.createdAt)}</td>
            </tr>
          )) : <tr><td colSpan={7}>No slide tools yet.</td></tr>}
        </tbody></table></div>
      </div>

      {/* 🗂️ Created repositories */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>🗂️ Created repositories <span style={{ opacity: 0.5, fontWeight: 400 }}>({repoTools.length})</span></h3>
          {repoTools.length > 0 && <button className="btn small" onClick={() => exportRows('repositories', ['Title', 'Owner', 'Visibility', 'Cards', 'AI', 'Created'], repoTools.map((t: any) => [t.title, t.owner, t.visibility, t.cardCount, t.aiGenerated ? 'yes' : 'no', fmtDate(t.createdAt)]))}>⬇ CSV</button>}
        </div>
        <div className="table-wrap"><table className="sketch"><tbody>
          <tr><th>Title</th><th>Owner</th><th>Visibility</th><th>Cards</th><th>Kind</th><th>AI</th><th>Created</th></tr>
          {repoTools.length ? repoTools.map((t: any) => (
            <tr key={t.id}>
              <td>{t.title}</td><td>@{t.owner}</td><td>{t.visibility}</td><td>{t.cardCount || '—'}</td>
              <td>{t.archetype}</td><td>{t.aiGenerated ? '✦' : '—'}</td><td>{fmtDate(t.createdAt)}</td>
            </tr>
          )) : <tr><td colSpan={7}>No repositories yet.</td></tr>}
        </tbody></table></div>
      </div>

      {/* 📊 Saved presentation runs — the grades, by user */}
      <div className="card alt">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>📊 Presentation runs — grades by user <span style={{ opacity: 0.5, fontWeight: 400 }}>({runs.length})</span></h3>
          {runs.length > 0 && <button className="btn small" onClick={() => exportRows('presentation-runs', ['User', 'Presentation', 'Topic', 'Level', 'Theme', 'Slides', 'Grade', 'Date'], runs.map((r: any) => [r.user, r.toolTitle, r.topic, r.level, r.theme, r.slides, r.score == null ? '' : `${r.score}%`, fmtDate(r.createdAt)]))}>⬇ CSV</button>}
        </div>
        <div className="table-wrap"><table className="sketch"><tbody>
          <tr><th>User</th><th>Presentation</th><th>Topic</th><th>Level</th><th>Theme</th><th>Slides</th><th>Grade</th><th>Date</th></tr>
          {runs.length ? runs.map((r: any) => (
            <tr key={r.id}>
              <td>@{r.user}</td><td>{r.toolTitle}</td><td>{r.topic || '—'}</td><td>{r.level || '—'}</td>
              <td>{r.theme || '—'}</td><td>{r.slides || '—'}</td>
              <td>{r.score == null ? '—' : <b>{r.score}%</b>}</td><td>{fmtDate(r.createdAt)}</td>
            </tr>
          )) : <tr><td colSpan={8}>No saved runs yet — a moderator plays a presentation to the end and it lands here.</td></tr>}
        </tbody></table></div>
      </div>

      {/* 👥 Users + add/edit */}
      <div className="card">
        <h3>👥 Users <span style={{ opacity: 0.5, fontWeight: 400 }}>({usersList.length})</span></h3>
        <div className="table-wrap"><table className="sketch">
          <tbody>
            <tr><th>Username</th><th>Role</th><th>Created</th><th>Games</th><th>Actions</th></tr>
            {usersList.map((u: any) => (
              <tr key={u.username}>
                <td>{u.username}</td><td>{u.role}</td>
                <td>{fmtDay(u.createdAt)}</td><td>{u.gamesPlayed}</td>
                <td>
                  <button className="btn small" data-pass={u.username} onClick={() => setPassword(u.username)}>Set password</button>
                  {u.username !== app.user?.username && <button className="btn small ghost" data-del={u.username} onClick={() => delUser(u.username)}>✘ delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <h3 style={{ marginTop: 18 }}>➕ Add a user</h3>
        <div className="settings-grid" style={{ marginTop: 8 }}>
          <label className="field"><span>Username</span><input type="text" id="new-user" value={newUser} onChange={e => setNewUser(e.target.value)} /></label>
          <label className="field"><span>Password</span><input type="text" id="new-pass" value={newPass} onChange={e => setNewPass(e.target.value)} /></label>
          <label className="field"><span>Role</span>
            <select id="new-role" value={newRole} onChange={e => setNewRole(e.target.value)}>
              <option value="user">user</option><option value="moderator">moderator</option><option value="admin">admin</option>
            </select></label>
        </div>
        <p className="form-error" id="user-err">{userErr}</p>
        <button className="btn green" id="add-user-btn" disabled={!newUser.trim() || !newPass} onClick={addUser}>Add user</button>
      </div>

      {/* 📈 Built-in activity (game) statistics */}
      <div className="card alt">
        <h3>📈 Activity statistics <span style={{ opacity: 0.5, fontWeight: 400 }}>({games.length})</span></h3>
        <div className="table-wrap"><table className="sketch">
          <tbody>
            <tr><th>User</th><th>Date</th><th>Topic</th><th>Concept</th><th>Level</th><th>Score</th><th>Time</th></tr>
            {games.length ? games.slice().reverse().map((g: any, i: number) => (
              <tr key={g.id || i}>
                <td>{g.username}</td><td>{fmtDate(g.finishedAt)}</td>
                <td>{g.topic}</td><td>{g.concept}</td><td>{g.level}</td>
                <td>{g.correct}/{g.total}</td><td>{Math.floor(g.durationSec / 60)}:{String(g.durationSec % 60).padStart(2, '0')}</td>
              </tr>
            )) : <tr><td colSpan={7}>No games played yet.</td></tr>}
          </tbody>
        </table></div>
        <div className="slide-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn small" id="dash-export" onClick={downloadCsv}>⬇ Export all as CSV</button>
        </div>
      </div>
    </>
  );
}
