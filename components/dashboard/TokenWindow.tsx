'use client';
/* TokenWindow — the dashboard's 🎟 token panel.
 *   • Every signed-in user sees their available balance + a bar chart of the
 *     tokens they used per month.
 *   • Admins also see the whole platform's monthly usage + spend, every user's
 *     wallet & role, and a grant control to add tokens to a user (which promotes
 *     a plain user to moderator). Admins never spend their own tokens.
 * Data comes from GET /api/tokens; granting posts to the same route. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { MiniChart } from '@/components/ui/MiniChart';
import { WhatsAppCouponNote } from '@/components/dashboard/WhatsAppCouponNote';
import { ModelPricesPanel } from '@/components/dashboard/ModelPricesPanel';
import { UsageHistory } from '@/components/dashboard/UsageHistory';

type Wallet = { username: string; role: string; balance: number; usedThisMonth: number };
type Tokens = {
  role: string; balance: number; months: string[];
  myMonthly: { month: string; used: number }[];
  myEvents?: { t: string; tokens: number; cost: number }[];
  platformMonthly?: { month: string; used: number; cost: number }[];
  wallets?: Wallet[];
};

const shortMonth = (m: string) => { const [y, mm] = m.split('-'); const d = new Date(Number(y), Number(mm) - 1, 1); return d.toLocaleString(undefined, { month: 'short' }); };
const fmt = (n: number) => (Number(n) || 0).toLocaleString();

// Credit ↔ dollar conversion. One dollar buys this many credits, so a coupon's
// dollar price is credits / CREDITS_PER_USD. Used to seed a tier's price when the
// admin edits its credit amount (the price stays editable).
const CREDITS_PER_USD = 100;
const usdForCredits = (credits: number) => Math.round((Number(credits) || 0) / CREDITS_PER_USD * 100) / 100;
type Tier = { tokens: number; usd: number };
const DEFAULT_TIERS: Tier[] = [
  { tokens: 500, usd: 5 },
  { tokens: 1500, usd: 15 },
  { tokens: 5000, usd: 45 },
];

export function TokenWindow({ tokens, isAdmin, onChanged }: { tokens: Tokens | null; isAdmin: boolean; onChanged?: () => void }) {
  const [grantUser, setGrantUser] = useState('');
  const [grantAmt, setGrantAmt] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Coupon redeem (all users)
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');
  // Coupon create (admin)
  const [cCredits, setCCredits] = useState('500');
  const [cAi, setCAi] = useState(true);
  const [cLogo, setCLogo] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [cResult, setCResult] = useState<{ code: string; credits: number; image: string } | null>(null);
  const [cErr, setCErr] = useState('');
  const [coupons, setCoupons] = useState<any[]>([]);
  const loadCoupons = () => { if (isAdmin) API.get('/api/coupons').then((r: any) => setCoupons(Array.isArray(r?.coupons) ? r.coupons : [])).catch(() => { /* ignore */ }); };
  useEffect(() => { loadCoupons(); /* eslint-disable-next-line */ }, [isAdmin]);

  // Moderator → user token transfer (deducts from the sender; can't overdraw).
  const [sendUser, setSendUser] = useState('');
  const [sendAmt, setSendAmt] = useState('100');
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState('');

  // Three admin coupon tiers (credit amount + dollar price), editable via a pencil
  // popup and stored in site_settings so they persist.
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [editTier, setEditTier] = useState<null | { i: number; tokens: string; usd: string }>(null);
  useEffect(() => {
    if (!isAdmin) return;
    API.get('/api/site-settings').then((r: any) => {
      const raw = r?.settings?.couponTiers;
      if (!raw) return;
      try { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) setTiers(p.slice(0, 3).map((t: any) => ({ tokens: Math.max(1, Math.trunc(Number(t.tokens) || 0)), usd: Math.max(0, Number(t.usd) || 0) }))); } catch { /* ignore */ }
    }).catch(() => { /* ignore */ });
  }, [isAdmin]);
  const saveTiers = (next: Tier[]) => { setTiers(next); API.put('/api/site-settings', { key: 'couponTiers', value: JSON.stringify(next) }).catch(() => { /* keep optimistic */ }); };
  const saveEditTier = () => {
    if (!editTier) return;
    const tokens = Math.max(1, Math.trunc(Number(editTier.tokens) || 0));
    const usd = Math.max(0, Math.round((Number(editTier.usd) || 0) * 100) / 100);
    const next = tiers.map((t, i) => (i === editTier.i ? { tokens, usd } : t));
    saveTiers(next); setEditTier(null);
  };

  const redeem = async () => {
    const code = redeemCode.trim(); if (!code) return;
    setRedeemBusy(true); setRedeemMsg('');
    try {
      const r: any = await API.post('/api/coupons/redeem', { code });
      setRedeemMsg(`✓ Redeemed! +${fmt(r.credits)} credits.${r.promoted ? ' You’re now a moderator — the creator tools are unlocked.' : ''}`);
      setRedeemCode(''); onChanged?.();
    } catch (e: any) { setRedeemMsg(e?.message || 'Could not redeem that code.'); }
    setRedeemBusy(false);
  };
  const pickLogo = (f?: File) => {
    if (!f) { setCLogo(''); return; }
    if (f.size > 1_500_000) { setCErr('Logo must be under 1.5 MB.'); return; }
    const rd = new FileReader(); rd.onload = () => setCLogo(String(rd.result || '')); rd.readAsDataURL(f);
  };
  const createCoupon = async (creditsArg?: number) => {
    const credits = Math.trunc(Number(creditsArg ?? cCredits) || 0); if (credits <= 0) { setCErr('Enter a credit amount.'); return; }
    setCBusy(true); setCErr(''); setCResult(null);
    try {
      const r: any = await API.post('/api/coupons', { credits, useAi: cAi, logo: cLogo || undefined });
      setCResult({ code: r.code, credits: r.credits, image: r.image });
      loadCoupons();
    } catch (e: any) { setCErr(e?.message || 'Could not generate the coupon.'); }
    setCBusy(false);
  };

  // A moderator sends some of their own credits to another user. The recipient
  // must exist (a "doesn't exist" error pops up); the amount can't exceed the
  // sender's balance (checked here and on the server).
  const sendTokens = async () => {
    const username = sendUser.trim(); const amount = Math.trunc(Number(sendAmt) || 0);
    if (!username) { setSendMsg('Enter a username.'); return; }
    if (amount <= 0) { setSendMsg('Enter an amount greater than zero.'); return; }
    if (tokens && amount > tokens.balance) { window.alert(`You only have ${fmt(tokens.balance)} credits to send.`); return; }
    setSendBusy(true); setSendMsg('');
    try {
      const r: any = await API.post('/api/tokens/transfer', { username, amount });
      setSendMsg(`✓ Sent ${fmt(amount)} credits to ${username}.${r?.promoted ? ' They’re now a moderator.' : ''}`);
      setSendUser(''); onChanged?.();
    } catch (e: any) {
      // Surface "doesn't exist" (and overdraw) as a pop-up, per request.
      window.alert(e?.message || 'Could not send tokens.');
    }
    setSendBusy(false);
  };

  if (!tokens) return <p style={{ opacity: 0.6 }}>Loading your tokens…</p>;

  const usedThisMonth = tokens.myMonthly?.length ? tokens.myMonthly[tokens.myMonthly.length - 1].used : 0;

  const grant = async (delta: number) => {
    const username = grantUser.trim(); if (!username) { setMsg('Pick a user first.'); return; }
    setBusy(true); setMsg('');
    try {
      const r: any = await API.post('/api/tokens', { username, add: delta });
      setMsg(r?.promoted ? `✓ ${username} now has ${fmt(r.balance)} tokens (promoted to moderator)` : `✓ ${username}: ${fmt(r.balance)} tokens`);
      onChanged?.();
    } catch (e: any) { setMsg(e?.message || 'Could not update tokens.'); }
    setBusy(false);
  };

  const stat = (label: string, value: string, tone?: string) => (
    <div className="card" style={{ flex: '1 1 160px', minWidth: 140, padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-title)', fontSize: 30, color: tone || 'var(--ink)' }}>{value}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* Balance + this-month usage */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {isAdmin
          ? stat('Your access', 'Admin ∞', 'var(--green,#7fb069)')
          : stat('🎟 Available tokens', fmt(tokens.balance), tokens.balance > 0 ? 'var(--green,#7fb069)' : 'var(--red,#e4572e)')}
        {stat('Used this month', fmt(usedThisMonth))}
        {stat('Your role', tokens.role)}
      </div>

      {/* How to get credits: request a coupon on WhatsApp. Shown to non-admins
          (admins mint their own coupons and never spend their own tokens). */}
      {!isAdmin && <WhatsAppCouponNote />}
      {/* Redeem a coupon — anyone with a code can cash it in for credits. */}
      <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <h4 style={{ margin: '0 0 6px' }}>🎫 Redeem a coupon</h4>
        <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>Enter a coupon code to add its credits to your wallet.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" value={redeemCode} placeholder="SKL-XXXX-XXXX" onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') redeem(); }} style={{ flex: '1 1 200px', maxWidth: 260, fontFamily: 'monospace', letterSpacing: 2 }} />
          <button className="btn small green" disabled={redeemBusy || !redeemCode.trim()} onClick={redeem}>{redeemBusy ? '…' : 'Redeem'}</button>
          {redeemMsg && <span style={{ fontSize: 12, opacity: 0.85 }}>{redeemMsg}</span>}
        </div>
      </div>

      {/* Moderator → user transfer: send your OWN credits to another user (no user
          list, just type the name). Can't overdraw. */}
      {!isAdmin && tokens.role === 'moderator' && (() => {
        const bal = tokens.balance;
        const amt = Math.trunc(Number(sendAmt) || 0);
        const canSend = !!sendUser.trim() && amt > 0 && amt <= bal;
        return (
          <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 6px' }}>➕ Send credits to a user</h4>
            <p style={{ fontSize: 12, opacity: 0.8, margin: '0 0 8px' }}>
              Your balance: <b style={{ color: bal > 0 ? 'var(--green,#7fb069)' : 'var(--danger,#e4572e)' }}>{fmt(bal)} credits</b>
              <span style={{ opacity: 0.7 }}> — you can only send what you have.</span>
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" placeholder="username" value={sendUser} onChange={(e) => setSendUser(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSend) sendTokens(); }} style={{ minWidth: 160 }} />
              <input type="number" min={1} value={sendAmt} onChange={(e) => setSendAmt(e.target.value)} style={{ width: 110 }} />
              <button className="btn small green" disabled={sendBusy || !canSend} onClick={sendTokens}>{sendBusy ? '…' : 'Send'}</button>
              {sendMsg && <span style={{ fontSize: 12, opacity: 0.85 }}>{sendMsg}</span>}
            </div>
            {amt > bal && <p style={{ fontSize: 12, color: 'var(--danger,#e4572e)', margin: '6px 0 0' }}>You can&apos;t send more than your {fmt(bal)} credits.</p>}
          </div>
        );
      })()}

      {/* Token usage history with selectable time windows (min / hour / day /
          week / month), finance-app style. */}
      <UsageHistory events={tokens.myEvents || []} />
      {!isAdmin && tokens.balance <= 0 && (
        <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>You have no credits left. Token-costing actions (generating lessons, AI images) are disabled until you top up — redeem a coupon above.</p>
        </div>
      )}

      {isAdmin && (
        <>
          {/* Platform-wide usage + spend */}
          <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <MiniChart type="bar" title="🌍 Whole-platform tokens per month" unit=""
              data={(tokens.platformMonthly || []).map((m) => ({ label: shortMonth(m.month), value: m.used }))} />
            <MiniChart type="line" title="💵 Platform spend per month" unit="$"
              data={(tokens.platformMonthly || []).map((m) => ({ label: shortMonth(m.month), value: m.cost }))} />
          </div>

          {/* AI model catalog + their token/image prices (refreshable from the web). */}
          <ModelPricesPanel />

          {/* Grant control */}
          <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 6px' }}>➕ Add tokens to a user</h4>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>Adding tokens to a plain user promotes them to <b>moderator</b> (unlocks the creator tools). Use a negative amount to deduct.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={grantUser} onChange={(e) => setGrantUser(e.target.value)} style={{ minWidth: 160 }}>
                <option value="">— pick a user —</option>
                {(tokens.wallets || []).map((w) => <option key={w.username} value={w.username}>{w.username} ({w.role})</option>)}
              </select>
              <input type="number" value={grantAmt} onChange={(e) => setGrantAmt(e.target.value)} style={{ width: 110 }} />
              <button className="btn small green" disabled={busy} onClick={() => grant(Math.trunc(Number(grantAmt) || 0))}>{busy ? '…' : 'Add'}</button>
              <button className="btn small ghost" disabled={busy} onClick={() => grant(-Math.abs(Math.trunc(Number(grantAmt) || 0)))}>Deduct</button>
              {msg && <span style={{ fontSize: 12, opacity: 0.8 }}>{msg}</span>}
            </div>
          </div>

          {/* Coupon tiers — three editable presets (credits + dollar price). */}
          <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 6px' }}>🎟 Coupon tiers</h4>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 10px' }}>Three preset coupon sizes. Tap ✎ to edit a tier&apos;s credits and dollar price ({CREDITS_PER_USD} credits ≈ $1). <b>Generate</b> mints a coupon worth that many credits.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {tiers.map((t, i) => (
                <div key={i} className="card" style={{ flex: '1 1 170px', minWidth: 150, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, opacity: 0.6, fontWeight: 700 }}>Tier {i + 1}</div>
                  <div style={{ fontFamily: 'var(--font-title)', fontSize: 24 }}>
                    🎟 {fmt(t.tokens)}
                    <button title="Edit credits &amp; price" onClick={() => setEditTier({ i, tokens: String(t.tokens), usd: String(t.usd) })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, marginLeft: 4, verticalAlign: 'middle' }}>✎</button>
                  </div>
                  <div style={{ fontSize: 15, opacity: 0.8 }}>${t.usd.toFixed(2)}</div>
                  <button className="btn small green" style={{ marginTop: 8 }} disabled={cBusy} onClick={() => createCoupon(t.tokens)}>Generate</button>
                </div>
              ))}
            </div>
          </div>

          {/* Tier edit popup — change a tier's credits (price auto-converts, still editable). */}
          {editTier && (
            <div onClick={() => setEditTier(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340, width: '100%', padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><b>Edit tier {editTier.i + 1}</b><button className="btn small ghost" onClick={() => setEditTier(null)}>✕</button></div>
                <label className="field"><span>Credits (tokens)</span>
                  <input type="number" min={1} value={editTier.tokens} autoFocus
                    onChange={(e) => setEditTier((t) => t ? { ...t, tokens: e.target.value, usd: String(usdForCredits(Number(e.target.value) || 0)) } : t)} /></label>
                <label className="field"><span>Price (USD)</span>
                  <input type="number" min={0} step="0.01" value={editTier.usd}
                    onChange={(e) => setEditTier((t) => t ? { ...t, usd: e.target.value } : t)} /></label>
                <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 10px' }}>Conversion: {fmt(Math.trunc(Number(editTier.tokens) || 0))} credits ≈ ${usdForCredits(Number(editTier.tokens) || 0).toFixed(2)} at {CREDITS_PER_USD} credits / $1. You can override the price.</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn small ghost" onClick={() => setEditTier(null)}>Cancel</button>
                  <button className="btn small green" onClick={saveEditTier}>Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Coupon generator */}
          <div className="card alt" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 6px' }}>🎫 Generate a coupon</h4>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>Creates a unique code worth the credits you set. The coupon art is a standard minimalist ticket (credits + code shown); ✨ paints a Nano-Banana background. Add a logo to brand it.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label className="field" style={{ margin: 0 }}><span style={{ fontSize: 12 }}>Credits</span>
                <input type="number" value={cCredits} onChange={(e) => setCCredits(e.target.value)} style={{ width: 120 }} /></label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={cAi} onChange={(e) => setCAi(e.target.checked)} /> ✨ AI background
              </label>
              <label className="btn small ghost" style={{ cursor: 'pointer' }}>{cLogo ? '🖼 Logo ✓' : '🖼 Add logo'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { pickLogo(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
              {cLogo && <button className="btn small ghost" onClick={() => setCLogo('')}>✕ logo</button>}
              <button className="btn small green" disabled={cBusy} onClick={() => createCoupon()}>{cBusy ? 'Generating…' : 'Generate coupon'}</button>
              {cErr && <span style={{ fontSize: 12, color: 'var(--danger,#e4572e)' }}>{cErr}</span>}
            </div>
            {cResult && (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cResult.image} alt={`Coupon ${cResult.code}`} style={{ maxWidth: '100%', width: 420, border: '2px solid var(--ink)', borderRadius: 12 }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>{cResult.code}</code>
                  <button className="btn small ghost" onClick={() => { navigator.clipboard?.writeText(cResult.code); }}>📋 Copy code</button>
                  <a className="btn small ghost" href={cResult.image} download={`coupon-${cResult.code}.svg`} style={{ textDecoration: 'none' }}>⬇ Download image</a>
                </div>
              </div>
            )}
          </div>

          {/* Coupons created */}
          {coupons.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 12 }}><table className="sketch compact"><tbody>
              <tr><th>Code</th><th>Credits</th><th>Status</th><th>Created</th></tr>
              {coupons.map((c) => (
                <tr key={c.code}><td style={{ fontFamily: 'monospace' }}>{c.code}</td><td>{fmt(c.credits)}</td><td>{c.redeemedBy ? `redeemed by ${c.redeemedBy}` : 'unused'}</td><td>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td></tr>
              ))}
            </tbody></table></div>
          )}

          {/* Every wallet */}
          <div className="table-wrap"><table className="sketch compact"><tbody>
            <tr><th>User</th><th>Role</th><th>🎟 Balance</th><th>Used this month</th></tr>
            {(tokens.wallets || []).map((w) => (
              <tr key={w.username}><td>{w.username}</td><td>{w.role}</td><td>{fmt(w.balance)}</td><td>{fmt(w.usedThisMonth)}</td></tr>
            ))}
            {!(tokens.wallets || []).length && <tr><td colSpan={4}>No users yet.</td></tr>}
          </tbody></table></div>
        </>
      )}
    </div>
  );
}
