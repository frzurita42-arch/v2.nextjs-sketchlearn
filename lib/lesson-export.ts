/* Build a fully-offline ZIP of a finished lesson: an index.html "class history"
 * (cover → every slide with its support material and the student's answers →
 * finish page) plus an images/ folder with every picture used (AI illustrations,
 * annotation pages, uploaded work). Runs entirely in the browser — the deck and
 * answers are already in memory, so no server round-trip or AI call is needed. */
import JSZip from 'jszip';

type QAny = any;
type SlideAny = { title?: string; content?: string; support?: any; _supports?: any[]; questions?: QAny[] };
type ResAny = { answers?: Record<number, any> };

export interface LessonExportInput {
  title: string;
  subtitle?: string;
  slides: SlideAny[];
  results: Record<number, ResAny>;
  score: number;
  answered: number;
  pct: number;
  timeStr: string;
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
const paras = (t: string) => String(t || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

export async function buildLessonZip(input: LessonExportInput): Promise<Blob> {
  const zip = new JSZip();
  const imgs = zip.folder('images')!;
  let n = 0;
  const seen = new Map<string, string>();

  // Register an image source: data: URLs become files; http(s) URLs are fetched
  // when possible (so the copy is truly offline), else left as a live URL.
  const reg = async (src?: string): Promise<string> => {
    if (!src) return '';
    if (seen.has(src)) return seen.get(src)!;
    let out = src;
    try {
      const dm = src.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
      if (dm) {
        const ext = dm[1] === 'jpeg' ? 'jpg' : (dm[1].replace(/[^a-z0-9]/gi, '') || 'png');
        const name = `img-${++n}.${ext}`;
        imgs.file(name, dm[2], { base64: true });
        out = `images/${name}`;
      } else if (/^https?:\/\//i.test(src)) {
        const r = await fetch(src);
        if (r.ok) {
          const b = await r.blob();
          const ext = (b.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
          const name = `img-${++n}.${ext}`;
          imgs.file(name, await b.arrayBuffer());
          out = `images/${name}`;
        }
      }
    } catch { out = src; }
    seen.set(src, out);
    return out;
  };

  const supHtml = async (s: any): Promise<string> => {
    if (!s) return '';
    if (s.type === 'image' && s.url) { const p = await reg(s.url); return `<img src="${esc(p)}" alt="${esc(s.caption || '')}">${s.caption ? `<div class="cap">${esc(s.caption)}</div>` : ''}`; }
    if (s.type === 'code') return `<pre class="code">${esc(s.code)}</pre>`;
    if (s.type === 'table') {
      const h = (s.headers || []).map((x: any) => `<th>${esc(x)}</th>`).join('');
      const rows = (s.rows || []).map((r: any) => `<tr>${(Array.isArray(r) ? r : []).map((c: any) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
      return `<table><thead><tr>${h}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (s.type === 'formula') return `<div class="formula"><code>${esc(s.latex)}</code>${s.caption ? `<div class="cap">${esc(s.caption)}</div>` : ''}</div>`;
    if (s.type === 'wolfram') {
      const steps = (Array.isArray(s.steps) ? s.steps : []).map((p: any) => `<div class="step">${p.title ? `<b>${esc(p.title)}</b>` : ''}<pre>${esc(p.text)}</pre></div>`).join('');
      return `<div class="formula"><div class="tag">⚡ WOLFRAM ALPHA</div>${s.latex ? `<div><code>${esc(s.latex)}</code></div>` : ''}${s.result ? `<div>= <b>${esc(s.result)}</b></div>` : ''}${steps}</div>`;
    }
    return '';
  };

  const qHtml = async (q: any, d: any): Promise<string> => {
    const parts: string[] = [];
    parts.push(`<p class="prompt">${esc(q?.prompt || d?.prompt || '')}</p>`);
    if (d) {
      parts.push(`<p class="${d.correct ? 'ok' : 'no'}">${d.correct ? '✓ Correct' : '✗ Reviewed'}${d.feedback ? ` — ${esc(d.feedback)}` : ''}</p>`);
      if (d.your) parts.push(`<p>Your answer: <b>${esc(d.your)}</b></p>`);
      if (d.code) parts.push(`<pre class="code">${esc(d.code)}</pre>`);
      if (d.fix) parts.push(`<pre class="code">Model answer:\n${esc(d.fix)}</pre>`);
      if (d.image) { const p = await reg(d.image); parts.push(`<img src="${esc(p)}" alt="your work">`); }
      if (Array.isArray(d.pages)) for (const pg of d.pages) { const p = await reg(pg); parts.push(`<img src="${esc(p)}" alt="page">`); }
      if (!d.correct && (q?.answer || d.answer)) parts.push(`<p class="exp">Expected: <b>${esc(q?.answer || d.answer)}</b></p>`);
    } else if (Array.isArray(q?.options) && q.options.length) {
      parts.push('<ul class="opts">' + q.options.map((o: any) => {
        const v = String(typeof o === 'object' ? (o.text ?? o.label ?? o.value ?? '') : o);
        const right = v === String(q.answer ?? '') || (o && typeof o === 'object' && o.correct === true);
        return `<li class="${right ? 'ok' : ''}">${right ? '✓ ' : ''}${esc(v)}</li>`;
      }).join('') + '</ul>');
    } else if (q?.answer) {
      parts.push(`<p>Answer: <b>${esc(q.answer)}</b></p>`);
    }
    if (q?.explanation) parts.push(`<p class="exp">${esc(q.explanation)}</p>`);
    return `<div class="q">${parts.join('')}</div>`;
  };

  const sections: string[] = [];
  for (let i = 0; i < input.slides.length; i++) {
    const s = input.slides[i];
    if (!s) continue;
    const sup = Array.isArray(s._supports) ? s._supports : (s.support ? [s.support] : []);
    const supH = (await Promise.all(sup.map(supHtml))).join('');
    const res = input.results[i];
    const qs = Array.isArray(s.questions) ? s.questions : [];
    const qH = (await Promise.all(qs.map((q: any, qi: number) => qHtml(q, res?.answers?.[qi])))).join('');
    sections.push(`<section class="slide"><div class="num">Slide ${i + 1}</div><h2>${esc(s.title || '')}</h2>${s.content ? paras(s.content) : ''}${supH}${qH}</section>`);
  }

  const css = `
    body{font-family:Georgia,'Times New Roman',serif;max-width:760px;margin:0 auto;padding:24px 18px;color:#2d2a26;line-height:1.55;background:#f7f3e9}
    .cover{text-align:center;border:2px solid #2d2a26;border-radius:14px;padding:24px;margin-bottom:22px;background:#fff}
    .cover h1{margin:.2em 0}
    .stats{display:flex;gap:24px;justify-content:center;margin-top:10px}
    .stats b{font-size:26px}
    .slide{border:2px solid #2d2a26;border-radius:12px;padding:16px 18px;margin-bottom:16px;background:#fff}
    .num{font-size:12px;font-weight:700;opacity:.5}
    h2{margin-top:2px}
    img{max-width:100%;border:2px solid #2d2a26;border-radius:8px;display:block;margin:8px auto}
    .cap{font-size:12px;opacity:.7;text-align:center}
    pre.code{background:#2d2a26;color:#f7f3e9;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px}
    table{width:100%;border-collapse:collapse;margin:8px 0}
    th,td{border:1px solid #999;padding:6px;text-align:left}
    .formula{background:rgba(0,0,0,.04);border:1.5px solid #2d2a26;border-radius:8px;padding:10px 12px;margin:8px 0}
    .formula code{font-size:15px}
    .tag{font-size:11px;font-weight:700;opacity:.6}
    .q{border-top:2px dashed #2d2a26;padding-top:12px;margin-top:12px}
    .prompt{font-weight:700}
    .ok{color:#2f7d32}.no{color:#c0392b}
    ul.opts{list-style:none;padding:0}ul.opts li{border:1.5px solid #2d2a26;border-radius:6px;padding:4px 8px;margin:3px 0}
    ul.opts li.ok{background:rgba(127,176,105,.25)}
    .exp{font-size:13px;opacity:.85}
    footer{text-align:center;opacity:.6;font-size:12px;margin-top:20px}`;

  const cover = `<div class="cover"><h1>${esc(input.title)}</h1>${input.subtitle ? `<p>${esc(input.subtitle)}</p>` : ''}<div class="stats"><div><b>${input.score}/${input.answered}</b><div>score (${input.pct}%)</div></div><div><b>⏱ ${esc(input.timeStr)}</b><div>time</div></div></div><p style="opacity:.6;font-size:12px">Saved ${esc(new Date().toLocaleString())}</p></div>`;
  const finish = `<section class="slide" style="text-align:center"><h2>🏁 Finish</h2><p>You scored <b>${input.score}/${input.answered}</b> (${input.pct}%) in ${esc(input.timeStr)}.</p></section>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(input.title)}</title><style>${css}</style></head><body>${cover}${sections.join('')}${finish}<footer>Offline class history — generated by SketchLearn</footer></body></html>`;

  zip.file('index.html', html);
  return zip.generateAsync({ type: 'blob' });
}

// ---- Repository export (nested cards -> offline HTML + images) -------------
export interface RepoExportInput {
  title: string;
  subtitle?: string;
  cards: any[];
  display?: 'bars' | 'grid';
}

export async function buildRepoZip(input: RepoExportInput): Promise<Blob> {
  const zip = new JSZip();
  const imgs = zip.folder('images')!;
  let n = 0;
  const seen = new Map<string, string>();
  const reg = async (src?: string): Promise<string> => {
    if (!src) return '';
    if (seen.has(src)) return seen.get(src)!;
    let out = src;
    try {
      const dm = src.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
      if (dm) { const ext = dm[1] === 'jpeg' ? 'jpg' : (dm[1].replace(/[^a-z0-9]/gi, '') || 'png'); const name = `img-${++n}.${ext}`; imgs.file(name, dm[2], { base64: true }); out = `images/${name}`; }
      else if (/^https?:\/\//i.test(src)) { const r = await fetch(src); if (r.ok) { const b = await r.blob(); const ext = (b.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png'; const name = `img-${++n}.${ext}`; imgs.file(name, await b.arrayBuffer()); out = `images/${name}`; } }
    } catch { out = src; }
    seen.set(src, out);
    return out;
  };

  const cardHtml = async (c: any, depth: number): Promise<string> => {
    if (!c) return '';
    const parts: string[] = [];
    if (c.image) { const p = await reg(c.image); parts.push(`<img class="icon" src="${esc(p)}" alt="">`); }
    if (c.title) parts.push(depth === 0 ? `<h2>${esc(c.title)}</h2>` : `<h3>${esc(c.title)}</h3>`);
    if (c.subtitle) parts.push(`<div class="sub">${esc(c.subtitle)}</div>`);
    if (c.text) parts.push(paras(c.text));
    if (Array.isArray(c.links) && c.links.length) parts.push('<div class="links">' + c.links.map((l: any) => `<a href="${esc(l.url)}">${esc(l.label || 'Open')}</a>`).join('') + '</div>');
    if (c.completable) parts.push('<div class="badge">✓ completion tracked</div>');
    const kids = Array.isArray(c.children) ? c.children : [];
    if (kids.length) {
      const inner = (await Promise.all(kids.map((k: any) => cardHtml(k, depth + 1)))).join('');
      parts.push(`<div class="kids ${(c.layout || input.display || 'bars') === 'grid' ? 'grid' : 'bars'}">${inner}</div>`);
    }
    const tag = c.kind === 'section' ? 'section' : 'div';
    return `<${tag} class="card ${c.kind === 'section' ? 'sec' : ''}">${parts.join('')}</${tag}>`;
  };

  const body = (await Promise.all((input.cards || []).map((c: any) => cardHtml(c, 0)))).join('');
  const css = `
    body{font-family:Georgia,'Times New Roman',serif;max-width:820px;margin:0 auto;padding:24px 18px;color:#2d2a26;line-height:1.5;background:#f7f3e9}
    h1{text-align:center}
    .card{border:2px solid #2d2a26;border-radius:12px;padding:14px 16px;margin:10px 0;background:#fff}
    .card.sec{border-style:dashed;background:transparent}
    h2,h3{margin:.2em 0}
    .sub{opacity:.7;font-size:14px}
    img.icon{width:46px;height:46px;object-fit:cover;border:2px solid #2d2a26;border-radius:8px;float:left;margin:0 10px 6px 0}
    .links{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    .links a{border:1.5px solid #2d2a26;border-radius:8px;padding:4px 10px;text-decoration:none;color:#2d2a26;background:rgba(92,128,188,.15)}
    .badge{display:inline-block;font-size:12px;opacity:.7;margin-top:6px}
    .kids{margin-top:10px}
    .kids.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
    .kids.bars{display:grid;gap:10px}
    footer{text-align:center;opacity:.6;font-size:12px;margin-top:20px}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(input.title)}</title><style>${css}</style></head><body><h1>${esc(input.title)}</h1>${input.subtitle ? `<p style="text-align:center;opacity:.7">${esc(input.subtitle)}</p>` : ''}${body}<footer>Offline copy — generated by SketchLearn · ${esc(new Date().toLocaleString())}</footer></body></html>`;
  zip.file('index.html', html);
  return zip.generateAsync({ type: 'blob' });
}
