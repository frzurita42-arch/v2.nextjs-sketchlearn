'use client';
/* Share + QR for any tool page (a repository or a slide presentation).
 * The QR is generated fully client-side (no external service) from the tool's
 * share URL, so scanning it opens the same page on a phone. */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function SharePanel({ slug, title }: { slug: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!open) return;
    const u = `${window.location.origin}/?tool=${encodeURIComponent(slug)}`;
    setUrl(u);
    QRCode.toDataURL(u, { width: 320, margin: 2, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [open, slug]);

  const copy = () => navigator.clipboard?.writeText(url).then(
    () => { /* copied */ },
    () => window.prompt('Copy this share link:', url),
  );

  return (
    <>
      <button className="btn small blue" onClick={() => setOpen(true)}>🔗 Share / QR</button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(45,42,38,0.6)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, width: '100%', padding: '16px 18px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b style={{ fontSize: 14 }}>Share {title ? `“${title}”` : 'this page'}</b>
              <button className="btn small ghost" onClick={() => setOpen(false)}>✕</button>
            </div>
            {qr
              ? <img src={qr} alt="QR code" style={{ width: 240, height: 240, maxWidth: '100%', border: '2px solid var(--ink)', borderRadius: 12, background: '#fff' }} />
              : <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>Generating QR…</div>}
            <p style={{ fontSize: 12, opacity: 0.7, margin: '8px 0 4px' }}>Scan to open on a phone, or copy the link.</p>
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%', fontSize: 12, textAlign: 'center', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn small green" onClick={copy}>📋 Copy link</button>
              {qr && <a className="btn small ghost" href={qr} download={`${slug}-qr.png`}>⬇ Download QR</a>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
