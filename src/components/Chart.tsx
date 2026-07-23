"use client";

import React from "react";
import type { ChartSpec } from "@/lib/types";

// Small SVG chart renderer for slide "chart" components. Categorical series
// colors are the validated dark-surface slots (blue, orange, aqua, yellow);
// text wears text tokens, marks are thin (2px lines, small round markers).

const SERIES = ["var(--color-chart1)", "var(--color-chart2)", "var(--color-chart3)", "var(--color-chart4)"];

const W = 560;
const H = 320;
const PAD = { top: 28, right: 20, bottom: 46, left: 54 };

function ticks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = mult * step;
  const start = Math.ceil(min / s) * s;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += s) out.push(Number(v.toFixed(10)));
  return out;
}

export function Chart({ spec }: { spec: ChartSpec }) {
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  let body: React.ReactNode = null;
  let xTicksNode: React.ReactNode = null;
  let yTicksNode: React.ReactNode = null;

  if (spec.kind === "bar" && spec.bars?.length) {
    const bars = spec.bars;
    const maxV = Math.max(...bars.map((b) => b.value), 0);
    const minV = Math.min(...bars.map((b) => b.value), 0);
    const yT = ticks(minV, maxV || 1);
    const y = (v: number) =>
      PAD.top + ih - ((v - Math.min(minV, yT[0])) / (Math.max(maxV, yT[yT.length - 1]) - Math.min(minV, yT[0]) || 1)) * ih;
    const bw = iw / bars.length;
    body = (
      <g>
        {bars.map((b, i) => {
          const x = PAD.left + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const y0 = y(Math.max(0, Math.min(minV, yT[0])));
          const yv = y(b.value);
          const top = Math.min(yv, y0);
          const h = Math.max(2, Math.abs(y0 - yv));
          return (
            <g key={i}>
              <rect x={x} y={top} width={w} height={h} rx={4} fill={SERIES[0]}>
                <title>{`${b.label}: ${b.value}`}</title>
              </rect>
              {/* square off the baseline end so rounding only shows at the data end */}
              <rect x={x} y={y0 - 4 < top ? top : y0 - 4} width={w} height={4} fill={SERIES[0]} />
            </g>
          );
        })}
        {bars.map((b, i) => (
          <text
            key={`l${i}`}
            x={PAD.left + i * bw + bw / 2}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            className="fill-[var(--color-mut)] text-[11px]"
          >
            {b.label.length > 10 ? `${b.label.slice(0, 9)}…` : b.label}
          </text>
        ))}
      </g>
    );
    yTicksNode = yT.map((t) => (
      <g key={t}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
        <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" className="fill-[var(--color-dim)] text-[10.5px]">
          {t}
        </text>
      </g>
    ));
  } else if (spec.series?.length) {
    const all = spec.series.flatMap((s) => s.points);
    const xMin = Math.min(...all.map((p) => p.x));
    const xMax = Math.max(...all.map((p) => p.x));
    const yMin = Math.min(...all.map((p) => p.y), 0);
    const yMax = Math.max(...all.map((p) => p.y));
    const xT = ticks(xMin, xMax || 1);
    const yT = ticks(yMin, yMax || 1);
    const x = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin || 1)) * iw;
    const y = (v: number) => PAD.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
    body = (
      <g>
        {spec.series.map((s, si) => {
          const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
          const color = SERIES[si % SERIES.length];
          const last = s.points[s.points.length - 1];
          return (
            <g key={si}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.points.length <= 16 &&
                s.points.map((p, i) => (
                  <circle key={i} cx={x(p.x)} cy={y(p.y)} r={3.5} fill={color} stroke="var(--color-panel)" strokeWidth={2}>
                    <title>{`${s.name ? `${s.name} — ` : ""}(${p.x}, ${p.y})`}</title>
                  </circle>
                ))}
              {s.name && (
                <text x={Math.min(x(last.x) + 8, W - 4)} y={y(last.y) + 4} className="fill-[var(--color-mut)] text-[11px]">
                  {s.name}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
    yTicksNode = yT.map((t) => (
      <g key={t}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
        <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" className="fill-[var(--color-dim)] text-[10.5px]">
          {t}
        </text>
      </g>
    ));
    xTicksNode = xT.map((t) => (
      <text key={t} x={x(t)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-[var(--color-dim)] text-[10.5px]">
        {t}
      </text>
    ));
  } else {
    return null;
  }

  return (
    <figure className="overflow-x-auto rounded-xl border border-line bg-panel2/50 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title || "chart"} className="min-w-[380px]">
        {spec.title && (
          <text x={PAD.left} y={16} className="fill-[var(--color-ink)] text-[12.5px] font-semibold">
            {spec.title}
          </text>
        )}
        {yTicksNode}
        {xTicksNode}
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--color-line2)" strokeWidth={1} />
        {body}
        {spec.xLabel && (
          <text x={PAD.left + iw / 2} y={H - 8} textAnchor="middle" className="fill-[var(--color-mut)] text-[11px]">
            {spec.xLabel}
          </text>
        )}
        {spec.yLabel && (
          <text x={14} y={PAD.top + ih / 2} textAnchor="middle" transform={`rotate(-90 14 ${PAD.top + ih / 2})`} className="fill-[var(--color-mut)] text-[11px]">
            {spec.yLabel}
          </text>
        )}
      </svg>
    </figure>
  );
}
