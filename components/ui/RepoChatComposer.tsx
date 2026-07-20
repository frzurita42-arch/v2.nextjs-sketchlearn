'use client';
/* RepoChatComposer — the "create a repository from a description" composer shown on
 * the Repos gallery, drawn in SketchLearn's hand-made style (dashed-ink border,
 * paper fill, sketch font). The chat text box itself is still display-only, but the
 * SETTINGS around it are interactive local state so the interface can be tried out:
 *
 *   • ＋  opens a scrollable menu to pick a CATEGORY (Learning Path / Normal Repo).
 *         The pick shows as an attachment chip at the top of the composer.
 *   • ⚙️  opens a small settings popup — currently a single switch: whether the
 *         LAST nested card should carry the slide-generation prompt (so the repo's
 *         created slide tool can regenerate the lesson).
 *   • ↑  send (not wired up yet).
 *
 * These settings are held in component state only; nothing is submitted or stored
 * yet. They exist so the repo-creation prompt can be systematised later. */
import { useState } from 'react';

type Category = { id: string; icon: string; label: string; desc: string };

// Only two categories for now, per the design. The list is intentionally rendered
// in a scrollable panel so it reads like a plugin/skill picker and scales later.
const CATEGORIES: Category[] = [
  { id: 'learning-path', icon: '🎬', label: 'Learning Path', desc: '🔵 prompt cards become lessons; the last card carries the slide-generation prompt.' },
  { id: 'normal', icon: '🗂️', label: 'Normal Repo', desc: 'A plain collection of cards, links and sections — no lesson generation.' },
];

const circleBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%', border: '2.5px solid var(--ink,#2d2a26)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, lineHeight: 1, cursor: 'pointer', flex: '0 0 auto', padding: 0, background: 'transparent',
};
const popover: React.CSSProperties = {
  position: 'absolute', zIndex: 30, background: 'var(--paper,#fbf7ee)',
  border: '2.5px solid var(--ink,#2d2a26)', borderRadius: 'var(--wobble-2, 14px)',
  boxShadow: '3px 4px 0 rgba(45,42,38,0.18)', padding: 8, width: 300, maxWidth: 'calc(100vw - 48px)',
};
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 20 };

export function RepoChatComposer() {
  const [category, setCategory] = useState<Category | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Setting: include the slide-generation prompt on the repo's last nested card.
  const [includePrompt, setIncludePrompt] = useState(true);

  return (
    <div style={{ margin: '2px 0 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 6px' }}>
        ✨ Create a repo
      </div>
      <div style={{
        position: 'relative',
        border: '2.5px dashed var(--ink,#2d2a26)', borderRadius: 'var(--wobble-2, 16px)',
        background: 'var(--paper,#fbf7ee)', padding: '12px 14px 10px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Attachment chips at the TOP (like a plugin chip). Shows the chosen category. */}
        {category && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
              border: '2px solid var(--ink,#2d2a26)', borderRadius: 999, padding: '3px 6px 3px 10px', background: 'rgba(127,176,105,0.14)' }}>
              <span aria-hidden>{category.icon}</span>{category.label}
              <button type="button" title="Remove" onClick={() => setCategory(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.7 }}>✕</button>
            </span>
          </div>
        )}

        {/* The prompt line — a read-only stand-in for the future chat input. */}
        <div style={{ minHeight: 40, fontSize: 15, opacity: 0.55, lineHeight: 1.35 }}>
          Describe the repository you want to build — its sections, cards, links and access settings…
        </div>

        {/* A very faint dotted rule so the write area and the controls read as two
            distinct zones. */}
        <div style={{ borderTop: '1px dotted var(--ink,#2d2a26)', opacity: 0.18 }} />

        {/* Controls row: ＋ (category) on the left, ⚙️ (settings) + send ↑ on the right. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" title="Choose a category" aria-label="Choose a category"
            onClick={() => { setMenuOpen((o) => !o); setSettingsOpen(false); }}
            style={{ ...circleBtn, width: 32, height: 32, color: 'var(--ink,#2d2a26)' }}>＋</button>
          <span style={{ fontSize: 12, opacity: 0.5 }}>Chat to generate a repository with its settings</span>
          <button type="button" title="Repo settings" aria-label="Repo settings"
            onClick={() => { setSettingsOpen((o) => !o); setMenuOpen(false); }}
            style={{ ...circleBtn, marginLeft: 'auto', color: 'var(--ink,#2d2a26)', fontSize: 16 }}>⚙️</button>
          <button type="button" title="Send" aria-label="Send"
            style={{ ...circleBtn, background: 'var(--green,#7fb069)', color: '#fff', fontSize: 16 }}>↑</button>
        </div>

        {/* ＋ category picker — a small scrollable menu; a pick becomes the chip above. */}
        {menuOpen && (
          <>
            <div style={backdrop} onClick={() => setMenuOpen(false)} />
            <div style={{ ...popover, left: 8, bottom: 52 }}>
              <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.3, padding: '2px 6px 6px' }}>Category</div>
              <div style={{ maxHeight: 176, overflowY: 'auto', display: 'grid', gap: 4 }}>
                {CATEGORIES.map((c) => {
                  const active = category?.id === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => { setCategory(c); setMenuOpen(false); }}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 10,
                        border: `1.5px solid ${active ? 'var(--green,#7fb069)' : 'transparent'}`, background: active ? 'rgba(127,176,105,0.12)' : 'transparent', cursor: 'pointer' }}>
                      <span style={{ fontSize: 18, flex: '0 0 auto' }}>{c.icon}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{c.label}</span>
                        <span style={{ display: 'block', fontSize: 11, opacity: 0.6 }}>{c.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ⚙️ settings popup — the repo-generation switches. */}
        {settingsOpen && (
          <>
            <div style={backdrop} onClick={() => setSettingsOpen(false)} />
            <div style={{ ...popover, right: 8, bottom: 52 }}>
              <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.3, padding: '2px 6px 6px' }}>⚙️ Repo settings</div>
              <button type="button" onClick={() => setIncludePrompt((v) => !v)}
                title="When on, the final nested card holds the slide-generation prompt so the repo's slide tool can regenerate the lesson."
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--ink,#2d2a26)', background: 'rgba(0,0,0,0.02)', cursor: 'pointer' }}>
                <span style={{ fontSize: 18, flex: '0 0 auto' }}>🔵</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>Prompt on last card</span>
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.55 }}>Give the final card the slide-generation prompt so its slide tool can rebuild the lesson.</span>
                </span>
                <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, border: '1.5px solid var(--ink,#2d2a26)', background: includePrompt ? 'var(--green,#7fb069)' : 'transparent', color: includePrompt ? '#fff' : 'inherit' }}>{includePrompt ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
