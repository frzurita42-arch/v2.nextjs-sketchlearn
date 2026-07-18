'use client';
/* Sandbox — a workbench for building reusable display components before they go
 * live. First up: the SLIDES view. It shows a titled, paginated gallery of every
 * slide tool (presentation) on the site, a divider, then a data table of the same
 * slides. Both read from the same /api/tools list. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { appState } from '@/lib/app-state';
import { useApp } from '@/components/AppContext';

const GALLERY_PER_PAGE = 6;

function fmtDate(v: any): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}
function slideCount(t: any): number {
  return Number(t?.definition?.lesson?.totalSlides || t?.definition?.lesson?.pages?.length || 0) || 0;
}
function Thumb({ t, size = 44 }: { t: any; size?: number }) {
  const src = t?.thumbnail;
  if (typeof src === 'string' && src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--ink)', flex: '0 0 auto' }} />;
  }
  return <span style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, borderRadius: 8, border: '1.5px solid var(--ink)', background: 'var(--card,#fff8ee)', flex: '0 0 auto' }}>🎞️</span>;
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
      // Slides = presentation decks (archetype 'lesson').
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

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '18px 22px 40px' }}>
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
          {/* ── Gallery cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {shown.map((t) => (
              <div key={t.slug} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <Thumb t={t} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title || 'Untitled'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted,#8a7f70)' }}>by {t.owner || '—'} · {slideCount(t) || '?'} slides</div>
                  </div>
                </div>
                {t.description && <div style={{ fontSize: 12.5, color: 'var(--ink)', opacity: 0.85, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</div>}
                <button className="btn small green" style={{ alignSelf: 'flex-start' }} onClick={() => openTool(t)}>▶ Open</button>
              </div>
            ))}
          </div>

          {/* ── Pagination ── */}
          {pageCount > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 }}>
              <button className="btn small ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
              <span style={{ fontSize: 13 }}>Page {page} of {pageCount}</span>
              <button className="btn small ghost" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next →</button>
            </div>
          )}

          {/* ── Division line ── */}
          <hr style={{ border: 'none', borderTop: '2px dashed var(--line,#d9cfc0)', margin: '26px 0 18px' }} />

          {/* ── Data table: all slides ── */}
          <h3 style={{ margin: '0 0 10px' }}>All slides — table</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="sketch" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>#</th>
                  <th style={{ textAlign: 'left' }}>Title</th>
                  <th style={{ textAlign: 'left' }}>Owner</th>
                  <th style={{ textAlign: 'right' }}>Slides</th>
                  <th style={{ textAlign: 'left' }}>Visibility</th>
                  <th style={{ textAlign: 'center' }}>AI</th>
                  <th style={{ textAlign: 'right' }}>Likes</th>
                  <th style={{ textAlign: 'left' }}>Created</th>
                  <th style={{ textAlign: 'left' }}>Slug</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t, i) => (
                  <tr key={t.slug}>
                    <td>{i + 1}</td>
                    <td>{t.title || 'Untitled'}</td>
                    <td>{t.owner || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{slideCount(t) || '—'}</td>
                    <td>{t.visibility || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{t.aiGenerated ? '✦' : ''}</td>
                    <td style={{ textAlign: 'right' }}>{Number(t.likeCount || 0)}</td>
                    <td>{fmtDate(t.createdAt)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{t.slug}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
