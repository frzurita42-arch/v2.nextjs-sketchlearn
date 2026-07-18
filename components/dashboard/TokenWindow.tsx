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
import { MiniChart, type Datum } from '@/components/ui/MiniChart';
import { WhatsAppCouponNote } from '@/components/dashboard/WhatsAppCouponNote';

type Wallet = { username: string; role: string; balance: number; usedThisMonth: number };
type Tokens = {
  role: string; balance: number; months: string[];
  myMonthly: { month: string; used: number }[];
  platformMonthly?: { month: string; used: number; cost: number }[];
  wallets?: Wallet[];
};

const shortMonth = (m: string) => { const [y, mm] = m.split('-'); const d = new Date(Number(y), Number(mm) - 1, 1); return d.toLocaleString(undefined, { month: 'short' }); };
const fmt = (n: number) => (Number(n) || 0).toLocaleString();

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
  const createCoupon = async () => {
    const credits = Math.trunc(Number(cCredits) || 0); if (credits <= 0) { setCErr('Enter a credit amount.'); return; }
    setCBusy(true); setCErr(''); setCResult(null);
    try {
      const r: any = await API.post('/api/coupons', { credits, useAi: cAi, logo: cLogo || undefined });
      setCResult({ code: r.code, credits: r.credits, image: r.image });
      loadCoupons();
    } catch (e: any) { setCErr(e?.message || 'Could not generate the coupon.'); }
    setCBusy(false);
  };

  if (!tokens) return <p style={{ opacity: 0.6 }}>Loading your tokens…</p>;

  const usedData: Datum[] = (tokens.myMonthly || []).map((m) => ({ label: shortMonth(m.month), value: m.used }));
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

      {/* Used-per-month bar chart (available balance is the number above). */}
      <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <MiniChart type="bar" data={usedData} title="🎟 Tokens you used per month" unit="" />
        {!isAdmin && tokens.balance <= 0 && (
          <p style={{ fontSize: 12, opacity: 0.7, margin: '8px 0 0' }}>You have no tokens left. Token-costing actions (generating lessons, AI images) are disabled until an admin adds more to your wallet.</p>
        )}
      </div>

      {isAdmin && (
        <>
          {/* Platform-wide usage + spend */}
          <div className="card" style={{ padding: '12px 14px', marginBottom: 12 }}>
            <MiniChart type="bar" title="🌍 Whole-platform tokens per month" unit=""
              data={(tokens.platformMonthly || []).map((m) => ({ label: shortMonth(m.month), value: m.used }))} />
            <MiniChart type="line" title="💵 Platform spend per month" unit="$"
              data={(tokens.platformMonthly || []).map((m) => ({ label: shortMonth(m.month), value: m.cost }))} />
          </div>

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
              <button className="btn small green" disabled={cBusy} onClick={createCoupon}>{cBusy ? 'Generating…' : 'Generate coupon'}</button>
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
