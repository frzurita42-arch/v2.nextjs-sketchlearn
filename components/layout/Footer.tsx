'use client';
/* Site-wide footer, ported from public/js/core/layout.js renderSiteFooter(). */
export function Footer({ compact }: { compact?: boolean }) {
  return (
    <footer id="site-footer" className={`site-footer${compact ? ' site-footer--compact' : ''}`}>
      <p>SketchLearn · Adaptive learning cards powered by your goals and progress.</p>
    </footer>
  );
}
