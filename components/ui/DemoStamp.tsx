'use client';
import React from 'react';

/* DemoStamp — a rubber-stamp style "DEMO" mark: a horizontally-laid red oval with
 * a jagged (seal-like) edge and the word DEMO across it, tilted slightly. Overlaid
 * on example/advert card images so it's clear the card is a demo, not real data. */
export function DemoStamp({ width = 150, label = 'DEMO' }: { width?: number; label?: string }) {
  // Build a jagged ellipse path (alternating radius) so the edge looks torn/sealed.
  const cx = 100, cy = 50, rx = 90, ry = 42, spikes = 48;
  let d = '';
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const k = i % 2 === 0 ? 1 : 0.88;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  d += 'Z';
  const red = '#e4572e';
  return (
    <svg viewBox="0 0 200 100" width={width} height={width / 2} aria-label={`${label} stamp`} role="img"
      style={{ transform: 'rotate(-8deg)', opacity: 0.9, filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.15))' }}>
      <path d={d} fill="none" stroke={red} strokeWidth="4.5" strokeLinejoin="round" />
      <ellipse cx={cx} cy={cy} rx={rx - 16} ry={ry - 12} fill="none" stroke={red} strokeWidth="2" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central"
        fill={red} fontFamily="var(--font-title), cursive" fontWeight="800" fontSize="40"
        letterSpacing="2">{label}</text>
    </svg>
  );
}
