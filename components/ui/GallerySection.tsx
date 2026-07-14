'use client';
/* GallerySection — the ONE reusable "titled, banner'd, filterable gallery" block.
 * It stitches together the three shared pieces so any feature gets the identical
 * layout with one component:
 *   • an editable section title (✎ / 🎨 / 🔄 / 👁, admin-persisted via useShelfTitle)
 *   • a how-to banner plank (admin-editable via a site-settings key)
 *   • the standard Collection (search · favorites · liked-by-admin/OP · sort ·
 *     grid/rows toggle · pagination · cards)
 * Just pass a titleKey + bannerKey and the usual Collection data props. Reuse this
 * whenever a new feature needs a titled, filterable card gallery. */
import { InstructionPlank } from '@/components/activities/InstructionPlank';
import { useShelfTitle } from '@/components/tools/useShelfTitle';
import { Collection, type CollectionProps } from '@/components/ui/Collection';

type GallerySectionProps<T> = {
  titleKey: string;            // site-settings key for the editable title
  titleFallback: string;       // default title (e.g. "📖 History")
  bannerKey?: string;          // site-settings key for the editable how-to banner
  bannerDefault?: string;      // default banner text
} & Omit<CollectionProps<T>, 'title' | 'canEditTitle' | 'onRenameTitle' | 'onRemixTitle' | 'remixingTitle' | 'banner'>;

export function GallerySection<T>(props: GallerySectionProps<T>) {
  const { titleKey, titleFallback, bannerKey, bannerDefault, ...rest } = props;
  const hdr = useShelfTitle(titleKey, titleFallback);   // { title, canEditTitle, onRenameTitle, onRemixTitle, remixingTitle }
  const banner = bannerKey ? <InstructionPlank settingKey={bannerKey} defaultText={bannerDefault} /> : undefined;
  return <Collection<T> {...(rest as CollectionProps<T>)} {...hdr} banner={banner} />;
}
