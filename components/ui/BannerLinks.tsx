'use client';
/* Banner-corner link objects — small hand-drawn SVG links that sit in the free
 * quarters on either side of a page banner (see PageHeader's left/right slots).
 * Each is its own container so it can be found, reused and swapped later:
 *   - CoffeeMugLink  → a "Buy me a coffee" donations link (right slot)
 *   - PaperPlaneLink → a "Share / tell a friend" link (left slot)
 * Both draw in the notebook sketch style (stroke #2d2a26) so they match the
 * rhythm of the rest of the page. New corner links can copy CornerLink. */
import React from 'react';
import { DonationMug } from '@/components/ui/DonationMug';

// Shared wrapper: a centered SVG over a tiny caption, the whole thing a link.
function CornerLink({ href, label, title, children }: { href: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} aria-label={title}
      className="banner-link"
      style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      {children}
      <span style={{ fontFamily: 'var(--font-title)', fontSize: '0.95rem', lineHeight: 1, opacity: 0.85 }}>{label}</span>
    </a>
  );
}

// Right slot — donations. Reuses the shared DonationMug sketch.
export function CoffeeMugLink({ href = 'https://ko-fi.com', label = 'Donate', width = 62, height = 52 }: { href?: string; label?: string; width?: number; height?: number }) {
  return (
    <CornerLink href={href} label={label} title="Buy me a coffee — support this project">
      <DonationMug width={width} height={height} />
    </CornerLink>
  );
}

// Hand-drawn paper airplane, same sketch language as the mug.
function PaperPlane({ width = 62, height = 52 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 120 100" role="img" aria-label="paper airplane">
      <g fill="none" stroke="#2d2a26" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* Body — a dart pointing up-right. */}
        <path d="M8 44 L112 8 L70 96 Z" fill="#5c80bc" />
        {/* The near wing fold. */}
        <path d="M8 44 L64 60 L70 96" fill="#7fb069" />
        {/* Inner crease toward the nose. */}
        <path d="M64 60 L112 8" opacity="0.6" />
      </g>
    </svg>
  );
}

// Left slot — share / tell a friend. A mailto so it works with no backend.
export function PaperPlaneLink({ href, label = 'Share', width = 62, height = 52 }: { href?: string; label?: string; width?: number; height?: number }) {
  const share = href || `mailto:?subject=${encodeURIComponent('Check out SketchLearn')}&body=${encodeURIComponent('I found this AI teaching platform — take a look: https://v2-nextjs-sketchlearn.vercel.app')}`;
  return (
    <CornerLink href={share} label={label} title="Share this page — tell a friend">
      <PaperPlane width={width} height={height} />
    </CornerLink>
  );
}
