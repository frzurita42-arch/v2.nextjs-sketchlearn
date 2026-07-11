/* Classify a published tool into a browseable category, so the gallery and feed
 * can be filtered by "kind of tool" (presentation, gallery, code/math boxes,
 * annotation, mixes, …). One classifier, shared by client views. It accepts
 * either a full tool ({ archetype, definition, tags }) or the lighter feed
 * payload ({ archetype, lesson:{activityTypes,totalSlides}, appDisplay, tags }). */

export type CategoryKey =
  | 'presentation' | 'single' | 'annotation' | 'code' | 'math-mix'
  | 'writing' | 'conversation' | 'journal' | 'gallery' | 'storage' | 'generator' | 'other';

export const TOOL_CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'presentation', label: '📊 Presentations' },
  { key: 'single', label: '🎯 Single activities' },
  { key: 'annotation', label: '📝 Annotation' },
  { key: 'code', label: '⌨️ Code / math boxes' },
  { key: 'math-mix', label: '🧮 Annotation + code' },
  { key: 'writing', label: '✍️ Writing / characters' },
  { key: 'conversation', label: '💬 AI canvas chats' },
  { key: 'journal', label: '📓 Journals' },
  { key: 'gallery', label: '🖼️ Galleries' },
  { key: 'storage', label: '🗂️ Storage' },
  { key: 'generator', label: '✨ Generators' },
];

export function categoryLabel(k: string): string {
  return TOOL_CATEGORIES.find(c => c.key === k)?.label || 'Other';
}

export function toolCategory(t: any): CategoryKey {
  if (!t) return 'other';
  const def = t.definition || t;                 // full tool OR a bare definition
  const archetype = t.archetype || def.archetype;
  if (archetype === 'lesson') {
    const lesson = def.lesson || t.lesson || {};
    if (lesson.mode === 'journal') return 'journal';
    if (lesson.mode === 'conversation') return 'conversation';
    const acts: string[] = Array.isArray(lesson.activityTypes) ? lesson.activityTypes : [];
    const hasAnno = acts.includes('annotation');
    const hasCode = acts.includes('code');
    const hasWriting = acts.includes('writing');
    if (hasAnno && hasCode) return 'math-mix';
    if (hasAnno) return 'annotation';
    if (hasCode) return 'code';
    if (hasWriting) return 'writing';
    const slides = Number(lesson.totalSlides || 0);
    if (slides === 1) return 'single';
    return 'presentation';
  }
  if (archetype === 'generator') return 'generator';
  if (archetype === 'app') {
    const display = (def.app && def.app.display) || t.appDisplay;
    return display === 'list' || display === 'table' ? 'storage' : 'gallery';
  }
  return 'other';
}
