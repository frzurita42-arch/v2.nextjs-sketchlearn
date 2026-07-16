// Lesson "themes" — a content lens the learner can pick to orient a lesson's
// examples, scenarios and vocabulary (e.g. teach the SAME French grammar, but
// framed around Vacations, or Sports, or Stoic philosophy). Chosen on the create
// form and/or overridden per slide in the player. "Any" lets the AI decide.

export const LESSON_THEMES = [
  'Any',
  'Vacations',
  'Family & friends',
  'Sports',
  'Entertainment',
  'Small talk & conversation',
  'Food & dining',
  'Work & school',
  'STEM',
  'Library & books',
  'Stoic philosophy',
  'Motivational',
  'Health & wellness',
  'Climate awareness',
] as const;

const THEME_HINT: Record<string, string> = {
  Vacations: 'travel, holidays, destinations, hotels, sightseeing and trips',
  'Family & friends': 'family members, friendships, home life and relationships',
  Sports: 'sports, teams, exercise, matches, games and competition',
  Entertainment: 'movies, music, TV shows, celebrities, hobbies and going out',
  'Small talk & conversation': 'everyday small talk, greetings, the weather and casual social conversation',
  'Food & dining': 'food, cooking, restaurants, meals, ordering and cuisine',
  'Work & school': 'work, jobs, study, school, careers and daily routines',
  STEM: 'science, technology, engineering and mathematics',
  'Library & books': 'books, reading, libraries, stories and literature',
  'Stoic philosophy': 'Stoic philosophy — virtue, self-control, resilience and ideas from Marcus Aurelius, Seneca and Epictetus',
  Motivational: 'motivation, goals, perseverance, discipline, a growth mindset and encouragement',
  'Health & wellness': 'health, fitness, nutrition, sleep, mental wellbeing and self-care',
  'Climate awareness': 'climate change, sustainability, nature, energy and protecting the environment',
};

// A directive woven into the slide-generation prompt to steer the CONTENT (not
// the art style) toward a theme. Empty when no theme (or "Any") is chosen.
export function themeDirective(theme?: string): string {
  const t = String(theme || '').trim();
  if (!t || t === 'Any') return '';
  const hint = THEME_HINT[t] || t;
  return `THEME: orient this slide — its examples, scenarios, people, vocabulary and situations — around the theme of ${hint}. Keep the underlying subject and skill exactly the same and at the same level, but frame everything through this theme.`;
}
