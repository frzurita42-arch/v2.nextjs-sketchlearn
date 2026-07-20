'use client';
/* The coffee-mug donation prompt: the mug graphic (no card) with an admin-editable
 * nudge line beneath it. Clicking the mug opens a popup showing a Bitcoin logo, a
 * wallet address, and an admin-editable note explaining what the donation supports.
 * The two text lines use the SAME ✎ edit / 🎨 AI-reword controls as the section
 * titles (via useShelfTitle), admin-only, persisted in site settings. */
import { useState, type CSSProperties } from 'react';
import { DonationMug } from '@/components/ui/DonationMug';
import { useShelfTitle } from '@/components/tools/useShelfTitle';
import { useDonationPromptStyle, type DonationPromptScope } from '@/lib/donation-prompt-style';

// The platform's default Binance BTC deposit wallet, shown when a creator hasn't
// set their own.
const DEFAULT_ADDRESS = '122gSqZ1FKWxzkPDcmTVguXxzWcU9qo57y';

// A random-looking bech32 Bitcoin address (offered to managers as a quick fill).
const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function randomBtcAddress() {
  let s = 'bc1q';
  for (let i = 0; i < 38; i++) s += BECH32[Math.floor(Math.random() * BECH32.length)];
  return s;
}

// The Bitcoin logo — its orange disc with the ₿ mark.
function BitcoinLogo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Bitcoin">
      <circle cx="32" cy="32" r="30" fill="#f7931a" />
      <text x="32" y="45" textAnchor="middle" fontSize="42" fontWeight="700" fill="#fff" fontFamily="Arial, Helvetica, sans-serif">₿</text>
    </svg>
  );
}

// An inline admin-editable line — the same ✎ (custom edit) / 🎨 (AI reword) controls
// used on the section titles, persisted per key in site settings.
function EditableLine({ settingKey, fallback, textStyle }: { settingKey: string; fallback: string; textStyle?: CSSProperties }) {
  const { title, canEditTitle, onRenameTitle, onRemixTitle, remixingTitle } = useShelfTitle(settingKey, fallback);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const icon = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 } as const;
  const save = () => { const v = draft.trim(); if (v) onRenameTitle(v); setEditing(false); };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {editing ? (
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(title); setEditing(false); } }}
          onBlur={save} style={{ fontSize: 14, padding: '2px 6px', borderRadius: 6, border: '1.5px solid var(--ink)', maxWidth: 260 }} />
      ) : <span style={textStyle}>{title}</span>}
      {canEditTitle && !editing && (
        <>
          <button title="Edit (admin)" style={icon} onClick={e => { e.stopPropagation(); setDraft(title); setEditing(true); }}>✎</button>
          <button title="AI reword (admin)" style={icon} disabled={!!remixingTitle} onClick={e => { e.stopPropagation(); onRemixTitle(); }}>{remixingTitle ? '…' : '🎨'}</button>
        </>
      )}
    </span>
  );
}

export function DonationPrompt({ mugWidth = 220, mugHeight = 183, canCollapse, onCollapse, address = '', canManage, onSaveAddress, scope = 'lesson' }: {
  mugWidth?: number; mugHeight?: number;
  canCollapse?: boolean;              // owner/admin: show the 👁 hide toggle
  onCollapse?: () => void;            // hide the whole donation prompt
  address?: string;                   // the tool's stored Bitcoin wallet
  canManage?: boolean;                // owner/admin: may edit the wallet address
  onSaveAddress?: (a: string) => void;
  scope?: DonationPromptScope;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingAddr, setEditingAddr] = useState(false);
  const [addrDraft, setAddrDraft] = useState('');
  const style = useDonationPromptStyle(scope);
  const shownAddr = address || DEFAULT_ADDRESS;   // fall back to the Binance default
  const show = () => { setCopied(false); setEditingAddr(false); setOpen(true); };
  const copy = async () => { try { await navigator.clipboard.writeText(shownAddr); setCopied(true); } catch { /* ignore */ } };
  const saveAddr = () => { onSaveAddress?.(addrDraft.trim()); setEditingAddr(false); };
  if (style.hidden && !canCollapse) return null;
  return (
    <>
      <div style={{ justifySelf: 'center', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button onClick={show} title="Donate" aria-label="Donate" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <DonationMug width={mugWidth} height={mugHeight} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-title)', fontSize: `${style.size}px` }}>{style.text}</span>
          {/* 👁 admin-only: hide the donation prompt (regular users then see the
              example centered). */}
          {canCollapse && <button title="Hide the donation prompt from other users" onClick={onCollapse}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 8, fontSize: 14, lineHeight: 1 }}>{'👁︎'}</button>}
        </div>
      </div>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, width: '100%', padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <b>Support the platform</b>
              <button className="btn small ghost" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}><BitcoinLogo /></div>
            <div style={{ fontSize: 13, lineHeight: 1.4, margin: '0 0 12px' }}>
              <EditableLine settingKey="donateNote" fallback="Send Bitcoin to this wallet to support our continued efforts in building the platform." />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
              BINANCE · BITCOIN (BTC) WALLET ADDRESS
              {canManage && !editingAddr && <button title="Edit the wallet (owner / admin)" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }} onClick={() => { setAddrDraft(address); setEditingAddr(true); }}>✎</button>}
            </div>
            {editingAddr ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="text" autoFocus value={addrDraft} onChange={e => setAddrDraft(e.target.value)} placeholder="Binance BTC address"
                  onKeyDown={e => { if (e.key === 'Enter') saveAddr(); if (e.key === 'Escape') setEditingAddr(false); }}
                  style={{ flex: 1, fontSize: 13, fontFamily: '"JetBrains Mono", monospace' }} />
                <button className="btn small blue" onClick={() => setAddrDraft(randomBtcAddress())} title="Fill a random address">🎲</button>
                <button className="btn small green" onClick={saveAddr}>Save</button>
              </div>
            ) : (
              <code style={{ display: 'block', wordBreak: 'break-all', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, background: '#f7f3e9', border: '1.5px solid var(--ink)', borderRadius: 6, padding: '8px 10px' }}>{shownAddr}</code>
            )}
            {/* Binance deposit requirement (highlighted). */}
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#c0392b', background: 'rgba(240,185,11,0.16)', border: '1.5px solid #f0b90b', borderRadius: 6, padding: '6px 8px' }}>
              ⚠ Binance supports deposits from all BTC addresses (starting with &quot;1&quot;, &quot;3&quot;, &quot;bc1p&quot; and &quot;bc1q&quot;).
            </div>
            {!editingAddr && <button className="btn small blue" style={{ marginTop: 12 }} onClick={copy}>{copied ? '✓ Copied' : '📋 Copy address'}</button>}
          </div>
        </div>
      )}
    </>
  );
}
