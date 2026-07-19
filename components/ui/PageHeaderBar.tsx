'use client';
/* The ONE shared page-heading component, in two instances:
 *   • ADMIN — the title + subtitle ENCAPSULATED in a dotted box (title, subtitle and
 *     a horizontal dotted line all inside it) with the header-size control card next
 *     to it, half-and-half.
 *   • MODERATOR / USER / GUEST — just the title + subtitle with a dotted line
 *     underneath separating this section from the filters below. No controls.
 * On the Settings page (global) the control manages every page ("Customise per
 * page…" + "Apply to all pages"); on an individual page it only touches that page
 * ("Apply to this page"). */
import { useState } from 'react';
import { useApp } from '@/components/AppContext';
import { PageHeading } from './PageHeading';
import { InstructionBanner } from './InstructionBanner';
import { PerPagePopup, subOf } from './PerPagePopup';
import { TITLE_MIN, TITLE_MAX, useHeaderSize, setPageTitleSize, setPageSubSize, applyHeaderAll } from '@/lib/header-size';

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0, display: 'block' };
const sectionRule: React.CSSProperties = { border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '14px 0 0' };
// On the Settings page the title column is ENCAPSULATED in a dotted box; the title,
// subtitle and the horizontal dotted line all live inside it.
const titleBox: React.CSSProperties = { border: '2px dashed var(--line,#d9cfc0)', borderRadius: 12, padding: '10px 16px', background: 'rgba(0,0,0,0.015)' };
const innerRule: React.CSSProperties = { border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '10px 0 0' };

export function PageHeaderBar({ pageKey, title, subtitle, global = false }: { pageKey?: string; title: React.ReactNode; subtitle?: React.ReactNode; global?: boolean }) {
  const app = useApp();
  const perms = app.eff();
  // Admins get the encapsulated box + the ⚙️ size tool; everyone else sees title + line.
  const showControls = perms.isAdmin;
  const { title: tSize } = useHeaderSize(pageKey);
  const [open, setOpen] = useState(false);   // ⚙️ header-size control visibility
  const [popup, setPopup] = useState(false);
  const [saved, setSaved] = useState(false);
  const setSize = (v: number) => { if (pageKey) { setPageTitleSize(pageKey, v); setPageSubSize(pageKey, subOf(v)); } };
  const applyAll = () => { applyHeaderAll(tSize, subOf(tSize)); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  const applyPage = () => { setSize(tSize); setSaved(true); setTimeout(() => setSaved(false), 1600); };
  const titleWrapStyle: React.CSSProperties = showControls
    ? (open
      ? { flex: '1 1 300px', minWidth: 240 }
      : { flex: '0 0 auto', width: 'fit-content', maxWidth: '100%', alignSelf: 'flex-start' })
    : { flex: '1 1 100%', minWidth: 240 };

  // The ⚙️ gear that toggles the header-size control — sits next to the title's
  // Aa / ✎ tools. Same little tool-button style as those.
  const gear = showControls ? (
    <button title="Header size" aria-pressed={open} onClick={() => setOpen((v) => !v)}
      style={{ background: open ? 'var(--card,#fff8ee)' : 'none', border: '1.5px solid var(--line,#d9cfc0)', borderRadius: 6, cursor: 'pointer', fontSize: 12, padding: '2px 7px', color: 'var(--muted,#8a7f70)', alignSelf: 'center', lineHeight: 1.2 }}>⚙️</button>
  ) : undefined;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* Admin: the title + subtitle ENCAPSULATED in a dotted box that also contains
            the horizontal dotted line. Non-admin: plain title + subtitle, with the
            separator at the very bottom (below the whole header row). */}
        <div style={{ ...titleWrapStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center', ...(showControls ? titleBox : { padding: '2px 2px 4px' }) }}>
          <PageHeading pageKey={pageKey} title={title} subtitle={subtitle} extraTools={gear} />
          {showControls && <hr style={innerRule} />}
        </div>
        {/* The header-size control card — only when the ⚙️ gear is toggled on. */}
        {showControls && open && (
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
      {/* Only the PLAIN (non-encapsulated) header needs a bottom separator. When the
          title is encapsulated (admin), the dotted box + its inner line already do it,
          so no extra rule below. */}
      {!showControls && <hr style={sectionRule} />}
      {/* The instruction banner, if one is set for this page (configured on Settings). */}
      {!global && <InstructionBanner pageKey={pageKey} />}
      {global && popup && <PerPagePopup onClose={() => setPopup(false)} />}
    </div>
  );
}
