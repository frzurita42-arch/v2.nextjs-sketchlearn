'use client';
/* The generic CARD reference — the site's standard paper "sketchart" card. It is a
 * display-only sample so the platform (and the Settings page) has a named reference
 * for what a card looks like. There is NO configuration and no action here. */
import { ToolCard } from '@/components/tools/ToolCard';

const SAMPLE = {
  slug: '__card_reference__', title: 'A card', archetype: 'lesson', owner: 'sketchlearn', visibility: 'public',
  description: 'The site’s standard paper card — the same one used across every gallery.',
  tags: ['card', 'reference'], aiGenerated: false, thumbnail: null, createdAt: new Date().toISOString(),
};
const noop = () => { /* reference only — no action */ };

export function CardReference() {
  return (
    <div style={{ maxWidth: 300 }}>
      <ToolCard tool={SAMPLE} view="grid" hideOpen imageMode={2} onOpen={noop} />
    </div>
  );
}
