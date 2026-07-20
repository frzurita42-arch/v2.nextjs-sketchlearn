'use client';
/* RepoChatComposer — the "create a repository from a description" composer shown on
 * the Repos gallery, drawn in SketchLearn's hand-made style (dashed-ink border,
 * paper fill, sketch font). The chat text box is display-only for now.
 *
 * Below the box sits a single toggleable "Lesson Path" pill (like the option tabs
 * under a chat input), indented a tab from the left. On = the repo is a learning
 * path (🔵 prompt cards generate lessons and the last card carries the slide
 * prompt); Off = a plain collection repo. It's local state only — nothing is
 * submitted or persisted yet. */
import { useState } from 'react';

const circleBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%', border: '2.5px solid var(--ink,#2d2a26)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, lineHeight: 1, cursor: 'pointer', flex: '0 0 auto', padding: 0, background: 'transparent',
};

export function RepoChatComposer() {
  // On = build a Learning Path repo; Off = a plain collection repo.
  const [lessonPath, setLessonPath] = useState(true);

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

        {/* Controls row: ＋ on the left (display only), send ↑ on the right. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" title="Add" aria-label="Add"
            style={{ ...circleBtn, width: 32, height: 32, color: 'var(--ink,#2d2a26)' }}>＋</button>
          <span style={{ fontSize: 12, opacity: 0.5 }}>Chat to generate a repository with its settings</span>
          <button type="button" title="Send" aria-label="Send"
            style={{ ...circleBtn, marginLeft: 'auto', background: 'var(--green,#7fb069)', color: '#fff', fontSize: 16 }}>↑</button>
        </div>
      </div>

      {/* Option row BELOW the chat, indented a tab from the left — a toggleable
          "Lesson Path" pill in the page's sketch tone (like the option tabs under a
          chat box). Sits between the composer and the DB-mode badge. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingLeft: 22 }}>
        <button type="button" aria-pressed={lessonPath} onClick={() => setLessonPath((v) => !v)}
          title={lessonPath ? 'Lesson Path is on — 🔵 prompt cards generate lessons and the last card carries the slide prompt' : 'Lesson Path is off — build a plain collection repo'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
            padding: '5px 13px', borderRadius: 999, cursor: 'pointer',
            border: '2px solid var(--ink,#2d2a26)',
            background: lessonPath ? 'var(--green,#7fb069)' : 'transparent',
            color: lessonPath ? '#fff' : 'var(--ink,#2d2a26)',
          }}>
          🎬 Lesson Path
        </button>
      </div>
    </div>
  );
}
