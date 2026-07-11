'use client';
/* Media input controls for the tool runtime: voice recording (MediaRecorder ->
 * data URL) and a small sketch canvas (pointer drawing -> PNG data URL). Both
 * are progressive: if the browser can't do it, they degrade gracefully. */
import { useEffect, useRef, useState } from 'react';

export function AudioField({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
    return () => { try { recRef.current?.stop(); } catch { /* ignore */ } };
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 1_500_000) { alert('Recording too long — keep it under ~1 minute.'); return; }
        const reader = new FileReader();
        reader.onload = () => onChange(String(reader.result || ''));
        reader.readAsDataURL(blob);
      };
      recRef.current = rec; rec.start(); setRecording(true);
    } catch { alert('Could not access the microphone.'); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setRecording(false); };

  return (
    <label className="field" style={{ gridColumn: '1 / -1' }}><span>{label}</span>
      {!supported ? <em style={{ fontSize: 12, opacity: 0.7 }}>Recording not supported in this browser.</em> : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {recording
            ? <button type="button" className="btn small red" onClick={stop}>● Stop</button>
            : <button type="button" className="btn small blue" onClick={start}>🎙️ Record</button>}
          {value && <audio controls src={value} style={{ height: 32 }} />}
          {value && !recording && <button type="button" className="btn small ghost" onClick={() => onChange('')}>Clear</button>}
        </div>
      )}
    </label>
  );
}

export function DrawField({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const W = 320, H = 200;

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, W, H); img.src = value; }
    ctx.strokeStyle = '#2d2a26'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  };
  const down = (e: React.PointerEvent) => { drawingRef.current = true; const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent) => { if (!drawingRef.current) return; const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const up = () => { if (!drawingRef.current) return; drawingRef.current = false; onChange(canvasRef.current!.toDataURL('image/png')); };
  const clear = () => { const ctx = canvasRef.current!.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); onChange(''); };

  return (
    <label className="field" style={{ gridColumn: '1 / -1' }}><span>{label}</span>
      <canvas ref={canvasRef} width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        style={{ border: '2px solid var(--ink)', borderRadius: 8, touchAction: 'none', width: '100%', maxWidth: W, background: '#fff' }} />
      <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={clear}>Clear drawing</button>
    </label>
  );
}
