'use client';
/* The skeletal design of a gallery's EMPTY state — what a user sees on the Slides /
 * Repos pages when the default "Favorites" filter has nothing to show: a looping
 * ✏️ "make/play one" card, a single recommended card, and the pager. It's one shared
 * component so a universal change (card size, image mode, layout) is visible here,
 * on the Sandbox / Empty pages, and in the Settings preview — all at once. */
import { ToolCard } from '@/components/tools/ToolCard';
import { galleryLayout } from '@/lib/card-size';
import { GalleryPager } from '@/components/ui/GalleryChrome';

// A stand-in "recommended lesson" for previews that have no real data.
const SAMPLE = {
  slug: '__preview__', title: 'Recommended lesson', archetype: 'lesson', owner: 'sketchlearn', visibility: 'public',
  description: 'A lesson we think you’ll like — open it to play.',
  tags: ['example', 'recommended'], aiGenerated: true, thumbnail: null, createdAt: new Date().toISOString(),
};
const noop = () => { /* preview only */ };

export function GallerySkeleton({ cardSize, imgMode, recommended, onBuild, onOpen, editable = false, pager = true }: {
  cardSize: number; imgMode: number; recommended?: any;
  onBuild?: () => void; onOpen?: (t: any) => void; editable?: boolean; pager?: boolean;
}) {
  const layout = galleryLayout(cardSize);
  const rec = recommended || SAMPLE;
  const editProps = editable
    ? { canEdit: true, onEdit: noop, onGenThumb: noop, onThumbPrompt: noop, onUploadThumb: noop, onDice: noop, thumbing: false }
    : {};
  return (
    <div>
      <div style={{ ...layout.container, alignItems: 'stretch' }}>
        {/* The looping pencil "make/play one" card — stretches to the card height. */}
        <div className="card" style={{ height: '100%', minHeight: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, padding: 18 }}>
          <span className="sl-pencil" style={{ fontSize: 42, color: 'var(--ink)' }} aria-hidden>
            <span className="sl-pencil__line" />
            <span className="sl-pencil__tip">✏️</span>
          </span>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4 }}>Make a repository or play a lesson to get started.</p>
          <button className="btn green" onClick={onBuild || noop}>＋ Build one</button>
        </div>
        {/* A single recommended card (Open hidden — the picture/title still open it). */}
        <ToolCard tool={rec} view={layout.view} hideOpen imageMode={imgMode} onOpen={onOpen || noop} {...editProps} />
      </div>
      {pager && <GalleryPager />}
    </div>
  );
}
