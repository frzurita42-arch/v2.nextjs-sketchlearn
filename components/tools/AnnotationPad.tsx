'use client';
/* A paper-like annotation pad for writing answers by hand: pen (thickness +
 * colours), eraser, and stamped text (font + size), across MULTIPLE PAGES with
 * pagination (add a fresh blank page when you run out). Everything is drawn onto
 * the canvas so each page exports as a PNG data URL — used for AI grading, PDF
 * download, and publishing. Responsive: the tall page scales to fit 9:16. */
import { useEffect, useRef, useState } from 'react';

const W = 760, H = 1040;                       // portrait "page" (≈ 9:16)
const COLORS = ['#2d2a26', '#e4572e', '#5c80bc', '#7fb069', '#f9a03f'];
const FONTS = [['Serif', 'Georgia, serif'], ['Sans', 'system-ui, sans-serif'], ['Mono', 'ui-monospace, monospace']];

export function AnnotationPad({ onReady }: { onReady?: (getPages: () => string[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pagesRef = useRef<string[]>(['']);      // saved page images ('' = blank)
  const [pageIdx, setPageIdx] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'text'>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(3);
  const [font, setFont] = useState(FONTS[0][1]);
  const [fontSize, setFontSize] = useState(30);
  const [textVal, setTextVal] = useState('');
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const ctx = () => canvasRef.current!.getContext('2d')!;
  const paintBlank = (dataUrl: string) => {
    const x = ctx();
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(92,128,188,0.12)'; x.lineWidth = 1;
    for (let gy = 40; gy < H; gy += 40) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
    if (dataUrl) { const img = new Image(); img.onload = () => x.drawImage(img, 0, 0, W, H); img.src = dataUrl; }
  };
  const getPages = () => { pagesRef.current[pageIdx] = canvasRef.current!.toDataURL('image/png'); return [...pagesRef.current]; };

  useEffect(() => { paintBlank(pagesRef.current[0]); onReady?.(getPages); /* eslint-disable-next-line */ }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  };
  const down = (e: React.PointerEvent) => {
    if (tool === 'text') { if (!textVal.trim()) { alert('Type your text in the box first, then tap where it goes.'); return; } const p = pos(e); const x = ctx(); x.fillStyle = color; x.font = `${fontSize}px ${font}`; x.textBaseline = 'top'; x.fillText(textVal, p.x, p.y); return; }
    drawing.current = true; last.current = pos(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return; e.preventDefault();
    const p = pos(e), x = ctx();
    x.strokeStyle = tool === 'eraser' ? '#fff' : color; x.lineWidth = tool === 'eraser' ? size * 6 : size; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(last.current!.x, last.current!.y); x.lineTo(p.x, p.y); x.stroke(); last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };

  const goto = (i: number) => { pagesRef.current[pageIdx] = canvasRef.current!.toDataURL('image/png'); setPageIdx(i); paintBlank(pagesRef.current[i] || ''); };
  const addPage = () => { pagesRef.current[pageIdx] = canvasRef.current!.toDataURL('image/png'); pagesRef.current.push(''); const i = pagesRef.current.length - 1; setPageCount(pagesRef.current.length); setPageIdx(i); paintBlank(''); };
  const clearPage = () => { if (!confirm('Clear this page?')) return; pagesRef.current[pageIdx] = ''; paintBlank(''); };

  const swatch = (c: string) => <button key={c} type="button" onClick={() => { setColor(c); setTool('pen'); }} title={c}
    style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--ink)' : '2px solid rgba(0,0,0,0.3)', cursor: 'pointer' }} />;
  const toolBtn = (id: any, label: string) => <button type="button" className={`btn small ${tool === id ? 'blue' : 'ghost'}`} onClick={() => setTool(id)}>{label}</button>;

  return (
    <div style={{ maxWidth: W, margin: '0 auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        {toolBtn('pen', '✏️ Pen')}{toolBtn('eraser', '🩹 Eraser')}{toolBtn('text', '🔤 Text')}
        <span style={{ display: 'flex', gap: 5 }}>{COLORS.map(swatch)}</span>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>Thick
          <input type="range" min={1} max={16} value={size} onChange={e => setSize(Number(e.target.value))} /></label>
      </div>
      {tool === 'text' && (
        <div className="chat-input-row" style={{ maxWidth: 520, margin: '0 auto 6px' }}>
          <input type="text" value={textVal} placeholder="Type text, then tap the page to place it" onChange={e => setTextVal(e.target.value)} />
          <select value={font} onChange={e => setFont(e.target.value)}>{FONTS.map(([n, v]) => <option key={v} value={v}>{n}</option>)}</select>
          <input type="number" min={12} max={80} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: 60 }} />
        </div>
      )}
      {/* The page */}
      <canvas ref={canvasRef} width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        style={{ width: '100%', maxWidth: W, aspectRatio: `${W} / ${H}`, border: '2px solid var(--ink)', borderRadius: 8, background: '#fff', touchAction: 'none', display: 'block', margin: '0 auto' }} />
      {/* Page navigation */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn small ghost" disabled={pageIdx === 0} onClick={() => goto(pageIdx - 1)}>← Prev</button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Page {pageIdx + 1} / {pageCount}</span>
        <button className="btn small ghost" disabled={pageIdx >= pageCount - 1} onClick={() => goto(pageIdx + 1)}>Next →</button>
        <button className="btn small" onClick={addPage}>＋ Add page</button>
        <button className="btn small ghost" onClick={clearPage}>Clear page</button>
      </div>
    </div>
  );
}

// Stack page images into one tall PNG (for AI grading) — returns a data URL.
export async function compositePages(pages: string[]): Promise<string> {
  const imgs = await Promise.all(pages.filter(Boolean).map(src => new Promise<HTMLImageElement>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(i); i.src = src; })));
  if (!imgs.length) return '';
  const w = Math.max(...imgs.map(i => i.width || W));
  const h = imgs.reduce((a, i) => a + (i.height || H), 0);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  let y = 0; for (const i of imgs) { x.drawImage(i, 0, y, i.width || W, i.height || H); y += (i.height || H); }
  return c.toDataURL('image/jpeg', 0.85);
}
