'use client';
/* Small self-contained inline-SVG charts for the dashboard — no external libraries.
 * Supports a vertical bar, a horizontal bar, a donut, and a line. Colours come from
 * one categorical palette; axes/labels use the ink colour so it reads in light and
 * dark. Each chart shows direct value labels so it's readable without a legend. */
export type ChartType = 'bar' | 'hbar' | 'donut' | 'line';
export type Datum = { label: string; value: number; color?: string };

// A distinguishable, reasonably colour-blind-friendly categorical palette.
const PALETTE = ['#5c80bc', '#7fb069', '#f6c453', '#e4572e', '#9b5de5', '#00b4d8', '#f15bb5', '#2d6a4f', '#f9a03f', '#3a6ea5'];
const colorAt = (i: number, c?: string) => c || PALETTE[i % PALETTE.length];
const clip = (s: string, n = 14) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 2 : 1));

export function MiniChart({ type, data, title, unit = '' }: { type: ChartType; data: Datum[]; title?: string; unit?: string }) {
  const rows = (data || []).filter(d => d && isFinite(d.value));
  if (!rows.length) return <p style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', margin: '10px 0' }}>No data to chart yet.</p>;
  const ink = 'var(--ink, #2d2a26)';
  const label = (v: number) => `${fmt(v)}${unit}`;

  let body: React.ReactNode = null;

  if (type === 'donut') {
    const total = rows.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
    const R = 62, r = 34, cx = 80, cy = 80; let ang = -Math.PI / 2;
    const seg = rows.map((d, i) => {
      const frac = Math.max(0, d.value) / total; const a0 = ang; const a1 = ang + frac * Math.PI * 2; ang = a1;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad: number, ax: number) => `${cx + rad * Math.cos(ax)} ${cy + rad * Math.sin(ax)}`;
      const path = `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
      return <path key={i} d={path} fill={colorAt(i, d.color)} stroke="#fff" strokeWidth={1} />;
    });
    body = (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <svg viewBox="0 0 160 160" width={160} height={160} role="img">{seg}</svg>
        <div style={{ display: 'grid', gap: 3, fontSize: 12 }}>
          {rows.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: colorAt(i, d.color), flex: '0 0 auto' }} />
              <span>{clip(d.label, 22)} — <b>{label(d.value)}</b></span>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (type === 'hbar') {
    const max = Math.max(...rows.map(d => d.value), 1);
    const rowH = 26, W = 320, padL = 96, padR = 44;
    const H = rows.length * rowH + 10;
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 460 }} role="img">
        {rows.map((d, i) => {
          const y = i * rowH + 6; const bw = (d.value / max) * (W - padL - padR);
          return (
            <g key={i}>
              <text x={padL - 6} y={y + 13} textAnchor="end" fontSize={11} fill={ink}>{clip(d.label)}</text>
              <rect x={padL} y={y} width={Math.max(1, bw)} height={16} rx={3} fill={colorAt(i, d.color)} />
              <text x={padL + Math.max(1, bw) + 5} y={y + 13} fontSize={11} fill={ink}>{label(d.value)}</text>
            </g>
          );
        })}
      </svg>
    );
  } else if (type === 'line') {
    const W = 340, H = 150, padL = 30, padB = 26, padT = 10, padR = 10;
    const max = Math.max(...rows.map(d => d.value), 1); const min = Math.min(...rows.map(d => d.value), 0);
    const span = max - min || 1;
    const x = (i: number) => padL + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * (W - padL - padR));
    const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
    const pts = rows.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
    // Too many points (24 hours, 60 minutes…) makes every-point labels collide, so
    // show at most ~8 evenly-spaced labels (always the first and last) with a tick
    // mark under each, and keep a dot on every point.
    const maxLabels = 8;
    const step = Math.max(1, Math.ceil(rows.length / maxLabels));
    const showLabel = (i: number) => i === 0 || i === rows.length - 1 || i % step === 0;
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 460 }} role="img">
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={ink} strokeWidth={1} opacity={0.5} />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={ink} strokeWidth={1} opacity={0.5} />
        <polyline points={pts} fill="none" stroke={PALETTE[0]} strokeWidth={2.5} />
        {rows.map((d, i) => <circle key={`c${i}`} cx={x(i)} cy={y(d.value)} r={2.5} fill={PALETTE[0]} />)}
        {rows.map((d, i) => showLabel(i) ? <line key={`k${i}`} x1={x(i)} y1={H - padB} x2={x(i)} y2={H - padB + 4} stroke={ink} strokeWidth={1} opacity={0.6} /> : null)}
        {rows.map((d, i) => showLabel(i) ? <text key={`t${i}`} x={x(i)} y={H - padB + 14} textAnchor="middle" fontSize={9} fill={ink} opacity={0.8}>{clip(d.label, 7)}</text> : null)}
        <text x={padL - 4} y={y(max)} textAnchor="end" fontSize={9} fill={ink} opacity={0.7}>{fmt(max)}</text>
      </svg>
    );
  } else { // vertical bar
    const max = Math.max(...rows.map(d => d.value), 1);
    const W = 340, H = 170, padB = 34, padT = 16, padL = 26, padR = 8;
    const bw = (W - padL - padR) / rows.length;
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 460 }} role="img">
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={ink} strokeWidth={1} opacity={0.5} />
        {rows.map((d, i) => {
          const bh = (d.value / max) * (H - padT - padB); const bx = padL + i * bw + bw * 0.15; const by = H - padB - bh;
          return (
            <g key={i}>
              <rect x={bx} y={by} width={bw * 0.7} height={Math.max(1, bh)} rx={3} fill={colorAt(i, d.color)} />
              <text x={bx + bw * 0.35} y={by - 4} textAnchor="middle" fontSize={10} fill={ink}>{label(d.value)}</text>
              <text x={bx + bw * 0.35} y={H - padB + 12} textAnchor="middle" fontSize={9} fill={ink} opacity={0.75}>{clip(d.label, 8)}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <figure style={{ margin: '10px 0 0', textAlign: 'center' }}>
      {title && <figcaption style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, marginBottom: 4 }}>{title}</figcaption>}
      {body}
    </figure>
  );
}
