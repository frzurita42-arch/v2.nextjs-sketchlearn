'use client';
/* The coffee-mug donation prompt: the mug graphic (no card) with an admin-editable
 * nudge line beneath it. Clicking the mug opens a popup showing a Bitcoin logo, a
 * wallet address, and an admin-editable note explaining what the donation supports.
 * The two text lines use the SAME ✎ edit / 🎨 AI-reword controls as the section
 * titles (via useShelfTitle), admin-only, persisted in site settings. */
import { useState, type CSSProperties } from 'react';
import { DonationMug } from '@/components/ui/DonationMug';
import { useShelfTitle } from '@/components/tools/useShelfTitle';

// A random-looking bech32 Bitcoin address (demo wallet).
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

export function DonationPrompt({ mugWidth = 220, mugHeight = 183 }: { mugWidth?: number; mugHeight?: number }) {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState('');
  const [copied, setCopied] = useState(false);
  const show = () => { setAddr(randomBtcAddress()); setCopied(false); setOpen(true); };
  const copy = async () => { try { await navigator.clipboard.writeText(addr); setCopied(true); } catch { /* ignore */ } };
  return (
    <>
      <div style={{ justifySelf: 'center', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button onClick={show} title="Donate" aria-label="Donate" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <DonationMug width={mugWidth} height={mugHeight} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <EditableLine settingKey="donateNudge" fallback="Please donate for more similar content" textStyle={{ fontFamily: 'var(--font-title)', fontSize: '1.2rem' }} />
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
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, marginBottom: 4 }}>BITCOIN WALLET ADDRESS</div>
            <code style={{ display: 'block', wordBreak: 'break-all', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, background: '#f7f3e9', border: '1.5px solid var(--ink)', borderRadius: 6, padding: '8px 10px' }}>{addr}</code>
            <button className="btn small blue" style={{ marginTop: 12 }} onClick={copy}>{copied ? '✓ Copied' : '📋 Copy address'}</button>
          </div>
        </div>
      )}
    </>
  );
}
