'use client';
/* My Stats view: the learner's history table + CSV export + password change.
 * Ported from public/js/views/stats.js. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { downloadCsv } from '@/lib/util';
import { Loading } from '@/components/ui/Loading';

function normalizeList(value: any, fallback: string[] = []): string[] {
  if (Array.isArray(value)) return value.map((v: any) => String(v || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.split(/\s*[·,|]\s*/).map((v: string) => v.trim()).filter(Boolean);
}

// Muted "NA" for any data point a lesson didn't provide (keeps every row uniform).
const NA = <span style={{ opacity: 0.45 }}>NA</span>;

function ListCell({ items, emptyText = '' }: { items: any; emptyText?: string | string[] }) {
  const list = normalizeList(items, Array.isArray(emptyText) ? emptyText : (emptyText ? [emptyText] : []));
  if (!list.length) return NA;
  return <ul className="sheet-list">{list.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

export function StatsView() {
  const [games, setGames] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(0);   // 0 = most recent 5

  useEffect(() => {
    let cancelled = false;
    API.get('/api/games')
      .then((g: any) => { if (!cancelled) setGames(g); })
      .catch((e: any) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [reload]);

  if (error) return <div className="card">{error}</div>;
  if (games === null) return <Loading text="Fetching your sketchbook…" />;

  const mine = games.filter((g: any) => g.username === API.user?.username);
  const totalCorrect = mine.reduce((s: number, g: any) => s + (g.correct || 0), 0);
  const totalQ = mine.reduce((s: number, g: any) => s + (g.total || 0), 0);
  const totalTime = mine.reduce((s: number, g: any) => s + (g.durationSec || 0), 0);
  const isAdmin = API.user?.role === 'admin';
  const emptyColspan = isAdmin ? 13 : 12;

  // History newest-first, paginated 5 per page (page 0 = the latest 5).
  const PAGE_SIZE = 5;
  const ordered = mine.slice().reverse();
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const pageGames = ordered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const changePass = async () => {
    const p = prompt('New password:');
    if (!p) return;
    try { await API.post(`/api/users/${encodeURIComponent(API.user!.username)}/password`, { password: p }); alert('Password changed!'); }
    catch (e: any) { alert(e.message); }
  };

  const deleteGame = async (gameId: string) => {
    if (!gameId || !confirm('Delete this lesson record?')) return;
    try { await API.del(`/api/games/${encodeURIComponent(gameId)}`); setReload(n => n + 1); }
    catch (err: any) { alert(err.message); }
  };

  return (
    <>
      <h1 className="view-title">My <span className="scribble-underline">stats</span></h1>
      <div className="stat-row">
        <div className="stat-tile"><div className="big">{mine.length}</div>activities</div>
        <div className="stat-tile"><div className="big">{totalQ ? Math.round(100 * totalCorrect / totalQ) : 0}%</div>avg score</div>
        <div className="stat-tile"><div className="big">{Math.round(totalTime / 60)}m</div>time learning</div>
      </div>
      <div className="stats-layout">
        <div className="stats-main card">
          <div className="table-wrap"><table className="sketch">
            <tbody>
              <tr>
                <th>Date</th><th>Time</th><th>Topic</th><th>Concept</th><th>Level</th><th>Score</th>
                <th>Question summary</th><th>Answer summary</th><th>AI notes</th><th>Competency</th><th>Language level</th><th>Share</th>{isAdmin && <th>Admin</th>}
              </tr>
              {mine.length ? pageGames.map((g: any, idx: number) => {
                const shareHref = g.shareUrl || (g.shareId || g.id ? `/report/${encodeURIComponent(g.shareId || g.id)}` : '');
                return (
                  <tr className="stats-row" data-game-id={g.id || ''} key={g.id || idx}>
                    <td>{g.finishedDate || new Date(g.finishedAt).toLocaleDateString()}</td>
                    <td>{g.finishedTime || new Date(g.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{g.topic || NA}</td><td>{g.concept || NA}</td>
                    <td>{g.level || NA}</td><td>{Number.isFinite(g.total) && g.total ? `${g.correct}/${g.total}` : NA}</td>
                    <td className="summary-cell"><ListCell items={g.questionSummary} emptyText={(g.slides || []).map((s: any) => s.question).filter(Boolean).join(' · ')} /></td>
                    <td className="summary-cell"><ListCell items={g.answerSummary} emptyText={(g.slides || []).map((s: any) => s.chosen).filter(Boolean).join(' · ')} /></td>
                    <td className="summary-cell"><ListCell items={g.aiNotes} emptyText={g.recommendations?.summary ? [g.recommendations.summary] : ''} /></td>
                    <td className="summary-cell">
                      {Array.isArray(g.recommendations?.areaCompetency) && g.recommendations.areaCompetency.length
                        ? <ul className="sheet-list">{g.recommendations.areaCompetency.map((c: any, i: number) => <li key={i}>{c.area}: <b>{c.score}</b>/100</li>)}</ul>
                        : NA}
                    </td>
                    <td className="summary-cell">
                      {g.recommendations?.languageProficiency
                        ? <span><b>{g.recommendations.languageProficiency.level}</b> · ~{g.recommendations.languageProficiency.estimatedWords} words{g.recommendations.languageProficiency.suggestedLevel !== g.recommendations.languageProficiency.level ? <> → {g.recommendations.languageProficiency.suggestedLevel}</> : ''}</span>
                        : NA}
                    </td>
                    <td>{shareHref ? <a href={shareHref} target="_blank" rel="noreferrer">open</a> : ''}</td>
                    {isAdmin && <td>{g.id ? <button className="btn small ghost delete-game" data-game-id={g.id} onClick={() => deleteGame(g.id)}>Delete</button> : ''}</td>}
                  </tr>
                );
              }) : <tr><td colSpan={emptyColspan}>Nothing yet — go learn something!</td></tr>}
            </tbody>
          </table></div>
          {pageCount > 1 && (
            <div className="slide-actions" style={{ justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <button className="btn small ghost" id="stats-prev" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Newer</button>
              <span style={{ opacity: 0.8, fontSize: '.95rem' }}>
                Page {safePage + 1} of {pageCount} · showing {pageGames.length} of {ordered.length}
              </span>
              <button className="btn small ghost" id="stats-next" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Older →</button>
            </div>
          )}
          <div className="slide-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn small" id="export-csv" onClick={downloadCsv}>⬇ Download progress spreadsheet (CSV)</button>
            <button className="btn small ghost" id="change-pass" onClick={changePass}>Change my password</button>
          </div>
        </div>
      </div>
    </>
  );
}
