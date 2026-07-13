'use client';
/* The hand-drawn "coffee mug" donations component (notebook sketch style, no
 * external asset). `DonationMug` is just the SVG; `DonationsCard` is the full
 * card — the mug over a "Donations" label, linking to a support page — used both
 * in the Language-Learning setup and beside the AI example on a tool page. */

// Hand-drawn sketch-style mug that matches the notebook theme.
export function DonationMug({ width = 96, height = 80 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 120 100" role="img" aria-label="coffee mug">
      <g fill="none" stroke="#2d2a26" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 30 Q22 78 34 84 L74 84 Q86 78 84 30 Z" fill="#f9a03f" />
        <path d="M84 40 Q104 38 104 54 Q104 70 84 66" fill="#f7f3e9" />
        <path d="M38 42 q10 8 20 0 M40 52 q10 8 24 0" opacity="0.7" />
        <path d="M42 16 q-4 -8 2 -12 M56 16 q-4 -8 2 -12 M70 16 q-4 -8 2 -12" opacity="0.8" />
      </g>
    </svg>
  );
}

// The full donations card: the mug over a label, linking to a support page.
export function DonationsCard({ href = 'https://ko-fi.com', label = 'Donations' }: { href?: string; label?: string }) {
  return (
    <div className="card alt" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
      <a href={href} target="_blank" rel="noreferrer" title="Support this project" aria-label={label}
        style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <DonationMug />
        <span style={{ fontFamily: 'var(--font-title)', fontSize: '1.15rem' }}>{label}</span>
      </a>
    </div>
  );
}
