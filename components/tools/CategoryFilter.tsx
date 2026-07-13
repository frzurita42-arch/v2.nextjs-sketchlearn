'use client';
/* A row of filter chips for the tool categories. Shows a count per category and
 * hides categories that have zero items in the current list. */
import { TOOL_CATEGORIES } from '@/lib/tool-category';

// The row of category filter chips. Defaults to the platform TOOL_CATEGORIES
// (home gallery) but any list can pass its own `categories` (e.g. a lesson feed's
// subject categories) to get the identical chip-row filter.
export function CategoryFilter({ value, onChange, counts, categories }: {
  value: string; onChange: (k: string) => void; counts: Record<string, number>;
  categories?: { key: string; label: string }[];
}) {
  const cats = categories || TOOL_CATEGORIES;
  const chip = (key: string, label: string) => {
    const n = counts[key] || 0;
    if (key !== 'all' && !n) return null;        // hide empty categories
    const active = value === key;
    return (
      <button key={key} className={`btn small ${active ? 'blue' : 'ghost'}`} onClick={() => onChange(key)}>
        {label}{key === 'all' ? '' : ` (${n})`}
      </button>
    );
  };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', margin: '0 auto 16px', maxWidth: 820 }}>
      {chip('all', `All (${counts.all || 0})`)}
      {cats.map(c => chip(c.key, c.label))}
    </div>
  );
}
