'use client';
/* Sandbox — a workbench for rebuilding the site's displays with the new shell
 * layout, RECYCLING the existing components. First up: the SLIDES view. It shows a
 * titled, paginated gallery built from the shared <ToolCard> (identical to the
 * Slides/Repos pages), a divider, then the shared <PagedTable> (identical to the
 * Dashboard's tables) listing the same slides. Both read /api/tools. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';
import { ToolCard } from '@/components/tools/ToolCard';
import { PagedTable, type Cell } from '@/components/ui/PagedTable';

const GALLERY_PER_PAGE = 6;

function fmtDate(v: any): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}
function slideCount(t: any): number {
  return Number(t?.definition?.lesson?.totalSlides || t?.definition?.lesson?.pages?.length || 0) || 0;
}

export function SandboxView() {
  const app = useApp();
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    API.get('/api/tools').then((r: any) => {
      if (!alive) return;
      const all = Array.isArray(r?.tools) ? r.tools : [];
      setTools(all.filter((t: any) => (t?.archetype || t?.definition?.archetype) === 'lesson'));
    }).catch(() => { /* keep empty */ }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const pageCount = Math.max(1, Math.ceil(tools.length / GALLERY_PER_PAGE));
  const shown = useMemo(() => tools.slice((page - 1) * GALLERY_PER_PAGE, page * GALLERY_PER_PAGE), [tools, page]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const openTool = async (t: any) => {
    try { const r: any = await API.get(`/api/tools?slug=${encodeURIComponent(t.slug)}`); appState.activeTool = r?.tool || t; }
    catch { appState.activeTool = t; }
    app.nav('tool');
  };

  // Table rows (same shared PagedTable the Dashboard uses).
  const rows: Cell[][] = tools.map((t) => [
    t.title || 'Untitled',
    t.owner || '—',
    slideCount(t) || '—',
    t.visibility || '—',
    t.aiGenerated ? '✦' : '',
    Number(t.likeCount || 0),
    fmtDate(t.createdAt),
    t.slug,
  ]);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {/* Same working column as the chat interface (max-width 880), CENTRED in the
          area to the right of the rail (re-centres when the rail collapses), bounded
          by two dashed vertical rules that separate the workstation from the space. */}
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
      {/* ── Gallery title ── */}
      <h2 className="scribble-underline" style={{ display: 'inline-block', margin: '0 0 4px' }}>🎞️ Slides gallery</h2>
      <p style={{ margin: '0 0 14px', color: 'var(--muted,#8a7f70)', fontSize: 14 }}>
        Every slide tool on the site{tools.length ? ` — ${tools.length} total` : ''}.
      </p>

      {loading ? (
        <p style={{ color: 'var(--muted,#8a7f70)' }}>Loading slides…</p>
      ) : tools.length === 0 ? (
        <p style={{ color: 'var(--muted,#8a7f70)' }}>No slide tools yet.</p>
      ) : (
        <>
          {/* ── Gallery cards (shared ToolCard) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, alignItems: 'start' }}>
            {shown.map((t) => (
              <ToolCard key={t.slug} tool={t} view="grid" onOpen={openTool} />
            ))}
          </div>

          {/* ── Gallery pagination ── */}
          {pageCount > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
              <button className="btn small ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
              <span style={{ fontSize: 13 }}>Page {page} of {pageCount}</span>
              <button className="btn small ghost" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next ›</button>
            </div>
          )}

          {/* ── Division line ── */}
          <hr style={{ border: 'none', borderTop: '2px dashed var(--line,#d9cfc0)', margin: '26px 0 18px' }} />

          {/* ── Data table: all slides (shared PagedTable) ── */}
          <h3 style={{ margin: '0 0 10px' }}>All slides — table</h3>
          <PagedTable
            headers={['Title', 'Owner', 'Slides', 'Visibility', 'AI', 'Likes', 'Created', 'Slug']}
            rows={rows}
            empty="No slide tools yet."
          />
        </>
      )}
      </div>
    </div>
  );
}
