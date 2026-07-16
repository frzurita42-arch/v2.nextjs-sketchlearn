'use client';
/* The standard tool card — the gallery's layout, reusable anywhere a tool needs
 * to be shown as a grid card or a horizontal row. It renders through the shared
 * CardShell so its container is identical to the lesson activities feed cards;
 * change CardShell once and every list updates. The image and the title are
 * clickable (open the tool); owner/admin controls (edit title+desc, AI tap-mixer,
 * generate/regenerate the thumbnail, delete) are optional and only render when
 * their handlers are supplied. Delete is a small plain icon, not a boxed button. */
import { useState } from 'react';
import { CardShell, iconBtn, overlayIcon, delIcon } from '@/components/ui/CardShell';
import { randomEmoji } from '@/lib/emoji-thumb';
import { isRenderableImage } from '@/lib/img';

export interface ToolCardProps {
  tool: any;
  view: 'grid' | 'row';
  onOpen: (t: any) => void;
  favs?: Record<string, boolean>;
  onToggleFav?: (t: any) => void;     // ★/☆ favorite toggle (everyone, not just owner)
  // Owner/admin text controls (title + description):
  canEdit?: boolean;
  onEdit?: (t: any) => void;
  onRemix?: (t: any) => void;
  mixing?: boolean;
  // Owner/admin thumbnail controls:
  onGenThumb?: (t: any) => void;      // regenerate a random image
  onThumbPrompt?: (t: any) => void;   // regenerate from a typed prompt
  onUploadThumb?: (t: any, file: File) => void;   // upload a custom image
  onDice?: (t: any) => void;          // 🎲 swap to a new random emoji
  thumbing?: boolean;
  // Footer actions:
  canRemove?: boolean;
  isExample?: boolean;
  onRemove?: (t: any) => void;
  hideOpen?: boolean;   // omit the "Open →" button (image + title still open the tool)
  onReplay?: (t: any) => void;    // ♻️ new generation
  onHistory?: (t: any) => void;   // 📖 OP history track (saved results)
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

  const overlay = canEdit && (p.onThumbPrompt || p.onGenThumb || p.onUploadThumb || p.onDice) ? (
    <span style={{ position: 'absolute', top: 6, right: 8, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      {p.onDice && <button title="Random emoji" style={overlayIcon} disabled={!!p.thumbing} onClick={stop(() => p.onDice!(t))}>🎲</button>}
      {p.onThumbPrompt && <button title="Custom image — describe what to show" style={overlayIcon} disabled={!!p.thumbing} onClick={stop(() => p.onThumbPrompt!(t))}>✎</button>}
      {p.onGenThumb && <button title="Regenerate image with AI" style={overlayIcon} disabled={!!p.thumbing} onClick={stop(() => p.onGenThumb!(t))}>{p.thumbing ? '…' : '🎨'}</button>}
      {p.onUploadThumb && <button title="Upload a custom image" style={overlayIcon} disabled={!!p.thumbing} onClick={stop(pickFile)}>📎</button>}
    </span>
  ) : null;

  const placeholder = canEdit && (p.onGenThumb || p.onThumbPrompt || p.onUploadThumb || p.onDice) ? (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {p.onDice && <button className="btn small ghost" disabled={!!p.thumbing} onClick={stop(() => p.onDice!(t))}>🎲 Emoji</button>}
      {p.onGenThumb && <button className="btn small ghost" disabled={!!p.thumbing} onClick={stop(() => p.onGenThumb!(t))}>{p.thumbing ? 'Generating…' : '🎨 Generate'}</button>}
      {p.onThumbPrompt && <button className="btn small ghost" disabled={!!p.thumbing} onClick={stop(() => p.onThumbPrompt!(t))}>✎ Custom</button>}
      {p.onUploadThumb && <button className="btn small ghost" disabled={!!p.thumbing} onClick={stop(pickFile)}>📎 Upload</button>}
    </span>
  ) : null;

  // Rows are compact — cap a long description so the row stays one/two lines.
  const rawDesc = t.description || 'No description.';
  const subtitle = view === 'row' && rawDesc.length > 120 ? rawDesc.slice(0, 120).trimEnd() + '…' : rawDesc;

  const del = p.canRemove && p.onRemove
    ? <button style={delIcon} title={p.isExample ? 'Hide this example' : 'Delete'} onClick={() => p.onRemove!(t)}>🗑</button>
    : null;
  const replay = p.onReplay ? <button style={delIcon} title="New generation" onClick={() => p.onReplay!(t)}>♻️</button> : null;
  const history = p.onHistory ? <button style={delIcon} title="Moderator history — the first lesson made with this tool" onClick={() => p.onHistory!(t)}>📖</button> : null;

  // An "emoji:" thumbnail renders as an emoji in the image spot instead of a photo
  // (the default for fresh repos/presentations, swappable with 🎲 die / 📎 upload).
  // If a card has NO real image and NO stored emoji (older tools, seeded examples,
  // any create path that didn't stamp one), fall back to a topic-derived emoji at
  // render time so a card is NEVER blank — the user shouldn't have to press a
  // button to get an image when there isn't one.
  // Until a REAL image (upload / AI) is set, show a random on-topic emoji, picked
  // ONCE per mount so it varies each page load (three French tools won't all show
  // the same face) but stays stable while you browse. A stored "emoji:" thumbnail
  // (creation default / 🎲) is intentionally NOT treated as a set image, so the
  // emoji keeps shuffling until a picture is attached.
  const [randEmoji] = useState(() => randomEmoji());
  const emoji = isRenderableImage(t.thumbnail) ? '' : randEmoji;
  return (
    <CardShell
      view={view}
      title={t.title}
      subtitle={subtitle}
      badge={kindOf(t)}
      fav={fav}
      thumbnail={emoji ? null : t.thumbnail}
      iconNode={emoji ? <span aria-hidden>{emoji}</span> : undefined}
      gridHeight={view === 'grid' ? 340 : undefined}   // uniform fixed-height tiles
      onOpen={() => onOpen(t)}
      overlay={overlay}
      placeholder={placeholder}
      rowThumbFallback={canEdit && p.onGenThumb ? (p.thumbing ? '…' : '🎨') : '🖼️'}
      editBtns={editBtns}
      tags={view === 'grid' && Array.isArray(t.tags) ? t.tags : undefined}
      meta={(() => {
        let when = '';
        if (t.createdAt) { const d = new Date(t.createdAt); if (!isNaN(d.getTime())) try { when = d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); } catch { when = d.toLocaleString(); } }
        // Two lines (author+date / visibility+AI) so this stays narrow and the
        // action buttons keep their place on the row instead of wrapping below
        // and making the card taller.
        return (
          <span style={{ fontSize: 11, opacity: 0.6, display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}>
            <span>@{t.owner}{when ? ` · ${when}` : ''}</span>
            <span>{t.visibility}{t.aiGenerated ? ' · ✦AI' : ''}</span>
          </span>
        );
      })()}
      del={<>{history}{replay}{del}</>}
      actions={<>
        {p.onToggleFav && <button style={{ ...iconBtn, fontSize: 17, color: fav ? '#f5b301' : undefined, opacity: fav ? 1 : 0.55 }}
          title={fav ? 'Unfavorite' : 'Favorite'} aria-pressed={fav} onClick={stop(() => p.onToggleFav!(t))}>{fav ? '★' : '☆'}</button>}
        {!p.hideOpen && <button className="btn small green" onClick={() => onOpen(t)}>Open →</button>}
      </>}
    />
  );
}
