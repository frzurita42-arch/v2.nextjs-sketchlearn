'use client';
/* Site-wide footer, ported from public/js/core/layout.js renderSiteFooter(). */
export function Footer({ compact }: { compact?: boolean }) {
  return (
    <footer id="site-footer" className={`site-footer${compact ? ' site-footer--compact' : ''}`}
      style={compact ? { margin: 0, padding: '3px 0', fontSize: '.64rem', maxWidth: 'none' } : undefined}>
      <p>SketchLearn · Adaptive learning cards powered by your goals and progress.</p>
    </footer>
  );
}
