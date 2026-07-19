'use client';
/* The generic CARD reference — a BLANK version of the site's standard paper card
 * (no title, no description, no image content), rendered through the same shared
 * <CardShell> every gallery card uses. It reflects the current card size + image
 * mode, so it's the platform-wide template you tweak to change every card at once
 * (e.g. later, to place a button across all cards). */
import { CardShell } from '@/components/ui/CardShell';
import { galleryLayout } from '@/lib/card-size';

// Same image-mode → CardShell mapping as ToolCard, so the blank card matches real ones.
const imgProps = (im: number): any =>
  im === 0 ? { hideImage: true, gridHeight: 300 }
  : im === 1 ? { thumbHeight: 84, gridHeight: 320 }
  : im === 3 ? { thumbHeight: 160, gridHeight: 392 }
  : im === 4 ? { imageAspect: '16 / 9' }
  : im === 5 ? { imageAspect: '9 / 16' }
  : { thumbHeight: 110, gridHeight: 340 };

export function CardReference({ cardSize = 2, imgMode = 2 }: { cardSize?: number; imgMode?: number }) {
  const l = galleryLayout(cardSize);
  return (
    <div style={{ ...l.container, alignItems: 'stretch' }}>
      {/* A blank card — no text, no image content — just the card shape. */}
      <CardShell view={l.view} title="" {...(l.view === 'grid' ? imgProps(imgMode) : {})} />
    </div>
  );
}
