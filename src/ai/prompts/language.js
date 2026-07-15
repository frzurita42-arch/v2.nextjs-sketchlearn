/* Prompts for the Language Learning activity: level-appropriate grammar topics,
 * a lesson-theme suggestion, and the per-level instructions that steer the shared
 * slide engine when it renders a language "reading" lesson. */

// Guidance per CEFR-style level, reused across prompts so lessons target the right
// objective and difficulty (Zero = absolute basics; C1/C2 = nuanced/real-world).
const LEVEL_GUIDANCE = {
  Zero: 'Absolute beginner starting from nothing. Teach the alphabet/characters, letter or character sounds, a handful of the most essential words, and 2-4 word sentences. For symbol-based languages (Japanese, Mandarin), introduce individual characters: what the character depicts, what it means, and how it sounds, and translate everything using the learner\'s own language so they can follow with zero prior knowledge.',
  Beginner: 'Near-zero. Very simple greetings, numbers, days, essential everyday words, and short present-tense sentences.',
  A1: 'Basic phrases and everyday expressions, simple questions and answers about concrete needs (introductions, shopping, directions).',
  A2: 'Simple, routine matters: describing background, immediate environment, simple past/future, common connectors.',
  B1: 'Handle most travel situations, describe experiences/plans, give brief reasons and opinions; broader tenses.',
  B2: 'Fluent-ish on a range of topics, clear detailed text, argue a viewpoint; subtler grammar and register.',
  C1: 'Complex texts, implicit meaning, flexible/effective language for social, academic and professional use; negotiation, study, business.',
  C2: 'Near-native precision and nuance across specialized/professional/academic contexts; idioms, subtext, fine distinctions.',
};

function levelGuidance(level) {
  return LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.A1;
}

// 10 grammar topics accurate for a given language + level.
function buildGrammarTopicsPrompt({ language, level }) {
  return {
    system: `You produce grammar syllabi for language learners. Respond ONLY with JSON: {"topics": [string, ...]} — exactly 10 concise grammar-topic titles (3-6 words each), in learning order, that are ACCURATE and appropriate for the given target language and level. No numbering, no explanations.`,
    user: `Target language: ${language}. Level: ${level} (${levelGuidance(level)}).\nList 10 grammar topics a ${level} learner of ${language} should study, correct for this exact level.`,
  };
}

// A fun lesson theme (not language-specific): "Food", "Summer vibes", "Travel".
function buildLanguageTopicPrompt({ language, level, avoid = [] }) {
  return {
    system: `You suggest a single, fun, concrete THEME for a language lesson (e.g. Food, Summer vibes, Travel, Sports, Family, City life, Festivals). Respond ONLY with JSON: {"topic": string} — 1-3 words, everyday and engaging, suitable to build ${level} ${language} examples around. Avoid anything in the avoid list.`,
    user: `Language: ${language}. Level: ${level}. Avoid: ${avoid.join(', ') || 'none'}. Suggest one lesson theme.`,
  };
}

// Instructions injected as the slide engine's customInstructions for a language
// READING lesson at a given level/topic/grammar focus.
function buildReadingInstructions({ language, level, topic, grammarTopic }) {
  const symbolNote = /japanese|mandarin|chinese|korean|arabic/i.test(language)
    ? ` ${language} is script/character-based: at Zero/Beginner introduce the characters themselves (what each depicts, means and sounds like) and always give the meaning in the learner's own language.`
    : '';
  const explainInEnglish = ['Zero', 'Beginner', 'A1'].includes(level)
    ? ' Explain in clear English (the learner\'s language) so a near-beginner understands, then show the target-language example.'
    : ' Write mostly in the target language, with brief English glosses only where a beginner-of-this-level would need them.';
  return `LANGUAGE READING LESSON. Target language: ${language}. Learner level: ${level} — ${levelGuidance(level)}${symbolNote}${explainInEnglish}` +
    ` Theme for examples: "${topic || 'everyday life'}". Grammar focus: "${grammarTopic || 'general'}".` +
    ` Each slide is a short reading passage sized to the level (Zero: a few short words/sentences; higher levels: more sentences and paragraphs, richer vocabulary and harder interpretation), followed by a comprehension multiple-choice question.` +
    ` On EVERY slide include exactly one support component that fits the passage — an image or a table (e.g. vocabulary/conjugations) — AND exactly one sticky note whose text is either an encouraging comment on the learner's progress so far, a short level-appropriate quote about the theme, or a quick motivational cheer.` +
    ` NEVER use a code block/snippet: this is a language lesson, not programming — code boxes are only for STEM (coding, math, algorithms).` +
    ` Keep the lesson oriented to what a ${level} learner actually needs (Zero: survival basics; A1/A2: greetings and daily life; B1/B2: experiences and opinions; C1/C2: negotiation, study, travel, business).`;
}

