'use client';
/* A paper-like annotation pad for writing/drawing by hand: pen (thickness +
 * colours), eraser, and stamped text (font + size). Two layouts:
 *   - PAGED (default): discrete portrait pages with "＋ New page" pagination.
 *   - SCROLL (scroll=true): one continuous surface sized to ~half the screen that
 *     you can grow DOWNWARD ("＋ Add space") to keep writing vertically instead of
 *     turning pages — used by the canvas-chat / journal modes.
 * It can EXPAND to fill the whole screen. Everything is drawn onto the canvas so
 * it exports as a PNG data URL for AI reading, PDF download, and publishing. */
import { useEffect, useRef, useState } from 'react';

const W = 820, H = 1160;                        // portrait "page" backing size
const COLORS = ['#2d2a26', '#e4572e', '#5c80bc', '#7fb069', '#f9a03f'];
const FONTS = [['Serif', 'Georgia, serif'], ['Sans', 'system-ui, sans-serif'], ['Mono', 'ui-monospace, monospace']];

export function AnnotationPad({ onReady, onChange, scroll = false }: { onReady?: (getPages: () => string[]) => void; onChange?: () => void; scroll?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pagesRef = useRef<string[]>(['']);      // saved page images ('' = blank)
  const [pageIdx, setPageIdx] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [padH, setPadH] = useState(scroll ? 900 : H);   // scroll mode grows this
  const [tool, setTool] = useState<'pen' | 'eraser' | 'text'>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(3);
  const [font, setFont] = useState(FONTS[0][1]);
  const [fontSize, setFontSize] = useState(32);
  const [textVal, setTextVal] = useState('');
  const [expanded, setExpanded] = useState(false);
  // Drawing starts OFF so a touch scrolls the page. Turn it on to write without
  // the page sliding; turn it off again to scroll past the pad.
  const [drawOn, setDrawOn] = useState(false);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const growFrom = useRef<string | null>(null);         // ink to restore after a grow

  const ctx = () => canvasRef.current!.getContext('2d')!;
  const paintBlank = (dataUrl: string, h = padH) => {
    const x = ctx();
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, h);
    x.strokeStyle = 'rgba(92,128,188,0.12)'; x.lineWidth = 1;
    for (let gy = 44; gy < h; gy += 44) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
    if (dataUrl) { const img = new Image(); img.onload = () => x.drawImage(img, 0, 0); img.src = dataUrl; } // natural size, top-aligned
  };
  const getPages = () => { pagesRef.current[pageIdx] = canvasRef.current!.toDataURL('image/png'); return [...pagesRef.current]; };

  useEffect(() => { paintBlank(pagesRef.current[0]); onReady?.(getPages); /* eslint-disable-next-line */ }, []);
  // After a grow, the canvas element was recreated blank — restore prior ink on top.
  useEffect(() => { if (growFrom.current != null) { paintBlank(growFrom.current); growFrom.current = null; } /* eslint-disable-next-line */ }, [padH]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (padH / r.height) };
  };
  const down = (e: React.PointerEvent) => {
    if (!drawOn) return;                          // scroll mode — let the touch scroll the page
    if (tool === 'text') { if (!textVal.trim()) { alert('Type your text in the box first, then tap where it goes.'); return; } const p = pos(e); const x = ctx(); x.fillStyle = color; x.font = `${fontSize}px ${font}`; x.textBaseline = 'top'; x.fillText(textVal, p.x, p.y); onChange?.(); return; }
    drawing.current = true; last.current = pos(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return; e.preventDefault();
    const p = pos(e), x = ctx();
    x.strokeStyle = tool === 'eraser' ? '#fff' : color; x.lineWidth = tool === 'eraser' ? size * 6 : size; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(last.current!.x, last.current!.y); x.lineTo(p.x, p.y); x.stroke(); last.current = p;
  };
  const up = () => { if (drawing.current) onChange?.(); drawing.current = false; last.current = null; };

  const goto = (i: number) => { pagesRef.current[pageIdx] = canvasRef.current!.toDataURL('image/png'); setPageIdx(i); paintBlank(pagesRef.current[i] || ''); };
  const addPage = () => { pagesRef.current[pageIdx] = canvasRef.current!.toDataURL('image/png'); pagesRef.current.push(''); const i = pagesRef.current.length - 1; setPageCount(pagesRef.current.length); setPageIdx(i); paintBlank(''); onChange?.(); };
  const clearPage = () => { if (!confirm(scroll ? 'Clear everything written here?' : 'Clear this page?')) return; pagesRef.current[pageIdx] = ''; if (scroll) setPadH(900); paintBlank('', scroll ? 900 : padH); };
  // SCROLL mode: extend the writing surface downward (keeps what you already wrote).
  const addSpace = () => { growFrom.current = canvasRef.current!.toDataURL('image/png'); setPadH(h => Math.min(h + 700, 6000)); };

  const swatch = (c: string) => <button key={c} type="button" onClick={() => { setColor(c); setTool('pen'); }} title={c}
    style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--ink)' : '2px solid rgba(0,0,0,0.3)', cursor: 'pointer' }} />;
  // Picking a tool also turns drawing on (you tapped it to write).
  const toolBtn = (id: any, label: string) => <button type="button" className={`btn small ${drawOn && tool === id ? 'blue' : 'ghost'}`} onClick={() => { setTool(id); setDrawOn(true); }}>{label}</button>;

  // In scroll mode the canvas lives in a fixed-height window you scroll through;
  // in paged mode it scales to fit. Both toggle touchAction so writing mode
  // doesn't scroll and scroll mode does.
  const winMax = expanded ? '86vh' : (scroll ? '50vh' : '68vh');
  const canvas = (
    <canvas ref={canvasRef} width={W} height={padH} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      style={{ width: '100%', maxWidth: expanded ? '100%' : W, aspectRatio: `${W} / ${padH}`, border: `2px ${drawOn ? 'solid' : 'dashed'} var(--ink)`, borderRadius: 8, background: '#fff', touchAction: drawOn ? 'none' : 'pan-y', cursor: drawOn ? 'crosshair' : 'default', display: 'block', margin: '0 auto' }} />
  );

  const inner = (
    <div style={{ maxWidth: expanded ? '100%' : W, margin: '0 auto', width: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        {/* Master toggle: draw vs. scroll the page. */}
        <button type="button" className={`btn small ${drawOn ? 'green' : 'ghost'}`} onClick={() => setDrawOn(v => !v)} title={drawOn ? 'Drawing on — tap to scroll the page' : 'Scroll mode — tap to draw'}>
          {drawOn ? '✍️ Writing' : '🖐️ Scroll'}
        </button>
        {toolBtn('pen', '✏️ Pen')}{toolBtn('eraser', '🩹 Eraser')}{toolBtn('text', '🔤 Text')}
        <span style={{ display: 'flex', gap: 5 }}>{COLORS.map(swatch)}</span>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>Thick
          <input type="range" min={1} max={16} value={size} onChange={e => setSize(Number(e.target.value))} /></label>
        <button type="button" className="btn small ghost" onClick={() => setExpanded(v => !v)}>{expanded ? '✕ Close' : '⤢ Expand'}</button>
      </div>
      {tool === 'text' && (
        <div className="chat-input-row" style={{ maxWidth: 520, margin: '0 auto 6px' }}>
          <input type="text" value={textVal} placeholder="Type text, then tap the page to place it" onChange={e => setTextVal(e.target.value)} />
          <select value={font} onChange={e => setFont(e.target.value)}>{FONTS.map(([n, v]) => <option key={v} value={v}>{n}</option>)}</select>
          <input type="number" min={12} max={90} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: 60 }} />
        </div>
      )}

      {scroll
        ? <div style={{ maxHeight: winMax, overflowY: 'auto', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: 2 }}>{canvas}</div>
        : <div style={{ maxHeight: winMax, display: 'flex' }}>{canvas}</div>}

      <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginTop: 4 }}>
        {drawOn ? '✍️ Writing mode — it won’t scroll while you draw. Tap 🖐️ Scroll to move.' : '🖐️ Scroll mode — swipe to move. Tap ✏️ Pen (or ✍️ Writing) to draw.'}
      </div>

      {scroll ? (
        /* SCROLL: grow the surface downward instead of turning pages. */
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn small" onClick={addSpace}>＋ Add space ↓</button>
          <button className="btn small ghost" onClick={clearPage}>Clear</button>
        </div>
      ) : (
        /* PAGED: add a fresh page (a new "window") when you run out. */
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn small ghost" disabled={pageIdx === 0} onClick={() => goto(pageIdx - 1)}>← Prev page</button>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Page {pageIdx + 1} / {pageCount}</span>
          <button className="btn small ghost" disabled={pageIdx >= pageCount - 1} onClick={() => goto(pageIdx + 1)}>Next page →</button>
          <button className="btn small" onClick={addPage}>＋ New page</button>
          <button className="btn small ghost" onClick={clearPage}>Clear page</button>
        </div>
      )}
    </div>
  );

  // Expanded = a full-viewport overlay giving lots of room to draw/write/do math.
  if (expanded) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg,#f7f3e9)', padding: '14px 12px', overflow: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {inner}
      </div>
    );
  }
  return inner;
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
