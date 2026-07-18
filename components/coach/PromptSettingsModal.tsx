'use client';
/* ChatBot behaviour settings — a minimalist, paginated popup. Each window tweaks a
 * group of the directives that shape how the bot replies (length, tone, objective,
 * sticky-note "publicity", toolbar). Changes save live. */
import { useState } from 'react';
import {
  usePromptSettings, TONES, STICKY_TYPES, BREVITY_LABELS, FREQ_LABELS, ICON_LABELS,
  type PromptSettings,
} from '@/lib/prompt-settings';

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 4px', display: 'block' };
const sel: React.CSSProperties = { width: '100%', padding: '7px 9px', fontSize: 13, borderRadius: 8, border: '1.5px solid var(--ink)', background: 'var(--card,#fff8ee)', font: 'inherit' };

function ticks(labels: string[], v: number) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted,#8a7f70)', marginTop: 3 }}>{labels.map((l, i) => <span key={l} style={{ fontWeight: i === v ? 800 : 400, color: i === v ? 'var(--ink)' : undefined }}>{l}</span>)}</div>;
}

export function PromptSettingsModal({ onClose }: { onClose: () => void }) {
  const [s, update] = usePromptSettings();
  const [page, setPage] = useState(0);
  const pages = ['Length & tone', 'Objective & sticky-notes', 'Toolbar'];
  const total = pages.length;

  const toggleType = (k: string) => {
    const has = s.stickyTypes.includes(k);
    update({ stickyTypes: has ? s.stickyTypes.filter((x) => x !== k) : [...s.stickyTypes, k] });
  };

  const range = (key: keyof PromptSettings, labels: string[]) => (
    <>
      <input type="range" min={0} max={labels.length - 1} step={1} value={Number(s[key])} onChange={(e) => update({ [key]: parseInt(e.target.value, 10) } as any)} style={{ width: '100%', accentColor: 'var(--green,#7fb069)' }} />
      {ticks(labels, Number(s[key]))}
    </>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: '100%', padding: '16px 18px', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <b>🤖 ChatBot settings</b>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted,#8a7f70)', marginBottom: 14 }}>{pages[page]}</div>

        {page === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><span style={lbl}>Tone</span>
              <select value={s.tone} onChange={(e) => update({ tone: e.target.value })} style={sel}>
                {TONES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div><span style={lbl}>Reply length — {BREVITY_LABELS[s.brevity]}</span>{range('brevity', BREVITY_LABELS)}</div>
            <div><span style={lbl}>Max length (words)</span>
              <input type="number" min={15} max={400} value={s.maxWords} onChange={(e) => update({ maxWords: Math.max(15, Math.min(400, parseInt(e.target.value, 10) || 80)) })} style={sel} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={s.emoji} onChange={(e) => update({ emoji: e.target.checked })} /> Allow a few emojis in replies
            </label>
          </div>
        )}

        {page === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><span style={lbl}>Sticky-note publicity — {FREQ_LABELS[s.stickyFreq]}</span>{range('stickyFreq', FREQ_LABELS)}
              <p style={{ fontSize: 11.5, color: 'var(--muted,#8a7f70)', margin: '4px 0 0' }}>How often the bot nudges you toward other sections with a page sticky-note.</p>
            </div>
            <div><span style={lbl}>Sticky-note types offered</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
                {STICKY_TYPES.map((t) => (
                  <label key={t.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, opacity: s.stickyFreq === 0 ? 0.5 : 1 }}>
                    <input type="checkbox" disabled={s.stickyFreq === 0} checked={s.stickyTypes.includes(t.key)} onChange={() => toggleType(t.key)} /> {t.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><span style={lbl}>Toolbar icon size — {ICON_LABELS[s.toolbarIcon]}</span>{range('toolbarIcon', ICON_LABELS)}
              <p style={{ fontSize: 11.5, color: 'var(--muted,#8a7f70)', margin: '4px 0 0' }}>Resizes the emoji buttons under the chat.</p>
            </div>
          </div>
        )}

        {/* Pager — dots + prev/next, uniform across windows. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
          <button className="btn small ghost" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹ Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {pages.map((_, i) => <span key={i} onClick={() => setPage(i)} style={{ width: 8, height: 8, borderRadius: '50%', cursor: 'pointer', background: i === page ? 'var(--ink)' : 'var(--line,#d9cfc0)' }} />)}
          </div>
          <button className="btn small ghost" disabled={page >= total - 1} onClick={() => setPage((p) => Math.min(total - 1, p + 1))}>Next ›</button>
        </div>
      </div>
    </div>
  );
}