// One interactive language slide of a given type (grammar | vocabulary | reading).
function buildLangSlidePrompt({ type, language, level, topic, grammarTopic, slideNumber, totalSlides, priorSummary }) {
  const guide = levelGuidance(level);
  const inEnglish = ['Zero', 'Beginner', 'A1'].includes(level)
    ? 'Explain in clear English and translate every target-language example.'
    : 'Use mostly the target language, with brief English glosses only where needed.';
  const base = `Target language: ${language}. Learner level: ${level} — ${guide} ${inEnglish} Lesson theme: "${topic || 'everyday life'}". Grammar focus: "${grammarTopic || 'general'}". Slide ${slideNumber} of ${totalSlides}.${priorSummary ? ` Progress so far: ${priorSummary}.` : ''} Make distractors tempting but wrong on a precise point, and RANDOMIZE which option is correct (do not always put it first).`;
  const sticky = `Include "sticky": {"color": "yellow"|"pink"|"blue"|"green"|"orange", "title": short, "note": a short encouraging comment on progress OR a level-appropriate quote about the theme OR a quick motivational cheer}.`;

  if (type === 'grammar') {
    return {
      system: `You are a ${language} grammar teacher. Respond ONLY with JSON: {"title": string, "sticky": {...}, "questions": [{"prompt": string, "options": [{"text": string, "correct": boolean, "explanation": string}]}]}. EXACTLY 4 questions; each has EXACTLY 2 options with exactly one "correct": true. Vary the 4 question kinds: (1) fill in the blank with the best word, (2) best translation of a phrase, (3) is this grammar structure correct? (yes/no), (4) judge whether a stated grammar rule/explanation is correct. CRITICAL — DIVERSITY: every question must use DIFFERENT example sentences/words and every option's text must be UNIQUE across the whole slide (never reuse the same option wording for two questions, and the two options of a question must be clearly distinct, not near-duplicates). Each question must teach something new; if the level is very basic, vary with different vocabulary, synonyms and fresh examples so no two questions feel the same. Keep it at the ${level} level. ${sticky}`,
      user: base,
    };
  }
  if (type === 'vocabulary') {
    return {
      system: `You are a ${language} vocabulary teacher. Respond ONLY with JSON: {"title": string, "sticky": {...}, "items": [item, item, item, item]}. EXACTLY 4 items about the theme. Items 1-2: {"kind": "mcq", "imagePrompt": string (a clear illustration of ONE object alone, or ONE isolated action so it is obvious), "question": string, "options": [{"text": string, "correct": boolean, "explanation": string}] (4 options, one correct)}. Items 3-4: {"kind": "input", "imagePrompt": string, "question": string (ask the learner to TYPE the ${language} word for it), "answer": string (the target word), "accept": [string, ...] (lowercased acceptable spellings/variants)}. ${sticky}`,
      user: base,
    };
  }
  if (type === 'listening') {
    return {
      system: `You are a ${language} listening teacher. Respond ONLY with JSON: {"title": string, "audioText": string (the exact ${language} words/phrase/short sentence to be spoken aloud, appropriate to the level — Zero: one or two words or a 2-4 word sentence), "transcript": string (the same text), "sticky": {...}, "questions": [q, q]}. EXACTLY 2 questions, each {"prompt": string, "options": [{"text": string, "correct": boolean, "explanation": string}]} with EXACTLY 4 options and one correct. Questions test listening comprehension of the audio (what was said, a synonym of a word used, the meaning, etc.). Keep the spoken content oriented to a ${level} learner's objective. ${sticky}`,
      user: base,
    };
  }
  if (type === 'writing') {
    return {
      system: `You are a ${language} handwriting/character coach. The learner will TRACE/WRITE the target by hand on a canvas. Respond ONLY with JSON: {"title": string, "target": string (the ${language} CHARACTER or short WORD to write by hand — for Zero/Beginner pick a SINGLE letter/character or a 2-4 character word; higher levels a short word), "romanization": string (pronunciation/romanization, or "" if not applicable), "meaning": string (its meaning in the learner's language), "audioText": string (the target, to be read aloud), "tip": string (a one-line stroke/formation tip), "sticky": {...}}. Pick something at the ${level} level and relevant to the theme; for script languages (Japanese, Mandarin, Arabic) prefer a real character. ${sticky}`,
      user: base,
    };
  }
  if (type === 'spelling') {
    return {
      system: `You are a ${language} spelling/dictation teacher. Respond ONLY with JSON: {"title": string, "sticky": {...}, "items": [item, item, item, item]}. EXACTLY 4 items, each {"audioText": string (the ${language} target WORD, then a short example sentence using it, to be spoken aloud), "answer": string (just the target word the learner must type), "accept": [string, ...] (lowercased acceptable spellings), "usage": string (a brief English gloss of the example)}. Choose words at the ${level} level and relevant to the theme. ${sticky}`,
      user: base,
    };
  }
  // reading
  return {
    system: `You are a ${language} reading teacher. Respond ONLY with JSON: {"title": string, "passage": string (a short reading sized to the level — Zero: a few words/short sentences; higher: more sentences/paragraphs), "support": ONE of {"type":"image","prompt":string} | {"type":"table","headers":[string,...],"rows":[[string,...],...],"caption":string}, "sticky": {...}, "quiz": {"question": string, "options": [{"text": string, "correct": boolean, "explanation": string}] (4 options, one correct)}}. NEVER output a code block/snippet — this is a language lesson, not programming (code boxes are for STEM only). ${sticky}`,
    user: base,
  };
}

module.exports = { LEVEL_GUIDANCE, levelGuidance, buildGrammarTopicsPrompt, buildLanguageTopicPrompt, buildReadingInstructions, buildLangSlidePrompt };
