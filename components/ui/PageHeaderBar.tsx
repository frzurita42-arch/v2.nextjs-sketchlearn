'use client';
/* A page's heading is a CONTAINER: the title + subtitle, closed off by a dotted
 * line at the bottom that separates this section from the filters below.
 *
 * The header-size "apply" controls are an EDITOR tool — only admins/moderators see
 * them (to the right, half-and-half). A regular user or guest sees just the title
 * and subtitle plus the dotted separator. On the Settings page (global) the editor
 * controls manage every page ("Customise per page…" + "Apply to all pages"); on an
 * individual page they only touch that page ("Apply to this page"). */
import { useState } from 'react';
import { useApp } from '@/components/AppContext';
import { PageHeading } from './PageHeading';
import { PerPagePopup, subOf } from './PerPagePopup';
import { TITLE_MIN, TITLE_MAX, useHeaderSize, setPageTitleSize, setPageSubSize, applyHeaderAll } from '@/lib/header-size';

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0, display: 'block' };
const sectionRule: React.CSSProperties = { border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '14px 0 0' };

export function PageHeaderBar({ pageKey, title, subtitle, global = false }: { pageKey?: string; title: React.ReactNode; subtitle?: React.ReactNode; global?: boolean }) {
  const app = useApp();
  const perms = app.eff();
  const showControls = perms.isAdmin || perms.isModerator;
  const { title: tSize } = useHeaderSize(pageKey);
  const [popup, setPopup] = useState(false);
  const [saved, setSaved] = useState(false);
  const setSize = (v: number) => { if (pageKey) { setPageTitleSize(pageKey, v); setPageSubSize(pageKey, subOf(v)); } };
  const applyAll = () => { applyHeaderAll(tSize, subOf(tSize)); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  const applyPage = () => { setSize(tSize); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* The title + subtitle — this container's contents. */}
        <div style={{ flex: showControls ? '1 1 300px' : '1 1 100%', minWidth: 240, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '2px 2px 4px' }}>
          <PageHeading pageKey={pageKey} title={title} subtitle={subtitle} />
        </div>
        {/* The header-size control card — editors only (admins & moderators). */}
        {showControls && (
          <div className="card" style={{ flex: '1 1 300px', minWidth: 240, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={lbl}>Header size — {tSize}px</span>
            <input type="range" min={TITLE_MIN} max={TITLE_MAX} value={tSize} onChange={(e) => setSize(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: 'var(--green,#7fb069)' }} />
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted,#8a7f70)' }}>
              {global
                ? 'Sizes this page live — the subtitle scales with the title. Apply it everywhere, or tweak specific pages.'
                : 'Sizes this page — the subtitle scales with the title.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
              {global ? (
                <>
                  <button className="btn small ghost" onClick={() => setPopup(true)}>Customise per page…</button>
                  <button className="btn small green" onClick={applyAll}>{saved ? '✓ Applied' : 'Apply to all pages'}</button>
                </>
              ) : (
                <button className="btn small green" onClick={applyPage}>{saved ? '✓ Applied' : 'Apply to this page'}</button>
              )}
            </div>
          </div>
        )}
      </div>
      {/* The dotted line at the bottom — separates this section from the filters below. */}
      <hr style={sectionRule} />
      {global && popup && <PerPagePopup onClose={() => setPopup(false)} />}
    </div>
  );
}
