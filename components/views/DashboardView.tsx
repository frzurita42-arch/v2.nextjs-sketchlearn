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
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { OutlineBox } from '@/components/ui/OutlineBox';
import { useShelfTitle } from '@/components/tools/useShelfTitle';
import { SLIDE_ACTIVITIES } from '@/lib/slide-activities';
import { logActivity, rememberPreset, recallPreset } from '@/lib/activity-log';
import { useApp } from '@/components/AppContext';
import { Loading } from '@/components/ui/Loading';
import { MiniChart, type ChartType, type Datum } from '@/components/ui/MiniChart';
import { TokenWindow } from '@/components/dashboard/TokenWindow';

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
// cell over CELL_LIMIT chars, revealing the full value in a popup via 👁. The
// full text stays in the row data, so search/CSV always see it — only the
// on-screen cell is clipped.
function PagedTable({ headers, rows, empty, rowIds, onDelete, compact }: { headers: string[]; rows: Cell[][]; empty: string; rowIds?: string[]; onDelete?: (id: string) => void; compact?: boolean }) {
  const [page, setPage] = useState(0);
  const [view, setView] = useState<{ title: string; text: string } | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const p = Math.min(page, pages - 1);
  const slice = rows.slice(p * ROWS_PER_PAGE, p * ROWS_PER_PAGE + ROWS_PER_PAGE);
  const canDelete = !!(onDelete && rowIds);
  const totalCols = headers.length + (canDelete ? 1 : 0);
  return (
    <>
      <div className="table-wrap"><table className={compact ? 'sketch compact' : 'sketch'}><tbody>
        <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}{canDelete && <th aria-label="delete" style={{ width: 28 }}></th>}</tr>
        {slice.length ? slice.map((r, ri) => {
          const abs = p * ROWS_PER_PAGE + ri;
          const id = rowIds ? rowIds[abs] : '';
          return (
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
            {canDelete && <td><button type="button" title="Delete this row (hides it from the dashboard)" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }} onClick={() => { if (id && confirm('Delete this row from the dashboard?')) onDelete!(id); }}>🗑</button></td>}
          </tr>
          );
        }) : <tr><td colSpan={totalCols}>{empty}</td></tr>}
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
  const [dash, setDash] = useState<{ tools: any[]; runs: any[]; plays?: any[]; usage?: any[]; usageByUser?: any[]; componentUsage?: any[]; buildLog?: any[]; registry?: any[]; hiddenRows?: string[] } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [tokens, setTokens] = useState<any>(null);
  // Remember the last dashboard section so it reopens where you left off, and log
  // the navigation to the activity trail.
  const [tab, setTab] = useState<number>(() => { const v = parseInt(recallPreset('dash_tab', '0'), 10); return Number.isFinite(v) && v >= 0 ? v : 0; });
  const selectTab = (i: number, label?: string) => { setTab(i); rememberPreset('dash_tab', String(i)); logActivity('nav', 'dashboard', { section: label || `#${i}` }); };
  // Standard, DB-editable SectionHeaders for the two dashboard areas.
  const sectionsHdr = useShelfTitle('dashSectionsShelfTitle', '📂 Dashboard sections');
  const tablesHdr = useShelfTitle('dashTablesShelfTitle', '📊 Tables');
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
      logActivity('edit', `tool: ${editTool.slug}`, { title, description: editTool.description.trim() });
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
  // Activity trail (navigation + preset/setting changes across the app).
  const [activity, setActivity] = useState<any[]>([]);
  useEffect(() => { API.get('/api/activity?limit=300').then((r: any) => setActivity(Array.isArray(r?.items) ? r.items : [])).catch(() => { /* ignore */ }); }, [reload, tab]);
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
      logActivity('edit', `page-text: ${f.key}`, { page: f.page, field: f.label, from: pageText[f.key] ?? f.default, to: value });
      setPageText(s => ({ ...s, [f.key]: value }));
      setEditField(null);
    } catch (e: any) { setFieldErr(e?.message || 'Could not save.'); }
    setFieldBusy(false);
  };

  useEffect(() => {
    if (!app.user) { app.nav('home'); return; }
    const role = app.user.role;
    let cancelled = false;
    // Everyone gets their token window.
    API.get('/api/tokens').then((t: any) => { if (!cancelled) setTokens(t); }).catch(() => { /* ignore */ });
    if (role === 'admin') {
      Promise.all([API.get('/api/users'), API.get('/api/games'), API.get('/api/dashboard')])
        .then(([u, g, d]: any[]) => { if (!cancelled) { setUsersList(u); setGames(g); setDash(d && Array.isArray(d.tools) ? d : { tools: [], runs: [] }); } })
        .catch((e: any) => { if (!cancelled) setError(e.message); });
    } else if (role === 'moderator') {
      // Moderators get their OWN work (server-scoped); no users/games access.
      API.get('/api/dashboard').then((d: any) => { if (!cancelled) setDash(d && Array.isArray(d.tools) ? d : { tools: [], runs: [] }); }).catch((e: any) => { if (!cancelled) setError(e.message); });
    }
    // Plain users: token window only.
    return () => { cancelled = true; };
  }, [reload, app]);

  const slideTools = useMemo(() => (dash?.tools || []).filter((t: any) => t.archetype === 'lesson'), [dash]);
  const repoTools = useMemo(() => (dash?.tools || []).filter((t: any) => t.archetype !== 'lesson'), [dash]);
  const runs = dash?.runs || [];
  const plays = dash?.plays || [];
  const usage = dash?.usage || [];
  const usageByUser = dash?.usageByUser || [];
  const componentUsage = dash?.componentUsage || [];
  const buildLog = dash?.buildLog || [];
  const registry = dash?.registry || [];
  // 🧱 Components table search: a plain text filter, or (toggled) an AI search
  // where the admin describes what they need and only the matching rows stay.
  const [regQuery, setRegQuery] = useState('');
  const [regAi, setRegAi] = useState(false);
  const [regAiBusy, setRegAiBusy] = useState(false);
  const [regAiIds, setRegAiIds] = useState<string[] | null>(null); // null = AI filter not run yet
  const [regAiErr, setRegAiErr] = useState('');
  // Sort the Components table by usage count: '' = as-listed, 'desc' = most used
  // first, 'asc' = least used first.
  const [regSort, setRegSort] = useState<'' | 'desc' | 'asc'>('');
  const [repoPreview, setRepoPreview] = useState<{ title: string; cardTitle: string; kind: string; url: string; lastEdited: string } | null>(null);
  // Clean password-edit popup (admin): pick a user, type a new password (hashed
  // server-side; the plain text is never stored). Replaces the old prompt().
  const [pwEdit, setPwEdit] = useState<{ username: string } | null>(null);
  const [pwVal, setPwVal] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  // Soft-deleted rows: server-persisted "table:id" keys + any deleted this session.
  const hiddenRows = dash?.hiddenRows || [];
  const [hiddenExtra, setHiddenExtra] = useState<Set<string>>(new Set());
  const hidden = useMemo(() => new Set<string>([...hiddenRows, ...Array.from(hiddenExtra)]), [hiddenRows, hiddenExtra]);

  // Non-admins get a focused dashboard: a plain USER sees only their 🎟 token
  // window; a MODERATOR also sees their own work (tools they built + runs of those
  // tools). None of the site-internal / other-users' tables are shown. (All hooks
  // above have run, so this early return is safe.)
  // Render the dashboard for the EFFECTIVE role, so an admin using the "View as"
  // bar (user / moderator / admin) actually sees that role's dashboard instead of
  // always the admin one. For everyone else this is just their real role.
  const myRole = app.eff().role;
  if (myRole !== 'admin') {
    const isMod = myRole === 'moderator';
    const rule = <div style={{ borderTop: '2px dashed var(--ink)', opacity: 0.4, margin: '18px auto', maxWidth: 820 }} />;
    return (
      <>
        <PageHeader page="dashboard" />
        <SectionHeader title="🎟 My tokens" maxWidth={820} />
        <TokenWindow tokens={tokens} isAdmin={false} />
        {error && <p style={{ color: 'var(--danger,#e4572e)', textAlign: 'center', fontSize: 13 }}>{error}</p>}
        {isMod && (<>
          {rule}
          <SectionHeader title="🗂 My work" maxWidth={820} />
          {/* minmax(0,1fr) + min-width:0 let each card shrink to the page width so
              the wide table scrolls INSIDE its own .table-wrap instead of pushing
              the whole page wider. */}
          <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
            <div className="card" style={{ minWidth: 0 }}><h3 style={{ margin: '0 0 6px' }}>🎬 My slide tools <span style={{ opacity: 0.5, fontWeight: 400 }}>({slideTools.length})</span></h3>
              <PagedTable compact headers={['Title', 'Slides', 'Visibility', 'Created']} empty="You haven't created any slide tools yet."
                rows={slideTools.map((t: any) => [t.title, t.slideCount || 0, t.visibility, fmtDate(t.createdAt)])} /></div>
            <div className="card alt" style={{ minWidth: 0 }}><h3 style={{ margin: '0 0 6px' }}>📁 My repositories <span style={{ opacity: 0.5, fontWeight: 400 }}>({repoTools.length})</span></h3>
              <PagedTable compact headers={['Title', 'Cards', 'Visibility', 'Created']} empty="You haven't created any repositories yet."
                rows={repoTools.map((t: any) => [t.title, t.cardCount || 0, t.visibility, fmtDate(t.createdAt)])} /></div>
            <div className="card" style={{ minWidth: 0 }}><h3 style={{ margin: '0 0 6px' }}>▶️ Runs of my tools <span style={{ opacity: 0.5, fontWeight: 400 }}>({runs.length})</span></h3>
              <PagedTable compact headers={['Tool', 'User', 'Topic', 'Score', 'When']} empty="No one has played your tools yet."
                rows={runs.map((r: any) => [r.toolTitle, r.user, r.topic, r.score == null ? '—' : String(r.score), fmtDate(r.createdAt)])} /></div>
            {/* History of activities I PLAYED (any tool, not just my own). */}
            <div className="card alt" style={{ minWidth: 0 }}><h3 style={{ margin: '0 0 6px' }}>🕹 Activities I&apos;ve played <span style={{ opacity: 0.5, fontWeight: 400 }}>({plays.length})</span></h3>
              <PagedTable compact headers={['Tool', 'Topic', 'Level', 'Score', 'Played']} empty="You haven't played any activities yet."
                rows={plays.map((r: any) => [r.toolTitle, r.topic || '—', r.level || '—', r.score == null ? '—' : String(r.score), fmtDate(r.createdAt)])} /></div>
            {/* What each of my generations was worth (rough estimate) + the total. */}
            <div className="card" style={{ minWidth: 0 }}>
              <h3 style={{ margin: '0 0 6px' }}>💸 My generations <span style={{ opacity: 0.5, fontWeight: 400 }}>({usage.length})</span></h3>
              <p style={{ fontSize: 13, opacity: 0.75, margin: '0 0 8px' }}>Estimated total worth: <b>{money(usage.reduce((s: number, u: any) => s + (Number(u.costUsd) || 0), 0))}</b> <span style={{ opacity: 0.6 }}>· rough public-rate estimate, not billing.</span></p>
              <PagedTable compact headers={['What', 'Provider', 'Subject', 'Tokens', 'Est. worth', 'When']} empty="No generations recorded yet."
                rows={usage.map((u: any) => [u.kind || '—', u.provider || '—', u.subject || '—', u.totalTokens || 0, money(u.costUsd), fmtDate(u.createdAt)])} /></div>
          </div>
        </>)}
      </>
    );
  }

  const rowKey = (table: string, id: string) => `${table}:${id}`;
  const notHidden = (table: string) => (id: string) => !hidden.has(rowKey(table, id));
  const hideRow = (table: string, id: string) => {
    const key = rowKey(table, id);
    setHiddenExtra(s => { const n = new Set(s); n.add(key); return n; });
    logActivity('delete', `${table}: ${id}`, {});
    API.post('/api/dashboard/hide', { rowKey: key }).catch(() => { /* stays hidden optimistically */ });
  };

  if (error) return <div className="card">{error}</div>;
  if (usersList === null || dash === null) return <Loading text="Opening the teacher’s desk…" />;

  const addUser = async () => {
    try {
      await API.post('/api/users', { username: newUser.trim(), password: newPass, role: newRole });
      setNewUser(''); setNewPass(''); setUserErr(''); setReload(n => n + 1);
    } catch (e: any) { setUserErr(e.message); }
  };
  // Open the clean password popup for a user.
  const setPassword = (username: string) => { setPwEdit({ username }); setPwVal(''); setPwShow(false); setPwMsg(''); };
  const savePassword = async () => {
    if (!pwEdit || !pwVal) return;
    setPwBusy(true); setPwMsg('');
    try { await API.post(`/api/users/${encodeURIComponent(pwEdit.username)}/password`, { password: pwVal }); setPwMsg('✓ Password updated (stored hashed).'); setPwVal(''); setTimeout(() => setPwEdit(null), 900); }
    catch (e: any) { setPwMsg(e?.message || 'Could not update the password.'); }
    setPwBusy(false);
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

  // Visible (non-soft-deleted) sources — the tables, ids and counts all derive
  // from these so a deleted row disappears everywhere consistently.
  const vSlide = slideTools.filter((t: any) => notHidden('slides')(t.slug));
  const vRepo = repoTools.filter((t: any) => notHidden('repos')(t.slug));
  const vRuns = runs.filter((r: any) => notHidden('runs')(r.id));
  const vUsage = usage.filter((u: any) => notHidden('usage')(u.id));
  const vCost = usageByUser.filter((u: any) => notHidden('cost')(u.user));
  const vComp = componentUsage.filter((c: any) => notHidden('components')(c.id));
  const vBuild = buildLog.filter((e: any) => notHidden('build')(e.id));
  const vReg = registry.filter((e: any) => notHidden('registry')(e.id));
  // Apply the Components search: AI mode keeps only the ids the AI picked
  // (all rows until it runs); plain mode is a substring match across all fields.
  const regNeedle = regQuery.trim().toLowerCase();
  const vRegShown = vReg.filter((e: any) => {
    if (regAi) return !regAiIds || regAiIds.includes(String(e.id));
    if (!regNeedle) return true;
    return [e.name, e.kind, e.description, e.inputs, e.location, e.recommendations, e.keywords].join(' ').toLowerCase().includes(regNeedle);
  }).slice().sort((a: any, b: any) => {
    if (!regSort) return 0;
    const d = (Number(a.uses) || 0) - (Number(b.uses) || 0);
    return regSort === 'asc' ? d : -d;
  });
  const runRegAi = async () => {
    const q = regQuery.trim();
    if (!q) { setRegAiIds(null); return; }
    setRegAiBusy(true); setRegAiErr('');
    try {
      const r: any = await API.post('/api/dashboard/registry-search', {
        query: q,
        rows: vReg.map((e: any) => ({ id: String(e.id), text: `${e.name} (${e.kind}) — ${e.description} Inputs: ${e.inputs || '—'}. Seen on page: ${e.keywords || ''}. Location: ${e.location}. Notes: ${e.recommendations}` })),
      });
      if (Array.isArray(r?.ids)) setRegAiIds(r.ids.map(String));
      else setRegAiErr(r?.error || 'AI search failed — try again.');
    } catch (e: any) { setRegAiErr(e?.message || 'AI search failed — try again.'); }
    setRegAiBusy(false);
  };
  const vGames = games.slice().reverse().filter((g: any, i: number) => notHidden('games')(String(g.id || g.finishedAt || i)));
  const vUsers = usersList.filter((u: any) => notHidden('users')(u.username));

  // ---- rows for each table (plain strings, reused for table + CSV) ----
  const joinKeywords = (k: any) => Array.isArray(k) ? k.slice(0, 10).join(', ') : '—';
  const slideHeaders = ['Title', 'Owner', 'Visibility', 'Created', 'Last edited', 'Keywords', 'Slides', 'Saved deck', 'AI'];
  const slideRows: (string | number)[][] = vSlide.map((t: any) => [t.title, `@${t.owner}`, t.visibility, fmtDate(t.createdAt), fmtDate(t.slideLastEdited || t.updatedAt || t.createdAt), joinKeywords(t.slideKeywords), t.slideCount || '—', t.hasSavedDeck ? '📖 yes' : '—', t.aiGenerated ? '✦' : '—']);
  const slideIds = vSlide.map((t: any) => String(t.slug));
  const repoHeaders = ['Title', 'Owner', 'Visibility', 'Created', 'Last edited', 'Keywords', 'Cards', 'Kind', 'AI', 'Image'];
  const repoRows: (string | number)[][] = vRepo.map((t: any) => [
    t.title,
    `@${t.owner}`,
    t.visibility,
    fmtDate(t.createdAt),
    fmtDate(t.repoLastEdited || t.updatedAt || t.createdAt),
    joinKeywords(t.repoKeywords),
    t.cardCount || '—',
    t.archetype,
    t.aiGenerated ? '✦' : '—',
    t.repoImageUrl ? `${t.repoImageKind || 'Saved image'} — ${t.repoImageTitle || 'card'}` : '—',
  ]);
  const repoIds = vRepo.map((t: any) => String(t.slug));
  const runHeaders = ['User', 'Presentation', 'Created', 'Last edited', 'Keywords', 'Topic', 'Level', 'Theme', 'Slides', 'Grade'];
  const runRows: (string | number)[][] = vRuns.map((r: any) => [`@${r.user}`, r.toolTitle, fmtDate(r.createdAt), fmtDate(r.updatedAt || r.createdAt), joinKeywords(r.runKeywords), r.topic || '—', r.level || '—', r.theme || '—', r.slides || '—', r.score == null ? '—' : `${r.score}%`]);
  const runIds = vRuns.map((r: any) => String(r.id));
  const usageHeaders = ['User', 'Component', 'Provider', 'Tokens', 'Cost', 'Subject', 'Prompt', 'Date'];
  const usageRows: (string | number)[][] = vUsage.map((u: any) => [`@${u.user}`, u.kind, u.provider || '—', u.totalTokens || 0, money(u.costUsd), u.subject || '—', u.prompt || '—', fmtDate(u.createdAt)]);
  const usageIds = vUsage.map((u: any) => String(u.id));
  const costHeaders = ['User', 'Generations', 'Tokens', 'Images', 'Total cost'];
  const costRows: (string | number)[][] = vCost.map((u: any) => [`@${u.user}`, u.events, u.tokens, u.images, money(u.cost)]);
  const costIds = vCost.map((u: any) => String(u.user));
  const compHeaders = ['Component', 'How used', 'Correct?', 'Template', 'Tool', 'Topic', 'Level', 'Kind', 'Date'];
  const compRows: (string | number)[][] = vComp.map((c: any) => [
    c.component, c.role || '—', c.correct === true ? '✓' : c.correct === false ? '✗' : '—',
    c.template || '—', c.tool || '—', c.topic || '—', c.level || '—', c.subjectKind || '—', fmtDate(c.createdAt),
  ]);
  const compIds = vComp.map((c: any) => String(c.id));
  const buildHeaders = ['Date', 'Request (prompt)', 'Result / progress', 'Recommendations', 'Context', 'Tokens', 'Files', 'Commit', 'Status'];
  const buildRows: (string | number)[][] = vBuild.map((e: any) => [
    fmtDate(e.date), e.prompt || '—', e.summary || '—', e.recommendations || '—', e.context || '—',
    e.tokens || 0, e.files || 0, e.commit || '—', e.status || '—',
  ]);
  const buildIds = vBuild.map((e: any) => String(e.id));
  const regHeaders = ['Name', 'Kind', 'Uses', 'Description', 'Inputs', 'File location', 'Recommendations', 'Added'];
  const regRows: (string | number)[][] = vRegShown.map((e: any) => [
    e.name, e.kind, Number(e.uses) || 0, e.description || '—', e.inputs || '—', e.location || '—', e.recommendations || '—', fmtDate(e.createdAt),
  ]);
  const regIds = vRegShown.map((e: any) => String(e.id));
  // The catalogue of slide activities a generated slide-tool is built from — the
  // record of "templates & activities" behind the study-path tool generator.
  const vAct = SLIDE_ACTIVITIES.filter((a: any) => notHidden('activities')(a.key));
  const actHeaders = ['Activity', 'Type', 'Description'];
  const actRows: (string | number)[][] = vAct.map((a: any) => [a.label, a.kind, a.description]);
  const actIds = vAct.map((a: any) => String(a.key));
  const gameHeaders = ['User', 'Date', 'Topic', 'Concept', 'Level', 'Score', 'Time'];
  const gameRows: (string | number)[][] = vGames.map((g: any) => [g.username, fmtDate(g.finishedAt), g.topic, g.concept, g.level, `${g.correct}/${g.total}`, `${Math.floor(g.durationSec / 60)}:${String(g.durationSec % 60).padStart(2, '0')}`]);
  const gameIds = vGames.map((g: any, i: number) => String(g.id || g.finishedAt || i));
  const userHeaders = ['Username', 'Role', 'Created', 'Games', 'Actions'];
  const userRows: Cell[][] = vUsers.map((u: any) => [u.username, u.role, fmtDay(u.createdAt), u.gamesPlayed, {
    node: <>
      <button className="btn small" onClick={() => setPassword(u.username)}>🔑 Password</button>
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
  const repoImageCell = (t: any): Cell => {
    if (!t.repoImageUrl) return '—';
    return {
      node: (
        <button
          type="button"
          className="btn small ghost"
          onClick={() => setRepoPreview({
            title: t.title || 'Repository image',
            cardTitle: t.repoImageTitle || 'Untitled card',
            kind: t.repoImageKind || 'Saved image',
            url: t.repoImageUrl,
            lastEdited: fmtDate(t.repoLastEdited || t.updatedAt || t.createdAt),
          })}
        >
          View image
        </button>
      ),
    };
  };
  // Display rows: same as the plain rows but with an editable title cell in col 0.
  // (The plain rows stay for CSV export + the AI-visual text summary.)
  const slideDisplayRows: Cell[][] = vSlide.map((t: any, i: number) => [titleCell(t), ...slideRows[i].slice(1)]);
  const repoDisplayRows: Cell[][] = vRepo.map((t: any, i: number) => [titleCell(t), ...repoRows[i].slice(1, 9), repoImageCell(t)]);

  const totalCost = vCost.reduce((s: number, u: any) => s + (Number(u.cost) || 0), 0);

  // ---- one best-fit chart per table (relevant slice of the visible data) ----
  const topN = <T,>(a: T[], n = 6) => a.slice(0, n);
  const slideChart: Datum[] = topN(vSlide).map((t: any) => ({ label: t.title, value: t.slideCount || 0 }));
  const repoChart: Datum[] = topN(vRepo).map((t: any) => ({ label: t.title, value: t.cardCount || 0 }));
  const runByUser: Record<string, { sum: number; n: number }> = {};
  vRuns.forEach((r: any) => { if (r.score == null) return; (runByUser[r.user] ||= { sum: 0, n: 0 }); runByUser[r.user].sum += r.score; runByUser[r.user].n += 1; });
  const runChart: Datum[] = topN(Object.entries(runByUser).map(([u, v]) => ({ label: `@${u}`, value: Math.round(v.sum / v.n) })).sort((a, b) => b.value - a.value));
  const tokByKind: Record<string, number> = {};
  vUsage.forEach((u: any) => { tokByKind[u.kind] = (tokByKind[u.kind] || 0) + (u.totalTokens || 0); });
  const usageChart: Datum[] = topN(Object.entries(tokByKind).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value), 8);
  const costChart: Datum[] = topN(vCost).map((u: any) => ({ label: `@${u.user}`, value: Number((u.cost || 0).toFixed(4)) }));
  const roleCount: Record<string, number> = {};
  vUsers.forEach((u: any) => { roleCount[u.role] = (roleCount[u.role] || 0) + 1; });
  const userChart: Datum[] = Object.entries(roleCount).map(([k, v]) => ({ label: k, value: v }));
  const gameChart: Datum[] = vGames.slice(0, 12).map((g: any, i: number) => ({ label: String(i + 1), value: g.total ? Math.round((g.correct / g.total) * 100) : 0 }));
  const compByType: Record<string, number> = {};
  vComp.forEach((c: any) => { compByType[c.component] = (compByType[c.component] || 0) + 1; });
  const compChart: Datum[] = topN(Object.entries(compByType).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value), 10);
  const buildTokens = vBuild.reduce((s: number, e: any) => s + (Number(e.tokens) || 0), 0);
  const buildChart: Datum[] = vBuild.filter((e: any) => e.status !== 'context').slice(0, 10).map((e: any) => ({ label: e.commit || fmtDate(e.date), value: Number(e.tokens) || 0 }));

  // Turn a table into a compact text summary for the AI visual generator.
  const summarize = (name: string, headers: string[], rows: Cell[][]) =>
    `Table: ${name}\nColumns: ${headers.join(' | ')}\n` +
    rows.slice(0, 20).map(r => r.map(c => (c && typeof c === 'object' && 'node' in c) ? '' : String(c ?? '')).join(' | ')).join('\n');

  // The tables, one per page. `footer` adds extra UI (the add-user form).
  type Chart = { type: ChartType; data: Datum[]; title: string; unit?: string };
  const sections: { key: string; label: string; count: number; headers: string[]; rows: Cell[][]; displayRows?: Cell[][]; rowIds?: string[]; empty: string; csv?: () => void; footer?: React.ReactNode; chart?: Chart; compact?: boolean }[] = [
    { key: 'slides', label: '🎞️ Slide tools', count: vSlide.length, headers: slideHeaders, rows: slideRows, displayRows: slideDisplayRows, rowIds: slideIds, empty: 'No slide tools yet.', csv: () => exportRows('slide-tools', slideHeaders, slideRows), chart: { type: 'hbar', data: slideChart, title: 'Slides per tool (top 6)' } },
    { key: 'repos', label: '🗂️ Repositories', count: vRepo.length, headers: repoHeaders, rows: repoRows, displayRows: repoDisplayRows, rowIds: repoIds, empty: 'No repositories yet.', csv: () => exportRows('repositories', repoHeaders, repoRows), chart: { type: 'hbar', data: repoChart, title: 'Cards per repository (top 6)' } },
    { key: 'runs', label: '📊 Presentation runs', count: vRuns.length, headers: runHeaders, rows: runRows, rowIds: runIds, empty: 'No saved runs yet — a moderator plays a presentation to the end and it lands here.', csv: () => exportRows('presentation-runs', runHeaders, runRows), chart: { type: 'bar', data: runChart, title: 'Average grade by user', unit: '%' } },
    { key: 'usage', label: '💸 Token usage', count: vUsage.length, headers: usageHeaders, rows: usageRows, rowIds: usageIds, empty: 'No AI usage recorded yet.', csv: () => exportRows('token-usage', usageHeaders, usageRows), chart: { type: 'donut', data: usageChart, title: 'Tokens by component' } },
    { key: 'cost', label: '📉 Cost by user', count: vCost.length, headers: costHeaders, rows: costRows, rowIds: costIds, empty: 'No usage yet.', csv: () => exportRows('cost-by-user', costHeaders, costRows), chart: { type: 'hbar', data: costChart, title: 'Estimated cost by user ($)' }, footer: <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>Estimated total AI spend so far: <b>{money(totalCost)}</b> (token counts & prices are approximate — for profitability estimates, not billing).</p> },
    { key: 'components', label: '🧩 Component usage', count: vComp.length, headers: compHeaders, rows: compRows, rowIds: compIds, empty: 'No component usage yet.', csv: () => exportRows('component-usage', compHeaders, compRows), chart: { type: 'donut', data: compChart, title: 'Which components are used' }, footer: <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>Every row is one component used on a played slide — its type, how it was used, whether the learner got it right, and the slide template. Real rows come from saved decks; clearly-marked (example) rows backfill so the AI can learn which components suit which subjects.</p> },
    { key: 'build', label: '🏗️ Website building', count: vBuild.length, headers: buildHeaders, rows: buildRows, rowIds: buildIds, empty: 'No build log yet.', csv: () => exportRows('website-build-log', buildHeaders, buildRows), chart: { type: 'bar', data: buildChart, title: 'Est. tokens per change' }, footer: <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>The site’s own construction log: each request (prompt), a short result summary, future recommendations, a context note on what the site is/does, plus estimated tokens, files and the commit. Estimated build tokens so far: <b>{buildTokens.toLocaleString()}</b>.</p> },
    { key: 'registry', label: '🧱 Components', count: vRegShown.length, headers: regHeaders, rows: regRows, rowIds: regIds, compact: true, empty: vReg.length ? 'No components match your search.' : 'No components registered yet.', csv: () => exportRows('component-registry', regHeaders, regRows), footer: <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>Your containers & components: what each is, where it lives, a usage/improvement note, and when it was added. Tell me to add or remove entries and I’ll update this table.</p> },
    { key: 'activities', label: '🎛️ Slide activities', count: vAct.length, headers: actHeaders, rows: actRows, rowIds: actIds, empty: 'No activities.', csv: () => exportRows('slide-activities', actHeaders, actRows), footer: <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>The engaging activities (no tooltips) a generated slide tool is built from. “Create a slide tool from this repo” in a study path wires all of these into the new presentation generator, then its prompts generate the slides.</p> },
    {
      key: 'users', label: '👥 Users', count: vUsers.length, headers: userHeaders, rows: userRows, rowIds: vUsers.map((u: any) => String(u.username)), empty: 'No users.',
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
    { key: 'games', label: '📈 Activity stats', count: vGames.length, headers: gameHeaders, rows: gameRows, rowIds: gameIds, empty: 'No games played yet.', chart: { type: 'line', data: gameChart, title: 'Recent scores', unit: '%' }, footer: <div className="slide-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}><button className="btn small" onClick={downloadCsv}>⬇ Export all games as CSV</button></div> },
  ];
  // Pages in the pager: the data tables, then a Data-analysis page and an AI-visual
  // page (each with a dropdown to pick which table / all tables).
  const TABLE_PAGES = sections.length;
  const TOKENS = TABLE_PAGES, ANALYSIS = TABLE_PAGES + 1, VISUALS = TABLE_PAGES + 2, PAGETEXT = TABLE_PAGES + 3, ACTIVITY = TABLE_PAGES + 4;
  const totalPages = TABLE_PAGES + 5;
  const cur = Math.min(tab, totalPages - 1);
  const pageLabels = [...sections.map(s => s.label), '🎟 Tokens', '📊 Data analysis', '🎨 AI visuals', '📝 Page text', '🕘 Activity'];
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
      {/* Clean password-edit popup (admin). The new password is hashed on the
          server (scrypt) — the plain text is only used to compute the hash. */}
      {pwEdit && (
        <div onClick={() => setPwEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '100%', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><b>🔑 Set password — @{pwEdit.username}</b><button className="btn small ghost" onClick={() => setPwEdit(null)}>✕</button></div>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>Stored hashed (scrypt + salt) — the platform never keeps the plain password.</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type={pwShow ? 'text' : 'password'} value={pwVal} autoFocus placeholder="New password"
                onChange={e => setPwVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') savePassword(); }}
                style={{ flex: 1, padding: '6px 9px', borderRadius: 8, border: '2px solid var(--ink)' }} />
              <button className="btn small ghost" title={pwShow ? 'Hide' : 'Show'} onClick={() => setPwShow(s => !s)}>{pwShow ? '🙈' : '👁'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <button className="btn green" disabled={pwBusy || !pwVal} onClick={savePassword}>{pwBusy ? 'Saving…' : 'Save password'}</button>
              {pwMsg && <span style={{ fontSize: 12, opacity: 0.8 }}>{pwMsg}</span>}
            </div>
          </div>
        </div>
      )}
      {/* Title + subtitle container (reusable, DB-driven header). */}
      <PageHeader page="dashboard" />
      {dbOn === false && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#b23', margin: '8px 0', maxWidth: 720, marginInline: 'auto' }}>
          ⚠ Database not writable — the app is on temporary file storage, so edits (titles, page text, etc.) don’t stick and revert on reload.
          {dbErr ? <> Reason: <code>{dbErr}</code></> : null} Fix <code>DATABASE_URL</code> (and that the DB is reachable) to persist changes. See <code>/api/health</code>.
        </p>
      )}

      {/* Section picker: a SectionHeader title, then the section buttons grouped in
          the labelled dashed OutlineBox (same look as the gallery filters). */}
      <SectionHeader title={sectionsHdr.title} canEditTitle={sectionsHdr.canEditTitle} onRenameTitle={sectionsHdr.onRenameTitle} onRemixTitle={sectionsHdr.onRemixTitle} remixingTitle={sectionsHdr.remixingTitle} maxWidth={780} />
      <OutlineBox title="SECTIONS" maxWidth={900} style={{ margin: '8px auto 4px' }}>
        {pageLabels.map((lbl, i) => (
          <button key={i} className={`btn small ${i === cur ? 'blue' : 'ghost'}`} onClick={() => selectTab(i, lbl)}>{lbl}{i < TABLE_PAGES ? <span style={{ opacity: 0.6 }}> ({sections[i].count})</span> : null}</button>
        ))}
      </OutlineBox>
      {rule}

      {/* Tables area: a SectionHeader title above the current table/section. */}
      <SectionHeader title={tablesHdr.title} canEditTitle={tablesHdr.canEditTitle} onRenameTitle={tablesHdr.onRenameTitle} onRemixTitle={tablesHdr.onRemixTitle} remixingTitle={tablesHdr.remixingTitle} maxWidth={780} />

      {cur < TABLE_PAGES ? (() => {
        const sec = sections[cur];
        return (
          <div className={cur % 2 ? 'card alt' : 'card'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>{sec.label} <span style={{ opacity: 0.5, fontWeight: 400 }}>({sec.count})</span></h3>
              {sec.csv && sec.count > 0 && <button className="btn small" onClick={sec.csv}>⬇ CSV</button>}
            </div>
            {sec.key === 'registry' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <input type="text" value={regQuery}
                  onChange={e => { setRegQuery(e.target.value); if (regAiIds) setRegAiIds(null); }}
                  onKeyDown={e => { if (e.key === 'Enter' && regAi) runRegAi(); }}
                  placeholder={regAi ? 'Describe what you need — e.g. “tables I could reuse on other pages”' : '🔍 Search components…'}
                  style={{ flex: '1 1 260px', minWidth: 200, fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '2px solid var(--ink)' }} />
                {regAi && <button className="btn small blue" disabled={regAiBusy || !regQuery.trim()} onClick={runRegAi}>{regAiBusy ? '🤖 thinking…' : '🤖 Ask AI'}</button>}
                <button className={`btn small ${regAi ? 'green' : 'ghost'}`}
                  title="Toggle AI search: describe what you need in plain words and the AI keeps only the matching rows"
                  onClick={() => { setRegAi(a => !a); setRegAiIds(null); setRegAiErr(''); }}>
                  ✨ AI search {regAi ? 'ON' : 'off'}
                </button>
                {(regQuery || regAiIds) && <button className="btn small ghost" onClick={() => { setRegQuery(''); setRegAiIds(null); setRegAiErr(''); }}>✕ clear</button>}
                {/* Sort by usage count — cycles: off → most-used first → least-used first. */}
                <button className={`btn small ${regSort ? 'blue' : 'ghost'}`}
                  title="Sort by how many times each component is used on the website"
                  onClick={() => setRegSort(s => s === '' ? 'desc' : s === 'desc' ? 'asc' : '')}>
                  📊 Uses{regSort === 'desc' ? ' ↓ (most first)' : regSort === 'asc' ? ' ↑ (least first)' : ''}
                </button>
                {regAiErr && <span style={{ fontSize: 12, color: '#b23' }}>{regAiErr}</span>}
                {regAi && regAiIds && !regAiErr && <span style={{ fontSize: 12, opacity: 0.65 }}>🤖 showing {vRegShown.length} of {vReg.length}</span>}
              </div>
            )}
            <PagedTable key={sec.key} headers={sec.headers} rows={sec.displayRows || sec.rows} rowIds={sec.rowIds} onDelete={(id) => hideRow(sec.key, id)} empty={sec.empty} compact={sec.compact} />
            {sec.footer}
          </div>
        );
      })() : cur === TOKENS ? (
        <TokenWindow tokens={tokens} isAdmin onChanged={() => setReload(r => r + 1)} />
      ) : cur === ANALYSIS ? (
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

      {cur === ACTIVITY && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>🕘 Activity <span style={{ opacity: 0.5, fontWeight: 400 }}>({activity.length})</span></h3>
            {activity.length > 0 && <button className="btn small" onClick={() => exportRows('activity', ['When', 'User', 'Action', 'Target', 'Detail'], activity.map((e: any) => [fmtDate(e.createdAt), e.username || '', e.action || '', e.target || '', JSON.stringify(e.detail || {})]))}>⬇ CSV</button>}
          </div>
          <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>Navigation + every saved setting/preset change across the site (who, what, old→new), newest first — from the <code>activity_log</code> database table.</p>
          {(() => {
            const vAct = activity.filter((e: any) => notHidden('activity')(String(e.id)));
            return (
              <PagedTable
                headers={['When', 'User', 'Action', 'Target', 'Detail']}
                rows={vAct.map((e: any) => {
                  const d = e.detail || {};
                  const detail = d.from !== undefined || d.to !== undefined
                    ? `${d.from ?? '—'} → ${d.to ?? '—'}`
                    : Object.keys(d).length ? Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ') : '—';
                  return [fmtDate(e.createdAt), `@${e.username || 'anon'}`, e.action || '—', e.target || '—', detail];
                })}
                rowIds={vAct.map((e: any) => String(e.id))}
                onDelete={(id) => hideRow('activity', id)}
                empty="No activity yet — navigate the dashboard or change a setting and it lands here."
              />
            );
          })()}
        </div>
      )}

      {rule}
      {/* Page pager container. */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
        <button className="btn small ghost" disabled={cur <= 0} onClick={() => selectTab(cur - 1, pageLabels[cur - 1])}>‹ Prev</button>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Page {cur + 1} / {totalPages}</span>
        <button className="btn small ghost" disabled={cur >= totalPages - 1} onClick={() => selectTab(cur + 1, pageLabels[cur + 1])}>Next ›</button>
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

      {repoPreview && (
        <div onClick={() => setRepoPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 155, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 760, width: '100%', padding: '18px 20px', maxHeight: '86vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12 }}>
              <b>{repoPreview.title}</b>
              <button className="btn small ghost" onClick={() => setRepoPreview(null)}>✕</button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 10px' }}>{repoPreview.kind} from {repoPreview.cardTitle} · last edited {repoPreview.lastEdited}</p>
            {/^data:image\//i.test(repoPreview.url) || /^https?:\/\//i.test(repoPreview.url) ? (
              <img src={repoPreview.url} alt={repoPreview.cardTitle} style={{ maxWidth: '100%', maxHeight: '68vh', objectFit: 'contain', display: 'block', margin: '0 auto', borderRadius: 10, border: '2px solid var(--ink)' }} />
            ) : (
              <p style={{ wordBreak: 'break-word', margin: 0 }}>{repoPreview.url}</p>
            )}
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
