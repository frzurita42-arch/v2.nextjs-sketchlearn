'use client';
/* ProfileCard — a PERSON shown through the exact same shared <CardShell> the tool
 * galleries use, so people cards look identical to tool cards and respond to the
 * same card-size + image-size settings. It just adapts the slots to a profile:
 * the portrait fills the image spot (with a coloured emoji avatar as the fallback),
 * the role is the badge, interests become the tags, and the footer carries the
 * profile actions (WhatsApp / Edit) plus optional AI-portrait / upload controls. */
import { CardShell, overlayIcon, delIcon } from '@/components/ui/CardShell';
import { isRenderableImage } from '@/lib/img';

export interface ProfileCardProps {
  view: 'grid' | 'row';
  name: string;                 // username (fallback title + row byline)
  title?: string;               // display title
  subtitle?: string;            // one-line description
  image?: string;               // portrait URL
  emoji: string;                // deterministic avatar emoji (fallback)
  color: string;                // deterministic avatar colour (fallback)
  badge?: string;               // role label, upper-right
  meta?: React.ReactNode;       // footer-left meta line
  tags?: string[];              // interests
  imageMode?: number;           // 0 none · 1 small · 2 medium · 3 large · 4 cover 16:9 · 5 cover 9:16
  actions?: React.ReactNode;    // footer-right (WhatsApp, etc.)
  onOpen?: () => void;
  // Editable portrait controls (owner/admin):
  onEdit?: () => void;
  onPortrait?: () => void;      // 🎨 AI portrait
  onUpload?: (file: File) => void;
  portraitBusy?: boolean;
}

export function ProfileCard(p: ProfileCardProps) {
  const hasImg = isRenderableImage(p.image);
  const editable = !!(p.onPortrait || p.onUpload);

  const pickFile = () => {
    if (!p.onUpload) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) p.onUpload!(f); };
    inp.click();
  };

  const overlay = editable ? (
    <span style={{ position: 'absolute', top: 6, right: 8, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      {p.onPortrait && <button title="AI portrait — imagined from this profile" style={overlayIcon} disabled={!!p.portraitBusy} onClick={(e) => { e.stopPropagation(); p.onPortrait!(); }}>{p.portraitBusy ? '…' : '🎨'}</button>}
      {p.onUpload && <button title="Upload a photo" style={overlayIcon} disabled={!!p.portraitBusy} onClick={(e) => { e.stopPropagation(); pickFile(); }}>📎</button>}
    </span>
  ) : null;

  const placeholder = editable ? (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {p.onPortrait && <button className="btn small ghost" disabled={!!p.portraitBusy} onClick={(e) => { e.stopPropagation(); p.onPortrait!(); }}>{p.portraitBusy ? 'Imagining…' : '🎨 AI portrait'}</button>}
      {p.onUpload && <button className="btn small ghost" disabled={!!p.portraitBusy} onClick={(e) => { e.stopPropagation(); pickFile(); }}>📎 Upload</button>}
    </span>
  ) : null;

  // The coloured emoji avatar shown in the image spot when there is no portrait.
  const avatarNode = (
    <span style={{ width: p.imageMode === 4 || p.imageMode === 5 ? 96 : 64, height: p.imageMode === 4 || p.imageMode === 5 ? 96 : 64, borderRadius: '50%', background: p.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 34, border: '2px solid var(--ink)' }}>{p.emoji}</span>
  );

  // Same image-mode → CardShell mapping as ToolCard, so people tiles size uniformly.
  const im = p.imageMode;
  const imgProps: any =
    im === 0 ? { hideImage: true, gridHeight: 300 }
    : im === 1 ? { thumbHeight: 84, gridHeight: 320 }
    : im === 3 ? { thumbHeight: 160, gridHeight: 392 }
    : im === 4 ? { imageAspect: '16 / 9' }
    : im === 5 ? { imageAspect: '9 / 16' }
    : { thumbHeight: 110, gridHeight: 340 };   // 2 = medium (default)

  return (
    <CardShell
      view={p.view}
      title={p.title || p.name}
      subtitle={p.subtitle || ''}
      badge={p.badge}
      thumbnail={hasImg ? p.image : null}
      iconNode={hasImg ? undefined : avatarNode}
      {...(p.view === 'grid' ? imgProps : {})}
      onOpen={p.onOpen}
      overlay={overlay}
      placeholder={placeholder}
      rowThumbFallback={<span aria-hidden>{p.emoji}</span>}
      tags={p.view === 'grid' && p.tags ? p.tags : undefined}
      meta={p.meta}
      del={p.onEdit ? <button style={delIcon} title="Edit profile" onClick={(e) => { e.stopPropagation(); p.onEdit!(); }}>✎</button> : null}
      actions={p.actions}
    />
  );
}
