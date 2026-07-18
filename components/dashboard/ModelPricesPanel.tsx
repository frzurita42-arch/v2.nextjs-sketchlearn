'use client';
/* Admin panel: the AI models the site uses and their token/image prices. The
 * 🔄 refresh button asks the AI (via OpenRouter web search) for today's public
 * prices, saves them to the DB, and those saved prices are what usage-log uses to
 * cost each generation. Prices come from GET /api/dashboard/model-prices. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import type { ModelInfo, PriceTable } from '@/lib/model-registry';

const perM = (perK: number) => `$${((Number(perK) || 0) * 1000).toFixed(2)}`;   // per-1K → per-1M tokens
const perImg = (n: number) => (Number(n) ? `$${Number(n).toFixed(3)}` : 'free');

export function ModelPricesPanel() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [prices, setPrices] = useState<PriceTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => API.get('/api/dashboard/model-prices').then((r: any) => { setModels(r?.models || []); setPrices(r?.prices || null); }).catch(() => { /* ignore */ });
  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setBusy(true); setMsg('');
    try {
      const r: any = await API.post('/api/dashboard/model-prices', {});
      setModels(r?.models || models); setPrices(r?.prices || prices);
      setMsg('✓ Prices refreshed from the web and saved.');
    } catch (e: any) { setMsg(e?.message || 'Could not refresh prices.'); }
    setBusy(false);
  };

  const textModels = models.filter((m) => m.kind === 'text');
  const imageModels = models.filter((m) => m.kind === 'image');

  return (
    <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0 }}>🤖 Model prices</h4>
        <button className="btn small green" disabled={busy} onClick={refresh}>{busy ? '… searching the web' : '🔄 Refresh prices'}</button>
      </div>
      <p style={{ fontSize: 12, opacity: 0.7, margin: '6px 0 8px' }}>
        The models the site generates with, and what each costs. Refresh fetches today&apos;s public prices via AI web search and saves them — these saved prices are used to compute the dollar cost of every generation.
        {prices?.updatedAt && <> Last updated {new Date(prices.updatedAt).toLocaleString()} ({prices.source || 'web'}).</>}
        {prices && !prices.updatedAt && <> Currently using built-in default prices.</>}
      </p>
      {msg && <p style={{ fontSize: 12, margin: '0 0 8px', color: msg.startsWith('✓') ? 'var(--green,#7fb069)' : 'var(--danger,#e4572e)' }}>{msg}</p>}

      <div className="table-wrap">
        <table className="sketch compact"><tbody>
          <tr><th>Text model</th><th>Provider</th><th>Input / 1M</th><th>Output / 1M</th></tr>
          {textModels.map((m, i) => {
            const p = prices?.text?.[m.provider];
            return <tr key={`t${i}`}><td>{m.label}</td><td>{m.provider}</td><td>{p ? perM(p.in) : '—'}</td><td>{p ? perM(p.out) : '—'}</td></tr>;
          })}
          <tr><th>Image model</th><th>Provider</th><th colSpan={2}>Per image</th></tr>
          {imageModels.map((m, i) => {
            const p = prices?.image?.[m.provider];
            return <tr key={`i${i}`}><td>{m.label}</td><td>{m.provider}</td><td colSpan={2}>{p === undefined ? '—' : perImg(p)}</td></tr>;
          })}
          {!models.length && <tr><td colSpan={4} style={{ opacity: 0.6 }}>Loading models…</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
