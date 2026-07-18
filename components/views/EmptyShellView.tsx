'use client';
/* A blank content pane for the shared app shell (side-rail + thin header + footer).
 * The Slides / Repos / Moderators / Dashboard pages route here for now — the real
 * content will later render in this same area, minus the chat composer. */
export function EmptyShellView({ emoji, name }: { emoji?: string; name?: string }) {
  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted,#8a7f70)', opacity: 0.5, userSelect: 'none' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 34, lineHeight: 1 }}>{emoji || '📄'}</div>
        <div style={{ marginTop: 8, fontSize: 15 }}>{name || 'Page'}</div>
      </div>
    </div>
  );
}
