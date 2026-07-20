'use client';
/* RepoChatComposer — a DISPLAY-ONLY chat box (not wired to anything yet) shown on
 * the Repos gallery. It mirrors the familiar "prompt + ＋ + send" composer layout
 * (like the Kimi/ChatGPT input) but drawn in SketchLearn's hand-made style: a
 * dashed-ink border, paper fill, and the sketch font. It is intended to become the
 * "chat to create a repository (with its settings) from a description" interface —
 * for now it only renders the interface. Nothing here submits or stores anything. */

const circleBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%', border: '2.5px solid var(--ink,#2d2a26)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, lineHeight: 1, cursor: 'pointer', flex: '0 0 auto', padding: 0,
};

export function RepoChatComposer() {
  return (
    <div style={{ margin: '2px 0 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 6px' }}>
        ✨ Create a repo
      </div>
      <div style={{
        border: '2.5px dashed var(--ink,#2d2a26)', borderRadius: 'var(--wobble-2, 16px)',
        background: 'var(--paper,#fbf7ee)', padding: '12px 14px 10px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* The prompt line — a read-only stand-in for the future chat input. */}
        <div style={{ minHeight: 40, fontSize: 15, opacity: 0.55, lineHeight: 1.35 }}>
          Describe the repository you want to build — its sections, cards, links and access settings…
        </div>
        {/* A very faint dotted rule so the write area and the controls read as two
            distinct zones. */}
        <div style={{ borderTop: '1px dotted var(--ink,#2d2a26)', opacity: 0.18 }} />
        {/* Controls row: ＋ on the left, a hint, and the send arrow on the right. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" title="Add a setting or attachment" aria-label="Add"
            style={{ ...circleBtn, width: 32, height: 32, background: 'transparent', color: 'var(--ink,#2d2a26)' }}>＋</button>
          <span style={{ fontSize: 12, opacity: 0.5 }}>Chat to generate a repository with its settings</span>
          <button type="button" title="Send" aria-label="Send"
            style={{ ...circleBtn, marginLeft: 'auto', background: 'var(--green,#7fb069)', color: '#fff', fontSize: 16 }}>↑</button>
        </div>
      </div>
    </div>
  );
}
