/* Full-screen boot loader — the writing-pencil animation (the same ✏️ used in the
 * skeleton cards) over a "Loading…" caption. Shown while the app hydrates on first
 * load (notably a cold serverless start after a fresh deploy), so the first paint
 * is this instead of a blank page. Server-rendered, so it appears before the JS
 * finishes loading. */
export function BootLoader({ text = 'Loading…' }: { text?: string }) {
  return (
    <main id="app">
      <div style={{ minHeight: '72vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span className="sl-pencil" style={{ fontSize: 52, color: 'var(--ink)' }} aria-hidden>
          <span className="sl-pencil__line" />
          <span className="sl-pencil__tip">✏️</span>
        </span>
        <p style={{ fontFamily: 'var(--font-title)', fontSize: 24, opacity: 0.7, margin: 0 }}>{text}</p>
      </div>
    </main>
  );
}
