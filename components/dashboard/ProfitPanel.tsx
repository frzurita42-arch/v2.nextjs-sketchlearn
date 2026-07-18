'use client';
/* Admin "Profit & coins" panel — grounds pricing in the REAL API cost.
 *   • Credits = what a generation spends internally.
 *   • Real cost = credits × cost-per-credit, derived from the live model prices.
 *   • Coins = a simpler sale unit (1 coin = creditsPerCoin credits).
 * The admin sets a target profit margin and coin size; the table shows, for each
 * reference amount, the real cost, the coins, and the minimum price to hit the
 * margin — plus what the current package prices actually earn. */
import { useEffect, useMemo, useState } from 'react';
import { API } from '@/lib/api';
import { DEFAULT_PRICES, type PriceTable } from '@/lib/model-registry';
import { costPerCreditUsd, costPerSlideUsd, realCostUsd, priceWithMarginUsd, LESSON_SLIDES, DEFAULT_MARGIN_PCT, DEFAULT_CREDITS_PER_COIN, CREDITS_PER_SLIDE } from '@/lib/pricing';

const usd = (n: number) => `$${(Number(n) || 0).toFixed(n < 0.1 ? 4 : 2)}`;
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString();

type Pkg = { tokens: number; usd: number };

export function ProfitPanel() {
  const [prices, setPrices] = useState<PriceTable>(DEFAULT_PRICES);
  const [margin, setMargin] = useState<number>(DEFAULT_MARGIN_PCT);
  const [perCoin, setPerCoin] = useState<number>(DEFAULT_CREDITS_PER_COIN);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    API.get('/api/dashboard/model-prices').then((r: any) => { if (r?.prices) setPrices(r.prices); }).catch(() => { /* defaults */ });
    API.get('/api/site-settings').then((r: any) => {
      const s = r?.settings || {};
      if (s.profitMargin !== undefined && s.profitMargin !== '') setMargin(Number(s.profitMargin) || 0);
      if (s.creditsPerCoin !== undefined && s.creditsPerCoin !== '') setPerCoin(Math.max(1, Number(s.creditsPerCoin) || DEFAULT_CREDITS_PER_COIN));
      const raw = s.tokenPackages;
      if (raw) { try { const p = typeof raw === 'string' ? JSON.parse(raw) : raw; if (Array.isArray(p)) setPackages(p.map((x: any) => ({ tokens: Number(x.tokens) || 0, usd: Number(x.usd) || 0 }))); } catch { /* ignore */ } }
    }).catch(() => { /* defaults */ });
  }, []);

  const save = async (key: string, value: string) => {
    setBusy(true); setMsg('');
    try { await API.put('/api/site-settings', { key, value }); setMsg('✓ Saved.'); } catch { setMsg('Could not save.'); }
    setBusy(false);
  };

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 8;

  const cpc = useMemo(() => costPerCreditUsd(prices), [prices]);
  const perSlide = useMemo(() => costPerSlideUsd(prices), [prices]);
  const lessonCost = perSlide * LESSON_SLIDES;
  const creditsPerLesson = CREDITS_PER_SLIDE * LESSON_SLIDES;   // one 5-slide presentation
  // Reference amounts (up to 5,000,000) + any configured packages, deduped + sorted.
  const rows = useMemo(() => {
    const REFS = [1000, 5000, 10000, 20000, 50000, 100000, 250000, 500000, 1000000, 2000000, 3000000, 5000000];
    const set = new Set<number>([...REFS, ...packages.map((p) => p.tokens)]);
    return Array.from(set).filter((n) => n > 0).sort((a, b) => a - b).map((credits) => {
      const pkg = packages.find((p) => p.tokens === credits);
      const cost = realCostUsd(credits, prices);
      const floor = priceWithMarginUsd(credits, prices, margin);
      const price = pkg ? pkg.usd : null;
      const actualMargin = (price != null && cost > 0) ? ((price - cost) / cost) * 100 : null;
      return {
        credits, coins: credits / perCoin,
        presentations: credits / creditsPerLesson,
        slides: credits / CREDITS_PER_SLIDE,
        images: credits / CREDITS_PER_SLIDE,   // one AI image per slide
        cost, floor, price, actualMargin,
      };
    });
  }, [packages, prices, margin, perCoin, creditsPerLesson]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
      <h4 style={{ margin: '0 0 4px' }}>💰 Profit &amp; coins</h4>
      <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 8px' }}>
        Real API cost of one {LESSON_SLIDES}-slide presentation ≈ <b>{usd(lessonCost)}</b> (mostly the {LESSON_SLIDES} AI images) — that&apos;s <b>{usd(cpc * 1000)}</b> per 1,000 credits ({CREDITS_PER_SLIDE.toLocaleString()} credits/slide, {creditsPerLesson.toLocaleString()} per presentation). The table estimates, for each credit amount up to 5,000,000, how many presentations / slides / images it makes, the real cost, the minimum price to hit your margin, and what your packages actually earn.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Target profit margin (%)</span>
          <input type="number" min={0} value={margin} onChange={(e) => setMargin(Number(e.target.value) || 0)} onBlur={() => save('profitMargin', String(margin))} style={{ width: 110 }} /></label>
        <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Credits per coin</span>
          <input type="number" min={1} value={perCoin} onChange={(e) => setPerCoin(Math.max(1, Number(e.target.value) || 1))} onBlur={() => save('creditsPerCoin', String(perCoin))} style={{ width: 110 }} /></label>
        {msg && <span style={{ fontSize: 12, opacity: 0.8 }}>{busy ? '…' : msg}</span>}
      </div>
      <div className="table-wrap">
        <table className="sketch compact"><tbody>
          <tr>
            <th>Credits</th><th>Coins</th>
            <th title="How many 5-slide presentations">Presentations</th>
            <th title="Total slides (≈730 credits each)">Slides</th>
            <th title="AI images generated (one per slide)">Images</th>
            <th>Real cost</th><th>Min price (+{margin}%)</th><th>Your price</th><th>Your margin</th>
          </tr>
          {pageRows.map((r) => (
            <tr key={r.credits}>
              <td>{fmt(r.credits)}</td>
              <td>{fmt(r.coins)}</td>
              <td>{fmt(r.presentations)}</td>
              <td>{fmt(r.slides)}</td>
              <td>{fmt(r.images)}</td>
              <td>{usd(r.cost)}</td>
              <td>{usd(r.floor)}</td>
              <td>{r.price == null ? '—' : usd(r.price)}</td>
              <td style={{ color: r.actualMargin == null ? undefined : r.actualMargin >= margin ? 'var(--green,#7fb069)' : 'var(--danger,#e4572e)' }}>
                {r.actualMargin == null ? '—' : `${Math.round(r.actualMargin).toLocaleString()}%`}
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
      {pageCount > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn small ghost" disabled={clampedPage === 0} onClick={() => setPage(clampedPage - 1)}>← Prev</button>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Page {clampedPage + 1} of {pageCount}</span>
          <button className="btn small ghost" disabled={clampedPage >= pageCount - 1} onClick={() => setPage(clampedPage + 1)}>Next →</button>
        </div>
      )}
      <p style={{ fontSize: 11, opacity: 0.65, margin: '8px 0 0' }}>
        Note: because the real API cost is so low (cents), a strict &ldquo;+{margin}%&rdquo; price is tiny. You&apos;ll usually charge a round market price (e.g. a few dollars) — the <b>Your margin</b> column shows the real profit % you actually make at your package prices.
      </p>
    </div>
  );
}
