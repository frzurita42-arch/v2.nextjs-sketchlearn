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
  'Biology',
  'Healthcare',
  'Physics',
  'Cybersecurity',
  'Chemistry',
  'Finance',
  'Economy',
  'Psychology',
  'History',
  'Anthropology',
  'Philosophy',
  'Negotiation',
  'Fashion',
  'Pop culture',
  'Folk tales',
  'Science fiction',
  'Literature',
  'Bible study',
  'Emerging technologies',
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
  Biology: 'biology — living things, the body, cells, plants, animals and ecosystems',
  Healthcare: 'healthcare — going to the doctor, symptoms, medicine, hospitals and staying healthy',
  Physics: 'physics — everyday forces, motion, light, heat, electricity and how things work',
  Cybersecurity: 'cybersecurity and computers — passwords, the internet, scams, safety online and fixing simple tech problems',
  Chemistry: 'chemistry — materials, mixing things, cooking reactions, water, air and everyday substances',
  Finance: 'personal finance — money, saving, spending, budgets, banks and paying for things',
  Economy: 'the economy — buying and selling, prices, jobs, markets and trade',
  Psychology: 'psychology — feelings, moods, memory, habits and why people act the way they do',
  History: 'history — the past, important events, how people used to live, and famous moments',
  Anthropology: 'anthropology and culture — traditions, customs, festivals and how different people live',
  Philosophy: 'philosophy — big questions about life, right and wrong, happiness and how to think',
  Negotiation: 'negotiation — asking, offering, agreeing, disagreeing politely and making a deal',
  Fashion: 'fashion — clothes, style, colours, shopping for outfits and what people wear',
  'Pop culture': 'pop culture — famous singers, actors, movies, trends, memes and social media',
  'Folk tales': 'folk tales and fables — traditional stories, legends, morals and classic characters',
  'Science fiction': 'science fiction — robots, space travel, aliens, the future and imaginative technology',
  Literature: 'literature — stories, poems, authors, characters and famous books',
  'Bible study': 'Bible study — well-known Bible stories, parables, characters and their lessons, told respectfully',
  'Emerging technologies': 'emerging technologies — AI, robots, electric cars, smart devices and new gadgets',
};

// A directive woven into the slide-generation prompt to steer the CONTENT (not
// the art style) toward a theme. Empty when no theme (or "Any") is chosen.
export function themeDirective(theme?: string): string {
  const t = String(theme || '').trim();
  if (!t || t === 'Any') return '';
  const hint = THEME_HINT[t] || t;
  return [
    `THEME — "${t}": frame this slide around ${hint}.`,
    'Weave a real idea, concept or everyday scenario from this theme into the reading, examples and questions — but explain it AT THE LEARNER\'S CURRENT LEVEL, in the simplest words that level allows, exactly as you would explain it to someone who only speaks the language at this level. Do NOT raise the language difficulty or use jargon: the SUBJECT and skill and level stay exactly the same; only the topic/context changes to this theme.',
    'Prefer a short, concrete, relatable everyday situation over a technical definition. For example, "Cybersecurity" at a beginner level could be a simple scene like: "I can\'t connect to the internet and I don\'t know why. Maybe I should turn the router off and on again." — a real, useful concept from the theme, told in beginner-level sentences.',
  ].join(' ');
}
