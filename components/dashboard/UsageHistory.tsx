'use client';
/* Token-usage history with a sliding time window, finance/crypto style. The slider
 * steps progressively through window sizes — seconds → minutes (5/10/30) → hours →
 * days → weeks → months → years — and the chart re-buckets the raw usage events
 * (myEvents) to fit the chosen window. */
import { useMemo, useState } from 'react';
import { MiniChart, type Datum } from '@/components/ui/MiniChart';

type Ev = { t: string; tokens: number; cost: number };

const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY, MONTH = 30 * DAY, YEAR = 365 * DAY;

// Progressive windows (small → large). span = total time shown, bucket = one point.
const WINDOWS: { label: string; span: number; bucket: number }[] = [
  { label: '30 seconds', span: 30 * SEC, bucket: 5 * SEC },
  { label: '1 minute', span: MIN, bucket: 5 * SEC },
  { label: '5 minutes', span: 5 * MIN, bucket: 30 * SEC },
  { label: '10 minutes', span: 10 * MIN, bucket: MIN },
  { label: '30 minutes', span: 30 * MIN, bucket: 3 * MIN },
  { label: '1 hour', span: HOUR, bucket: 5 * MIN },
  { label: '3 hours', span: 3 * HOUR, bucket: 15 * MIN },
  { label: '6 hours', span: 6 * HOUR, bucket: 30 * MIN },
  { label: '12 hours', span: 12 * HOUR, bucket: HOUR },
  { label: '1 day', span: DAY, bucket: 2 * HOUR },
  { label: '3 days', span: 3 * DAY, bucket: 6 * HOUR },
  { label: '1 week', span: WEEK, bucket: DAY },
  { label: '2 weeks', span: 2 * WEEK, bucket: DAY },
  { label: '1 month', span: MONTH, bucket: DAY },
  { label: '3 months', span: 3 * MONTH, bucket: WEEK },
  { label: '6 months', span: 6 * MONTH, bucket: WEEK },
  { label: '1 year', span: YEAR, bucket: MONTH },
];
const DEFAULT_IDX = WINDOWS.findIndex((w) => w.label === '1 day');

// Format a bucket's timestamp at a granularity that suits the bucket size.
function fmtTick(at: Date, bucket: number): string {
  if (bucket < MIN) return at.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
  if (bucket < HOUR) return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (bucket < DAY) return at.toLocaleTimeString([], { hour: '2-digit' });
  if (bucket < MONTH) return at.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return at.toLocaleDateString([], { month: 'short', year: '2-digit' });
}

// Bucket events into a time series (oldest→newest) for the chosen window.
function series(events: Ev[], w: { span: number; bucket: number }): Datum[] {
  const count = Math.max(1, Math.min(400, Math.round(w.span / w.bucket)));
  const buckets = new Array(count).fill(0);
  const now = Date.now();
  for (const e of events) {
    const t = new Date(e.t).getTime(); if (isNaN(t)) continue;
    const age = now - t; if (age < 0 || age >= w.span) continue;
    const idx = Math.floor(age / w.bucket);
    if (idx >= 0 && idx < count) buckets[idx] += e.tokens;
  }
  const out: Datum[] = [];
  for (let idx = count - 1; idx >= 0; idx--) {
    out.push({ label: fmtTick(new Date(now - idx * w.bucket), w.bucket), value: Math.round(buckets[idx]) });
  }
  return out;
}

export function UsageHistory({ events, title = '🎟 Token usage history' }: { events: Ev[]; title?: string }) {
  const [idx, setIdx] = useState(DEFAULT_IDX < 0 ? 9 : DEFAULT_IDX);
  const w = WINDOWS[Math.min(Math.max(idx, 0), WINDOWS.length - 1)];
  const data = useMemo(() => series(events || [], w), [events, w]);
  const total = useMemo(() => data.reduce((s, d) => s + (d.value || 0), 0), [data]);

  return (
    <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ fontSize: 14 }}>{title}</b>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Last <b>{w.label}</b></span>
      </div>
      <MiniChart type="line" data={data} title="" unit="" />
      {/* The sliding window: drag from seconds → minutes → hours → days → weeks →
          months → years. Each stop is a progressively larger window. */}
      <input type="range" min={0} max={WINDOWS.length - 1} step={1} value={idx}
        onChange={(e) => setIdx(parseInt(e.target.value, 10))}
        aria-label="Time window" style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent,#5c80bc)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.55, marginTop: 2 }}>
        <span>seconds</span><span>minutes</span><span>hours</span><span>days</span><span>weeks</span><span>months</span><span>year</span>
      </div>
      <p style={{ fontSize: 12, opacity: 0.65, margin: '6px 0 0' }}>
        {total.toLocaleString()} credits used in the last {w.label}
        {(!events || !events.length) && ' · no usage recorded yet'}.
      </p>
    </div>
  );
}
