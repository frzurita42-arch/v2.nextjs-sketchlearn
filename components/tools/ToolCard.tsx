'use client';
/* The standard tool card — the gallery's layout, reusable anywhere a tool needs
 * to be shown as a grid card or a horizontal row. The image and the title are
 * clickable (open the tool); owner/admin controls (edit title+desc, AI tap-mixer,
 * generate/regenerate the thumbnail, delete) are optional and only render when
 * their handlers are supplied. */
import { isRenderableImage } from '@/lib/img';

export interface ToolCardProps {
  tool: any;
  view: 'grid' | 'row';
  onOpen: (t: any) => void;
  favs?: Record<string, boolean>;
  // Owner/admin text controls (title + description):
  canEdit?: boolean;
  onEdit?: (t: any) => void;
  onRemix?: (t: any) => void;
  mixing?: boolean;
  // Owner/admin thumbnail controls:
  onGenThumb?: (t: any) => void;      // regenerate a random image
  onThumbPrompt?: (t: any) => void;   // regenerate from a typed prompt
  onUploadThumb?: (t: any, file: File) => void;   // upload a custom image
  thumbing?: boolean;
  // Footer actions:
  canRemove?: boolean;
  isExample?: boolean;
  onRemove?: (t: any) => void;
}

const kindOf = (t: any) => t.archetype === 'app' ? 'APP' : t.archetype === 'lesson' ? 'LESSON' : t.archetype === 'repo' ? 'REPO' : 'GEN';
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

export function ToolCard(p: ToolCardProps) {
  const { tool: t, view, onOpen, favs = {}, canEdit } = p;
  const fav = !!favs[t.slug];
  // Open a file picker for a custom thumbnail upload (no per-card ref needed).
  const pickFile = () => {
    if (!p.onUploadThumb) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) p.onUploadThumb!(t, f); };
    inp.click();
  };

  const editBtns = canEdit && (p.onEdit || p.onRemix) ? (
    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 5, verticalAlign: 'middle' }}>
      {p.onEdit && <button title="Edit title & description" style={iconBtn} onClick={stop(() => p.onEdit!(t))}>✎</button>}
      {p.onRemix && <button title="AI tap-mixer — reword title & description" style={iconBtn} disabled={!!p.mixing} onClick={stop(() => p.onRemix!(t))}>{p.mixing ? '…' : '🎨'}</button>}
    </span>
  ) : null;

  const overlayIcons = canEdit && (p.onThumbPrompt || p.onGenThumb || p.onUploadThumb) ? (
    <span style={{ position: 'absolute', top: 6, right: 8, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      {p.onThumbPrompt && <button title="Custom image — describe what to show" style={overlayIcon} disabled={!!p.thumbing} onClick={stop(() => p.onThumbPrompt!(t))}>✎</button>}
      {p.onGenThumb && <button title="Regenerate image with AI" style={overlayIcon} disabled={!!p.thumbing} onClick={stop(() => p.onGenThumb!(t))}>{p.thumbing ? '…' : '🎨'}</button>}
      {p.onUploadThumb && <button title="Upload a custom image" style={overlayIcon} disabled={!!p.thumbing} onClick={stop(pickFile)}>📎</button>}
    </span>
  ) : null;

  const thumbBox = (h: number) => (
    isRenderableImage(t.thumbnail)
      ? <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => onOpen(t)}>
          <img src={t.thumbnail} alt="" loading="lazy" style={{ width: '100%', height: h, objectFit: 'cover', display: 'block', borderBottom: '2px solid var(--ink)' }} />
          {overlayIcons}
        </div>
      : <div style={{ height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(0,0,0,0.04)', borderBottom: '2px dashed var(--ink)', textAlign: 'center', padding: 6, cursor: 'pointer' }} onClick={() => onOpen(t)}>
          <span style={{ fontSize: 12, opacity: 0.6 }}>🖼️ No photo available</span>
          {canEdit && (p.onGenThumb || p.onThumbPrompt || p.onUploadThumb) && (
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {p.onGenThumb && <button className="btn small ghost" disabled={!!p.thumbing} onClick={stop(() => p.onGenThumb!(t))}>{p.thumbing ? 'Generating…' : '🎨 Generate'}</button>}
              {p.onThumbPrompt && <button className="btn small ghost" disabled={!!p.thumbing} onClick={stop(() => p.onThumbPrompt!(t))}>✎ Custom</button>}
              {p.onUploadThumb && <button className="btn small ghost" disabled={!!p.thumbing} onClick={stop(pickFile)}>📎 Upload</button>}
            </span>
          )}
        </div>
  );

  const meta = <span style={{ fontSize: 11, opacity: 0.6 }}>@{t.owner} · {t.visibility}{t.aiGenerated ? ' · ✦AI' : ''}</span>;
  const actions = (
    <span style={{ display: 'flex', gap: 6, flex: '0 0 auto', flexWrap: 'wrap' }}>
      {p.canRemove && p.onRemove && <button className="btn small ghost" title={p.isExample ? 'Hide this example' : 'Delete'} onClick={() => p.onRemove!(t)}>{p.isExample ? '✕' : '🗑'}</button>}
      <button className="btn small green" onClick={() => onOpen(t)}>Open →</button>
    </span>
  );
  const titleClick = { cursor: 'pointer' } as const;

  if (view === 'row') {
    const desc = t.description || 'No description.';
    const long = desc.length > 110;
    const rowThumb = isRenderableImage(t.thumbnail)
      ? <img src={t.thumbnail} alt="" loading="lazy" onClick={() => onOpen(t)} style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--ink)', flex: '0 0 auto', cursor: 'pointer' }} />
      : <div title="No photo" onClick={() => (canEdit && p.onGenThumb ? p.onGenThumb(t) : onOpen(t))} style={{ width: 46, height: 46, borderRadius: 8, border: '2px dashed var(--ink)', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, opacity: 0.5, cursor: 'pointer' }}>{p.thumbing ? '…' : (canEdit && p.onGenThumb ? '🎨' : '🖼️')}</div>;
    return (
      <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, maxWidth: '100%' }}>
        {rowThumb}
        <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15, ...titleClick }} onClick={() => onOpen(t)}>{t.title}</strong>
            <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.55 }}>{kindOf(t)}</span>
            {fav && <span style={{ fontSize: 11 }}>★</span>}
            {editBtns}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {long ? desc.slice(0, 110).trimEnd() + '… ' : desc}
            {long && <button className="btn small ghost" style={{ padding: '0 4px', fontSize: 11 }} onClick={() => onOpen(t)}>Read more</button>}
          </div>
          {meta}
        </div>
        {actions}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {thumbBox(130)}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 16, ...titleClick }} onClick={() => onOpen(t)}>{t.title}{fav ? ' ★' : ''}{editBtns}</strong>
          <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6 }}>{kindOf(t)}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85, flex: 1 }}>{t.description || 'No description.'}{editBtns}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Array.isArray(t.tags) ? t.tags : []).map((tag: string) => <span key={tag} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1.5px solid var(--ink)' }}>#{tag}</span>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>{meta}{actions}</div>
      </div>
    </div>
  );
}

const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: 0, fontSize: 14, lineHeight: 1 } as const;
const overlayIcon = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 17, lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(255,255,255,0.95))' } as const;
