'use client';
/* Admin dashboard: the platform's data, grouped into tables — created slide tools,
 * created repositories, saved presentation runs (grades by user), AI token usage &
 * cost (per event + per user), users (with add/edit), and the built-in game stats.
 * Storage stays normalised (separate tables); the dashboard joins/groups for display.
 *
 * The dashboard shows ONE table per page (pick it from the tabs / Prev–Next). Each
 * table shows at most 4 rows and paginates; any cell over 100 chars is clipped with
 * an 👁 button that opens the full text in a popup. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { downloadCsv } from '@/lib/util';
import { PAGE_FIELDS, type PageTextField } from '@/lib/page-settings';
import { useApp } from '@/components/AppContext';
import { Loading } from '@/components/ui/Loading';
import { MiniChart, type ChartType, type Datum } from '@/components/ui/MiniChart';

// Output styles for the AI visual generator (matches the API's KINDS).
const VISUAL_KINDS: { key: string; label: string }[] = [
  { key: 'infographic', label: '📊 Infographic' },
  { key: 'chart', label: '📈 Chart poster' },
  { key: 'business-poster', label: '🏢 Business poster' },
  { key: 'marketing-poster', label: '📣 Marketing poster' },
  { key: 'business-plan', label: '🧭 Business-plan diagram' },
  { key: 'executive-summary', label: '🗂️ Executive summary' },
  { key: 'trend-forecast', label: '🔮 Trend & forecast' },
];

const fmtDate = (v: any) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); };
const fmtDay = (v: any) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(); };
const money = (n: number) => `$${(Number(n) || 0).toFixed(4)}`;

const ROWS_PER_PAGE = 4;
const CELL_LIMIT = 100;
type Cell = string | number | null | undefined | { node: React.ReactNode };

// A table that shows ROWS_PER_PAGE rows at a time (Prev/Next) and clips any text
// cell over CELL_LIMIT chars, revealing the full value in a popup via 👁.
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
                  <button type="button" title="Show the full text" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }} onClick={() => setView({ title: headers[ci] || '', text: s })}>👁</button>
                </td>
              );
              return <td key={ci}>{s || '—'}</td>;
            })}
          </tr>
        )) : <tr><td colSpan={headers.length}>{empty}</td></tr>}
      </tbody></table></div>
      {pages > 1 && (
        <>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
            <button className="btn small ghost" disabled={p <= 0} onClick={() => setPage(p - 1)}>‹ Prev</button>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Rows {p * ROWS_PER_PAGE + 1}–{Math.min(rows.length, (p + 1) * ROWS_PER_PAGE)} of {rows.length}</span>
            <button className="btn small ghost" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next ›</button>
          </div>
          <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.4, marginTop: 10 }} />
        </>
      )}
      {view && (
        <div onClick={() => setView(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '100%', padding: '16px 18px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>{view.title || 'Full text'}</b><button className="btn small ghost" onClick={() => setView(null)}>✕</button></div>
            <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }}>{view.text}</p>
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
  const [dash, setDash] = useState<{ tools: any[]; runs: any[]; usage?: any[]; usageByUser?: any[]; componentUsage?: any[] } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState(0);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [userErr, setUserErr] = useState('');
  // Data-analysis + AI-visual sections: which table to chart / feed the AI, the
  // chosen output style, a custom instruction, and the generated image.
  // Both table pickers default to "none" so nothing renders until a table is chosen.
  const [analysisSel, setAnalysisSel] = useState('none');
  const [visualSel, setVisualSel] = useState('none');
  const [visKind, setVisKind] = useState('infographic');
  // Output style can be a preset OR a typed custom style (✎ pencil toggles it).
  const [styleCustom, setStyleCustom] = useState(false);
  const [styleText, setStyleText] = useState('');
  const [visCustom, setVisCustom] = useState('');
  // Which image model to use for the generated visual (from /api/config).
  const [imageProviders, setImageProviders] = useState<{ id: string; label: string }[]>([]);
  const [visProvider, setVisProvider] = useState('');
  // Whether the database ACTUALLY works (a real query + write round-trip), not just
  // whether a DATABASE_URL is set. When false the app is on ephemeral per-request
  // file storage, so edits silently revert — we surface that (with the real error).
  const [dbOn, setDbOn] = useState<boolean | null>(null);
  const [dbErr, setDbErr] = useState('');
  useEffect(() => { API.get('/api/config').then((c: any) => setImageProviders(Array.isArray(c?.imageProviders) ? c.imageProviders : [])).catch(() => { /* ignore */ }); }, []);
  useEffect(() => {
    API.get('/api/health')
      .then((h: any) => { setDbOn(!!(h?.dbLive && h?.canWrite)); setDbErr(String(h?.error || '')); })
      .catch(() => { setDbOn(null); });
  }, [reload]);
  const [visImg, setVisImg] = useState<{ url: string; by: string } | null>(null);
  const [visBusy, setVisBusy] = useState(false);
  // Inline title/description editor (the ✎ pencil on a tool-table title cell).
  // Edits the page's Title and banner Description in one popup; persists via the
  // owner/admin settings route straight into the tools row.
  const [editTool, setEditTool] = useState<{ slug: string; title: string; description: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');
  const saveEdit = async () => {
    if (!editTool) return;
    const title = editTool.title.trim();
    if (!title) { setEditErr('Title can’t be empty.'); return; }
    setEditBusy(true); setEditErr('');
    try {
      const r: any = await API.put('/api/tools/settings', { slug: editTool.slug, title, description: editTool.description.trim() });
      if (r?.ok === false) { setEditErr('Save failed — you may not own this tool.'); setEditBusy(false); return; }
      // Reflect the change locally without a full reload.
      setDash(d => d ? { ...d, tools: d.tools.map((t: any) => t.slug === editTool.slug ? { ...t, title, description: editTool.description.trim() } : t) } : d);
      setEditTool(null);
    } catch (e: any) { setEditErr(e?.message || 'Could not save.'); }
    setEditBusy(false);
  };
  // Page-chrome (banner titles/subtitles, discussion heading, cards-per-page) for
  // the Repositories & Slides landing pages — stored in the site_settings DB table.
  const [pageText, setPageText] = useState<Record<string, string>>({});
  useEffect(() => { API.get('/api/site-settings').then((r: any) => setPageText(r?.settings || {})).catch(() => { /* ignore */ }); }, [reload]);
  const [editField, setEditField] = useState<{ field: PageTextField; value: string } | null>(null);
  const [fieldBusy, setFieldBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState('');
  const savePageField = async () => {
    if (!editField) return;
    const f = editField.field;
    let value = editField.value.trim();
    if (f.type === 'number') { const n = Math.max(f.min ?? 1, Math.min(f.max ?? 60, parseInt(value, 10) || (f.min ?? 1))); value = String(n); }
    if (f.type === 'text' && !value) { setFieldErr('Can’t be empty.'); return; }
    setFieldBusy(true); setFieldErr('');
    try {
      const r: any = await API.put('/api/site-settings', { key: f.key, value });
      if (r?.error) { setFieldErr(r.error); setFieldBusy(false); return; }
      setPageText(s => ({ ...s, [f.key]: value }));
      setEditField(null);
    } catch (e: any) { setFieldErr(e?.message || 'Could not save.'); }
    setFieldBusy(false);
  };

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
  const usage = dash?.usage || [];
  const usageByUser = dash?.usageByUser || [];
  const componentUsage = dash?.componentUsage || [];

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

  // ---- rows for each table (plain strings, reused for table + CSV) ----
  const slideHeaders = ['Title', 'Owner', 'Visibility', 'Slides', 'Saved deck', 'AI', 'Created'];
  const slideRows: (string | number)[][] = slideTools.map((t: any) => [t.title, `@${t.owner}`, t.visibility, t.slideCount || '—', t.hasSavedDeck ? '📖 yes' : '—', t.aiGenerated ? '✦' : '—', fmtDate(t.createdAt)]);
  const repoHeaders = ['Title', 'Owner', 'Visibility', 'Cards', 'Kind', 'AI', 'Created'];
  const repoRows: (string | number)[][] = repoTools.map((t: any) => [t.title, `@${t.owner}`, t.visibility, t.cardCount || '—', t.archetype, t.aiGenerated ? '✦' : '—', fmtDate(t.createdAt)]);
  const runHeaders = ['User', 'Presentation', 'Topic', 'Level', 'Theme', 'Slides', 'Grade', 'Date'];
  const runRows: (string | number)[][] = runs.map((r: any) => [`@${r.user}`, r.toolTitle, r.topic || '—', r.level || '—', r.theme || '—', r.slides || '—', r.score == null ? '—' : `${r.score}%`, fmtDate(r.createdAt)]);
  const usageHeaders = ['User', 'Component', 'Provider', 'Tokens', 'Cost', 'Subject', 'Prompt', 'Date'];
  const usageRows: (string | number)[][] = usage.map((u: any) => [`@${u.user}`, u.kind, u.provider || '—', u.totalTokens || 0, money(u.costUsd), u.subject || '—', u.prompt || '—', fmtDate(u.createdAt)]);
  const costHeaders = ['User', 'Generations', 'Tokens', 'Images', 'Total cost'];
  const costRows: (string | number)[][] = usageByUser.map((u: any) => [`@${u.user}`, u.events, u.tokens, u.images, money(u.cost)]);
  const compHeaders = ['Component', 'How used', 'Correct?', 'Template', 'Tool', 'Topic', 'Level', 'Kind', 'Date'];
  const compRows: (string | number)[][] = componentUsage.map((c: any) => [
    c.component, c.role || '—', c.correct === true ? '✓' : c.correct === false ? '✗' : '—',
    c.template || '—', c.tool || '—', c.topic || '—', c.level || '—', c.subjectKind || '—', fmtDate(c.createdAt),
  ]);
  const gameHeaders = ['User', 'Date', 'Topic', 'Concept', 'Level', 'Score', 'Time'];
  const gameRows: (string | number)[][] = games.slice().reverse().map((g: any) => [g.username, fmtDate(g.finishedAt), g.topic, g.concept, g.level, `${g.correct}/${g.total}`, `${Math.floor(g.durationSec / 60)}:${String(g.durationSec % 60).padStart(2, '0')}`]);
  const userHeaders = ['Username', 'Role', 'Created', 'Games', 'Actions'];
  const userRows: Cell[][] = usersList.map((u: any) => [u.username, u.role, fmtDay(u.createdAt), u.gamesPlayed, {
    node: <>
      <button className="btn small" onClick={() => setPassword(u.username)}>Set password</button>
      {u.username !== app.user?.username && <button className="btn small ghost" onClick={() => delUser(u.username)}>✘ delete</button>}
    </>,
  }]);

  // A title cell with a ✎ pencil that opens the edit popup for that tool.
  const titleCell = (t: any): Cell => ({
    node: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>{t.title || '—'}</span>
        <button type="button" title="Edit this page’s title & description"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
          onClick={() => { setEditErr(''); setEditTool({ slug: t.slug, title: t.title || '', description: t.description || '' }); }}>✎</button>
      </span>
    ),
  });
  // Display rows: same as the plain rows but with an editable title cell in col 0.
  // (The plain rows stay for CSV export + the AI-visual text summary.)
  const slideDisplayRows: Cell[][] = slideTools.map((t: any, i: number) => [titleCell(t), ...slideRows[i].slice(1)]);
  const repoDisplayRows: Cell[][] = repoTools.map((t: any, i: number) => [titleCell(t), ...repoRows[i].slice(1)]);

  const totalCost = usageByUser.reduce((s: number, u: any) => s + (Number(u.cost) || 0), 0);

  // ---- one best-fit chart per table (relevant slice of the data) ----
  const topN = <T,>(a: T[], n = 6) => a.slice(0, n);
  const slideChart: Datum[] = topN(slideTools).map((t: any) => ({ label: t.title, value: t.slideCount || 0 }));
  const repoChart: Datum[] = topN(repoTools).map((t: any) => ({ label: t.title, value: t.cardCount || 0 }));
  const runByUser: Record<string, { sum: number; n: number }> = {};
  runs.forEach((r: any) => { if (r.score == null) return; (runByUser[r.user] ||= { sum: 0, n: 0 }); runByUser[r.user].sum += r.score; runByUser[r.user].n += 1; });
  const runChart: Datum[] = topN(Object.entries(runByUser).map(([u, v]) => ({ label: `@${u}`, value: Math.round(v.sum / v.n) })).sort((a, b) => b.value - a.value));
  const tokByKind: Record<string, number> = {};
  usage.forEach((u: any) => { tokByKind[u.kind] = (tokByKind[u.kind] || 0) + (u.totalTokens || 0); });
  const usageChart: Datum[] = topN(Object.entries(tokByKind).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value), 8);
  const costChart: Datum[] = topN(usageByUser).map((u: any) => ({ label: `@${u.user}`, value: Number((u.cost || 0).toFixed(4)) }));
  const roleCount: Record<string, number> = {};
  usersList.forEach((u: any) => { roleCount[u.role] = (roleCount[u.role] || 0) + 1; });
  const userChart: Datum[] = Object.entries(roleCount).map(([k, v]) => ({ label: k, value: v }));
  const gameChart: Datum[] = games.slice(-12).map((g: any, i: number) => ({ label: String(i + 1), value: g.total ? Math.round((g.correct / g.total) * 100) : 0 }));
  const compByType: Record<string, number> = {};
  componentUsage.forEach((c: any) => { compByType[c.component] = (compByType[c.component] || 0) + 1; });
  const compChart: Datum[] = topN(Object.entries(compByType).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value), 10);

  // Turn a table into a compact text summary for the AI visual generator.
  const summarize = (name: string, headers: string[], rows: Cell[][]) =>
    `Table: ${name}\nColumns: ${headers.join(' | ')}\n` +
    rows.slice(0, 20).map(r => r.map(c => (c && typeof c === 'object' && 'node' in c) ? '' : String(c ?? '')).join(' | ')).join('\n');

  // The tables, one per page. `footer` adds extra UI (the add-user form).
  type Chart = { type: ChartType; data: Datum[]; title: string; unit?: string };
  const sections: { key: string; label: string; count: number; headers: string[]; rows: Cell[][]; displayRows?: Cell[][]; empty: string; csv?: () => void; footer?: React.ReactNode; chart?: Chart }[] = [
    { key: 'slides', label: '🎞️ Slide tools', count: slideTools.length, headers: slideHeaders, rows: slideRows, displayRows: slideDisplayRows, empty: 'No slide tools yet.', csv: () => exportRows('slide-tools', slideHeaders, slideRows), chart: { type: 'hbar', data: slideChart, title: 'Slides per tool (top 6)' } },
    { key: 'repos', label: '🗂️ Repositories', count: repoTools.length, headers: repoHeaders, rows: repoRows, displayRows: repoDisplayRows, empty: 'No repositories yet.', csv: () => exportRows('repositories', repoHeaders, repoRows), chart: { type: 'hbar', data: repoChart, title: 'Cards per repository (top 6)' } },
    { key: 'runs', label: '📊 Presentation runs', count: runs.length, headers: runHeaders, rows: runRows, empty: 'No saved runs yet — a moderator plays a presentation to the end and it lands here.', csv: () => exportRows('presentation-runs', runHeaders, runRows), chart: { type: 'bar', data: runChart, title: 'Average grade by user', unit: '%' } },
    { key: 'usage', label: '💸 Token usage', count: usage.length, headers: usageHeaders, rows: usageRows, empty: 'No AI usage recorded yet.', csv: () => exportRows('token-usage', usageHeaders, usageRows), chart: { type: 'donut', data: usageChart, title: 'Tokens by component' } },
    { key: 'cost', label: '📉 Cost by user', count: usageByUser.length, headers: costHeaders, rows: costRows, empty: 'No usage yet.', csv: () => exportRows('cost-by-user', costHeaders, costRows), chart: { type: 'hbar', data: costChart, title: 'Estimated cost by user ($)' }, footer: <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>Estimated total AI spend so far: <b>{money(totalCost)}</b> (token counts & prices are approximate — for profitability estimates, not billing).</p> },
    { key: 'components', label: '🧩 Component usage', count: componentUsage.length, headers: compHeaders, rows: compRows, empty: 'No component usage yet.', csv: () => exportRows('component-usage', compHeaders, compRows), chart: { type: 'donut', data: compChart, title: 'Which components are used' }, footer: <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>Every row is one component used on a played slide — its type, how it was used, whether the learner got it right, and the slide template. Real rows come from saved decks; clearly-marked (example) rows backfill so the AI can learn which components suit which subjects.</p> },
    {
      key: 'users', label: '👥 Users', count: usersList.length, headers: userHeaders, rows: userRows, empty: 'No users.',
      chart: { type: 'donut', data: userChart, title: 'Users by role' },
      footer: (
        <>
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
        </>
      ),
    },
    { key: 'games', label: '📈 Activity stats', count: games.length, headers: gameHeaders, rows: gameRows, empty: 'No games played yet.', chart: { type: 'line', data: gameChart, title: 'Recent scores', unit: '%' }, footer: <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}><button className="btn small" onClick={downloadCsv}>⬇ Export all games as CSV</button></div> },
  ];
  // Pages in the pager: the data tables, then a Data-analysis page and an AI-visual
  // page (each with a dropdown to pick which table / all tables).
  const TABLE_PAGES = sections.length;
  const ANALYSIS = TABLE_PAGES, VISUALS = TABLE_PAGES + 1, PAGETEXT = TABLE_PAGES + 2;
  const totalPages = TABLE_PAGES + 3;
  const cur = Math.min(tab, totalPages - 1);
  const pageLabels = [...sections.map(s => s.label), '📊 Data analysis', '🎨 AI visuals', '📝 Page text'];
  const tableOptions = [{ key: 'none', label: '— none —' }, { key: 'all', label: '🗂️ All tables' }, ...sections.map(s => ({ key: s.key, label: s.label }))];

  // Generate an AI visual from the selected table (or all tables) + output style
  // (a preset OR a typed custom style) + custom instruction.
  const genVisual = async () => {
    const all = visualSel === 'all';
    const chosen = all ? sections : sections.filter(s => s.key === visualSel);
    const summary = chosen.map(s => summarize(s.label, s.headers, s.rows)).join('\n\n');
    const tableName = all ? 'all tables' : (sections.find(s => s.key === visualSel)?.label || '(no table)');
    const customStyle = styleCustom ? styleText.trim() : '';
    setVisBusy(true);
    try {
      const r: any = await API.post('/api/dashboard/visual', { kind: customStyle ? 'custom' : visKind, customStyle, tableName, summary, includeAll: all, allSummaries: summary, custom: visCustom.trim(), imageProvider: visProvider });
      if (r?.url) setVisImg({ url: r.url, by: r.by || '' });
      else alert(r?.error || 'Could not generate an image.');
    } catch (e: any) { alert(e?.message || 'Could not generate an image.'); }
    setVisBusy(false);
  };

  // A dashed rule between components so it's clear where one ends and the next begins.
  const rule = <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.4, margin: '16px 0' }} />;

  return (
    <>
      {/* Title + subtitle container. */}
      <h1 className="view-title">Teacher’s <span className="scribble-underline">dashboard</span></h1>
      <p className="view-sub" style={{ textAlign: 'center' }}>One page at a time — pick a section below.</p>
      {dbOn === false && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#b23', margin: '0 0 8px', maxWidth: 720, marginInline: 'auto' }}>
          ⚠ Database not writable — the app is on temporary file storage, so edits (titles, page text, etc.) don’t stick and revert on reload.
          {dbErr ? <> Reason: <code>{dbErr}</code></> : null} Fix <code>DATABASE_URL</code> (and that the DB is reachable) to persist changes. See <code>/api/health</code>.
        </p>
      )}
      {rule}

      {/* Section picker container (the filtering buttons). */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', margin: '0 0 4px' }}>
        {pageLabels.map((lbl, i) => (
          <button key={i} className={`btn small ${i === cur ? 'blue' : 'ghost'}`} onClick={() => setTab(i)}>{lbl}{i < TABLE_PAGES ? <span style={{ opacity: 0.6 }}> ({sections[i].count})</span> : null}</button>
        ))}
      </div>
      {rule}

      {cur < TABLE_PAGES ? (() => {
        const sec = sections[cur];
        return (
          <div className={cur % 2 ? 'card alt' : 'card'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>{sec.label} <span style={{ opacity: 0.5, fontWeight: 400 }}>({sec.count})</span></h3>
              {sec.csv && sec.count > 0 && <button className="btn small" onClick={sec.csv}>⬇ CSV</button>}
            </div>
            <PagedTable key={sec.key} headers={sec.headers} rows={sec.displayRows || sec.rows} empty={sec.empty} />
            {sec.footer}
          </div>
        );
      })() : cur === ANALYSIS ? (
        <div className="card">
          <h3 style={{ margin: '0 0 8px' }}>📊 Data analysis</h3>
          <label className="field" style={{ maxWidth: 280 }}><span>Table to chart</span>
            <select value={analysisSel} onChange={e => setAnalysisSel(e.target.value)}>
              {tableOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          {rule}
          {analysisSel === 'none'
            ? <p style={{ fontSize: 13, opacity: 0.6, textAlign: 'center' }}>Pick a table (or all tables) above to see its chart.</p>
            : (analysisSel === 'all' ? sections : sections.filter(s => s.key === analysisSel)).map((s, i, arr) => (
              <div key={s.key}>
                {s.chart && s.count > 0
                  ? <MiniChart type={s.chart.type} data={s.chart.data} title={`${s.label} — ${s.chart.title}`} unit={s.chart.unit} />
                  : <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center' }}>{s.label}: no data to chart yet.</p>}
                {i < arr.length - 1 && rule}
              </div>
            ))}
        </div>
      ) : (
        <div className="card alt">
          <h3 style={{ margin: '0 0 8px' }}>🎨 AI visuals from your data</h3>
          <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>Pick a table (or all tables) and a style; the AI reads the data and generates an infographic / poster / diagram.</p>
          {/* All controls on ONE row (wraps only on very narrow screens). */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ margin: 0, flex: '0 1 150px', minWidth: 120 }}><span>Data to use</span>
              <select value={visualSel} onChange={e => setVisualSel(e.target.value)}>
                {tableOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
            <label className="field" style={{ margin: 0, flex: '0 1 170px', minWidth: 130 }}><span>Output style
              {/* ✎ pencil flips the preset dropdown to a free-text custom style (▾ back). */}
              <button type="button" title={styleCustom ? 'Pick from the list' : 'Type a custom style'} onClick={() => setStyleCustom(c => !c)}
                style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>{styleCustom ? '▾' : '✎'}</button>
            </span>
              {styleCustom
                ? <input type="text" value={styleText} onChange={e => setStyleText(e.target.value)} placeholder="Custom style…" />
                : <select value={visKind} onChange={e => setVisKind(e.target.value)}>
                    {VISUAL_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>}
            </label>
            <label className="field" style={{ margin: 0, flex: '0 1 160px', minWidth: 120 }}><span>Image model</span>
              <select value={visProvider} onChange={e => setVisProvider(e.target.value)} title="Which image generator to use">
                <option value="">Auto (best available)</option>
                {imageProviders.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="field" style={{ margin: 0, flex: '1 1 180px', minWidth: 140 }}><span>Custom instruction (optional)</span>
              <input type="text" value={visCustom} onChange={e => setVisCustom(e.target.value)} placeholder="e.g. emphasise cost per user" />
            </label>
            <button className="btn blue" style={{ flex: '0 0 auto' }} disabled={visBusy} onClick={genVisual}>{visBusy ? '🎨 …' : '🎨 Generate'}</button>
          </div>
          {rule}
          {visImg
            ? <figure style={{ margin: 0, textAlign: 'center' }}>
                <img src={visImg.url} alt="AI visual of the dashboard data" style={{ maxWidth: '100%', maxHeight: 560, borderRadius: 10, border: '2px solid var(--ink)' }} />
                {visImg.by && <figcaption style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>🖼 generated by {visImg.by}</figcaption>}
              </figure>
            : <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center' }}>No visual yet — choose your options and press Generate. (Needs an image model configured.)</p>}
        </div>
      )}

      {cur === PAGETEXT && (
        <div className="card">
          <h3 style={{ margin: '0 0 4px' }}>📝 Page text &amp; layout</h3>
          <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>
            The banner title, subtitle, discussion heading and cards-per-page for the two landing pages.
            Each row is a live value from the <code>site_settings</code> database table — edit it here and the page renders from the DB.
          </p>
          <div className="table-wrap"><table className="sketch"><tbody>
            <tr><th>Page</th><th>Field</th><th>Current value</th><th>Edit</th></tr>
            {PAGE_FIELDS.map((f) => (
              <tr key={f.key}>
                <td>{f.page === 'presentation' ? '🎞️ Slides' : '🗂️ Repositories'}</td>
                <td>{f.label}</td>
                <td style={{ opacity: pageText[f.key] ? 1 : 0.55 }}>{pageText[f.key] || `${f.default} (default)`}</td>
                <td><button type="button" title={`Edit ${f.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
                  onClick={() => { setFieldErr(''); setEditField({ field: f, value: pageText[f.key] ?? f.default }); }}>✎</button></td>
              </tr>
            ))}
          </tbody></table></div>
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>Tip: keep an emoji in the banner title if you want one (e.g. “🎞️ Slides”). Cards-per-page accepts 1–60.</p>
        </div>
      )}

      {rule}
      {/* Page pager container. */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
        <button className="btn small ghost" disabled={cur <= 0} onClick={() => setTab(cur - 1)}>‹ Prev</button>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Page {cur + 1} / {totalPages}</span>
        <button className="btn small ghost" disabled={cur >= totalPages - 1} onClick={() => setTab(cur + 1)}>Next ›</button>
      </div>
      {rule}

      {/* ✎ Edit a page's title & banner description (from the tool tables). */}
      {editTool && (
        <div onClick={() => !editBusy && setEditTool(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b>✎ Edit page</b>
              <button className="btn small ghost" onClick={() => !editBusy && setEditTool(null)}>✕</button>
            </div>
            <label className="field" style={{ display: 'block' }}><span>Title</span>
              <input type="text" autoFocus value={editTool.title} disabled={editBusy} maxLength={120}
                onChange={e => setEditTool(s => s && { ...s, title: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }} style={{ width: '100%' }} />
            </label>
            <label className="field" style={{ display: 'block', marginTop: 10 }}><span>Banner description</span>
              <textarea value={editTool.description} disabled={editBusy} maxLength={400}
                onChange={e => setEditTool(s => s && { ...s, description: e.target.value })}
                placeholder="The subtitle shown under the page title…" style={{ width: '100%', minHeight: 72 }} />
            </label>
            {editErr && <p style={{ color: '#b23', fontSize: 12, margin: '8px 0 0' }}>{editErr}</p>}
            {dbOn === false && <p style={{ color: '#b23', fontSize: 11, margin: '8px 0 0' }}>⚠ No database connected — this will revert on the next deploy.</p>}
            <div className="slide-actions" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="btn small ghost" disabled={editBusy} onClick={() => setEditTool(null)}>Cancel</button>
              <button className="btn green" disabled={editBusy} onClick={saveEdit}>{editBusy ? 'Saving…' : '💾 Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ✎ Edit a page-text / layout field (from the Page text table). */}
      {editField && (
        <div onClick={() => !fieldBusy && setEditField(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <b>✎ {editField.field.page === 'presentation' ? 'Slides' : 'Repositories'} — {editField.field.label}</b>
              <button className="btn small ghost" onClick={() => !fieldBusy && setEditField(null)}>✕</button>
            </div>
            <label className="field" style={{ display: 'block' }}><span>Value</span>
              <input type={editField.field.type === 'number' ? 'number' : 'text'} autoFocus value={editField.value} disabled={fieldBusy}
                min={editField.field.min} max={editField.field.max} maxLength={editField.field.type === 'number' ? undefined : 240}
                onChange={e => setEditField(s => s && { ...s, value: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') savePageField(); }} style={{ width: '100%' }} />
            </label>
            <p style={{ fontSize: 11, opacity: 0.55, margin: '6px 0 0' }}>Default: {editField.field.default}</p>
            {fieldErr && <p style={{ color: '#b23', fontSize: 12, margin: '8px 0 0' }}>{fieldErr}</p>}
            {dbOn === false && <p style={{ color: '#b23', fontSize: 11, margin: '8px 0 0' }}>⚠ No database connected — this will revert on the next deploy.</p>}
            <div className="slide-actions" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="btn small ghost" disabled={fieldBusy} onClick={() => setEditField(null)}>Cancel</button>
              <button className="btn green" disabled={fieldBusy} onClick={savePageField}>{fieldBusy ? 'Saving…' : '💾 Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
