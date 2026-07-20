'use client';
/* The standard paginated data table — extracted from the Dashboard so every page
 * (Dashboard, Sandbox, …) shares one table container. It shows ROWS_PER_PAGE rows
 * at a time (Prev/Next) and clips any text cell over CELL_LIMIT chars, revealing
 * the full value in a popup via 👁. A cell can be a raw value or {node} for custom
 * content; pass rowIds + onDelete to get a 🗑 delete column. */
import { useState } from 'react';

export const ROWS_PER_PAGE = 4;
const CELL_LIMIT = 100;
export type Cell = string | number | null | undefined | { node: React.ReactNode };

export function PagedTable({ headers, rows, empty, rowIds, onDelete, compact, rowsPerPage }: { headers: string[]; rows: Cell[][]; empty: string; rowIds?: string[]; onDelete?: (id: string) => void; compact?: boolean; rowsPerPage?: number }) {
  const [page, setPage] = useState(0);
  const [view, setView] = useState<{ title: string; text: string } | null>(null);
  const pageSize = Math.max(1, Math.floor(rowsPerPage || ROWS_PER_PAGE));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(page, pages - 1);
  const slice = rows.slice(p * pageSize, p * pageSize + pageSize);
  const canDelete = !!(onDelete && rowIds);
  const totalCols = headers.length + (canDelete ? 1 : 0);
  return (
    <>
      <div className="table-wrap"><table className={compact ? 'sketch compact' : 'sketch'}><tbody>
        <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}{canDelete && <th aria-label="delete" style={{ width: 28 }}></th>}</tr>
        {slice.length ? slice.map((r, ri) => {
          const abs = p * pageSize + ri;
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
            {canDelete && <td><button type="button" title="Delete this row (hides it from the dashboard)" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }} onClick={() => { if (id && confirm('Delete this row?')) onDelete!(id); }}>🗑</button></td>}
          </tr>
          );
        }) : <tr><td colSpan={totalCols}>{empty}</td></tr>}
      </tbody></table></div>
      {pages > 1 && (
        <>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
            <button className="btn small ghost" disabled={p <= 0} onClick={() => setPage(p - 1)}>‹ Prev</button>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Rows {p * pageSize + 1}–{Math.min(rows.length, (p + 1) * pageSize)} of {rows.length}</span>
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
