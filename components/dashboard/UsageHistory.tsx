'use client';
/* Token-usage history with finance/crypto-style time windows: view your usage
 * bucketed by minute, hour, day, week or month. Buckets are computed on the
 * client from the raw usage events the token API returns (myEvents). */
import { useMemo, useState } from 'react';
import { MiniChart, type Datum } from '@/components/ui/MiniChart';

type Ev = { t: string; tokens: number; cost: number };

const GRAN = [
  { key: 'min', label: 'Minutes', count: 60, ms: 60_000 },
  { key: 'hour', label: 'Hours', count: 24, ms: 3_600_000 },
  { key: 'day', label: 'Days', count: 30, ms: 86_400_000 },
  { key: 'week', label: 'Weeks', count: 12, ms: 604_800_000 },
  { key: 'month', label: 'Months', count: 12, ms: 0 },
] as const;
type GranKey = typeof GRAN[number]['key'];

// Bucket the events into a time series (oldest→newest) for the chosen window.
function series(events: Ev[], g: typeof GRAN[number]): Datum[] {
  const now = new Date();
  if (g.key === 'month') {
    const keys: { k: string; label: string }[] = [];
    const map: Record<string, number> = {};
    for (let i = g.count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      keys.push({ k, label: d.toLocaleDateString(undefined, { month: 'short' }) });
      map[k] = 0;
    }
    for (const e of events) { const d = new Date(e.t); if (isNaN(d.getTime())) continue; const k = `${d.getFullYear()}-${d.getMonth()}`; if (k in map) map[k] += e.tokens; }
    return keys.map((x) => ({ label: x.label, value: Math.round(map[x.k]) }));
  }
  const buckets = new Array(g.count).fill(0);
  const nowMs = now.getTime();
  for (const e of events) {
    const t = new Date(e.t).getTime(); if (isNaN(t)) continue;
    const age = nowMs - t; if (age < 0) continue;
    const idx = Math.floor(age / g.ms);
    if (idx >= 0 && idx < g.count) buckets[idx] += e.tokens;
  }
  const out: Datum[] = [];
  for (let idx = g.count - 1; idx >= 0; idx--) {
    const at = new Date(nowMs - idx * g.ms);
    const label = g.key === 'min' ? at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : g.key === 'hour' ? at.toLocaleTimeString(undefined, { hour: '2-digit' })
        : at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    out.push({ label, value: Math.round(buckets[idx]) });
  }
  return out;
}

export function UsageHistory({ events }: { events: Ev[] }) {
  const [gran, setGran] = useState<GranKey>('day');
  const g = GRAN.find((x) => x.key === gran) || GRAN[2];
  const data = useMemo(() => series(events || [], g), [events, g]);
  const total = useMemo(() => data.reduce((s, d) => s + (d.value || 0), 0), [data]);

  return (
    <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <b style={{ fontSize: 14 }}>🎟 Token usage history</b>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {GRAN.map((x) => (
            <button key={x.key} className={`btn small ${gran === x.key ? 'blue' : 'ghost'}`} onClick={() => setGran(x.key)}>{x.label}</button>
          ))}
        </div>
      </div>
      <MiniChart type="line" data={data} title="" unit="" />
      <p style={{ fontSize: 12, opacity: 0.65, margin: '6px 0 0' }}>
        {total.toLocaleString()} credits used across the last {g.count} {g.label.toLowerCase()}
        {(!events || !events.length) && ' · no usage recorded yet'}.
      </p>
    </div>
  );
}
