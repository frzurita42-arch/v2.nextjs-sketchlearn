'use client';
/* App settings (new shell layout). First setting: a global CARD SIZE slider that
 * resizes the cards on EVERY gallery at once and morphs the layout — from
 * horizontal list rows, through a tightening/loosening grid, to a big single-column
 * "feed" view. Because every gallery renders the same shared card, one setting
 * changes them all. */
import { useCardSize, CARD_SIZE_LABELS } from '@/lib/card-size';

const HINTS = [
  'Compact horizontal rows — one per line.',
  'Small grid — many per row.',
  'Medium grid — the default.',
  'Large grid — fewer, bigger tiles.',
  'Feed — one big card per row (Instagram-style).',
];

export function AppSettingsView() {
  const [size, setSize] = useCardSize();
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', minHeight: '100%', boxSizing: 'border-box', padding: '18px 20px 40px', borderLeft: '2px dashed var(--line,#d9cfc0)', borderRight: '2px dashed var(--line,#d9cfc0)' }}>
        <h2 className="scribble-underline" style={{ display: 'inline-block', margin: '0 0 4px' }}>⚙️ Settings</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--muted,#8a7f70)', fontSize: 14 }}>Tweak how SketchLearn looks.</p>

        <div className="card" style={{ padding: '16px 18px', maxWidth: 520 }}>
          <b style={{ display: 'block', marginBottom: 4 }}>Card size</b>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted,#8a7f70)' }}>Changes the card size on every gallery (Slides, Repos, Presentation runs…) at once.</p>
          <input type="range" min={0} max={4} step={1} value={size} onChange={(e) => setSize(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: 'var(--green,#7fb069)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted,#8a7f70)', marginTop: 4 }}>
            {CARD_SIZE_LABELS.map((l, i) => (
              <span key={l} style={{ fontWeight: i === size ? 800 : 400, color: i === size ? 'var(--ink)' : undefined }}>{l}</span>
            ))}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 13 }}><b>{CARD_SIZE_LABELS[size]}</b> — {HINTS[size]}</p>
        </div>
      </div>
    </div>
  );
}
