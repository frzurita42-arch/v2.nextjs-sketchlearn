import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition } from '@/lib/tool-schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Heuristic (no-AI) builder: turn the user's description straight into a valid,
// editable Tool Definition so the Builder always produces something runnable.
function heuristicProposal(text: string) {
  const t = text.toLowerCase();
  // Strong storage nouns => app; explicit generation verbs => generator; then weak signals.
  const strongApp = /\b(store|storage|track|tracker|journal|library|catalog|catalogue|repository|directory|inventory|log|collection|database|bookmark|planner|gallery)\b/.test(t);
  const socialish = /\b(instagram|social|feed|page|posts?|photo|photos|album|portfolio|board|profile|upload|pictures?|images?|meme|scrapbook)\b/.test(t);
  const languagey = /\b(french|spanish|german|italian|portuguese|japanese|chinese|mandarin|arabic|hindi|english|language|lesson|vocab|vocabulary|phrase|flashcard|flashcards|learn|pronunciation)\b/.test(t);
  // A single-page activity is just a 1-slide lesson (content + questions + report).
  const singleActivity = /\b(single[- ]?page|single activity|one activity|one[- ]?page)\b/.test(t);
  // A playable, scored lesson (quiz slides) — distinct from a static lesson-card app.
  const playable = /\b(quiz|quizz|test|exam|play|playable|scored|slides?|course|study|practice questions|interactive lesson|activity|report)\b/.test(t);
  // Worked-answer / calligraphy / full-sentence practice -> an ANNOTATION lesson:
  // the learner writes the FULL answer by hand on a paginated paper pad (pen +
  // text), and the AI scans every page and grades it. Distinct from a single-
  // character WRITING drill. Fires for math problems, "write the answer",
  // "show your working", calligraphy, and CJK sentences/paragraphs.
  const annoty = /\b(annotat|worked? answer|worked example|work (it|them|the (problem|answer)) out|show (your )?work|working out|write (out |down )?the (answer|solution|working)|solve|math problem|word problem|proof|derivation|caligraph|calligraph|sentence|sentences|paragraph)\b/.test(t);
  // Single-character handwriting drill (draw one char, AI checks) — smaller canvas.
  const writey = /\b(write|writing|handwriting|hand-write|trace|tracing|character|characters|kanji|hiragana|katakana|hanzi|alphabet|stroke)\b/.test(t);
  // A code/text answer box that the AI grades (great for math without Wolfram,
  // proofs with comments, or programming answers).
  const codey = /\b(code ?snippet|code ?box|code ?block|code ?answer|write code|answer with code|type the answer|typed answer)\b/.test(t);
  // The paper pad answer surface (annotation tool) is named explicitly.
  const padWanted = /\b(annotation|annotate|paper pad|on paper|by hand|hand.?writ\w*|drawing pad|pen and paper|tool.?tip)\b/.test(t);
  // A no-AI diary (write pages, publish them), or an AI chat on the pad.
  const journaly = /\b(journal|journalling|journaling|diary|diaries|dear diary|daily log|logbook|scrapbook)\b/.test(t);
  const convoy = /\b(ai conversation|conversation with (the )?ai|chat with (the )?ai|talk to (the )?ai|tutor chat|ai chat|conversation blog|canvas chat|ask (the )?ai by (writing|drawing)|write to the ai|chat but with)\b/.test(t);
  if (playable || annoty || writey || codey || padWanted || journaly || convoy || (languagey && /\b(course|study|quiz|slides?|play|test|practice)\b/.test(t))) {
    const langMatch = t.match(/\b(french|spanish|german|italian|portuguese|japanese|chinese|mandarin|arabic|hindi|english)\b/);
    const mathy = /\b(math|algebra|calculus|geometry|trigonometry|statistics|probability|equation|arithmetic)\b/.test(t);
    const progy = /\b(programming|coding|code|python|javascript|java|software|algorithm|sql|rust|typescript)\b/.test(t);
    const subjectKind = langMatch ? 'language' : mathy ? 'math' : progy ? 'programming' : 'general';
    const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;
    const subject = (text.trim().split(/[.,\n]/)[0] || 'Lesson').replace(/^(a|an|make|build|create|i want|i'd like)\s+/i, '').slice(0, 60) || 'Lesson';
    const levels = langMatch ? ['A1', 'A2', 'B1', 'B2', 'C1'] : ['Beginner', 'Intermediate', 'Advanced'];
    // Titles read "Type — first words of the idea" so the gallery is scannable.
    const mkTitle = (typeLabel: string) => `${typeLabel} — ${subject}`.slice(0, 70);
    // Honour a requested count ("two slides", "3 problems", "5 questions"…).
    const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15 };
    const countMatch = t.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\s+(?:\w+\s+){0,2}(slides?|problems?|questions?|cards?|pages?|characters?|activities|activity|items?)\b/);
    const wantSlides = countMatch ? Math.max(1, Math.min(15, WORDNUM[countMatch[1]] || parseInt(countMatch[1], 10) || 0)) : 0;
    const nSlides = (n: number) => (wantSlides || (singleActivity ? 1 : n));   // requested count wins
    // Canvas conversation / journal modes: a growing pad thread, published as a
    // post. No set length. Journal = no AI; conversation = AI replies on top.
    if (convoy || journaly) {
      const journal = journaly && !convoy;
      return {
        archetype: 'lesson', title: mkTitle(journal ? 'Journal' : 'Canvas chat'), description: text.slice(0, 300),
        tags: [subjectKind === 'general' ? 'lesson' : subjectKind, journal ? 'journal' : 'conversation', 'annotation'].filter((v, i, arr) => arr.indexOf(v) === i),
        settings: [
          { id: 'topic', label: journal ? 'Journal topic (optional)' : 'Topic', type: 'text', placeholder: journal ? 'What is this journal about?' : 'What do you want to talk about?' },
        ],
        lesson: {
          subject: langMatch ? cap(langMatch[1]) : subject,
          subjectKind,
          mode: journal ? 'journal' : 'conversation',
          totalSlides: 1,
          language: langMatch ? cap(langMatch[1]) : undefined,
          translateTo: 'English',
          support: { images: false, code: false, tables: false, formulas: false, audio: false },
          activityTypes: ['annotation'],
        },
      };
    }
    if (annoty || codey || padWanted) {
      const cjkCalligraphy = /\b(japanese|chinese|korean|mandarin|kanji|hanzi|hangul|caligraph|calligraph)\b/.test(t);
      // Which answer surface(s)? The paper pad (annotation) is the DEFAULT for
      // these worked-answer lessons. Only drop it if the user says they don't
      // want it — then serve the same questions with a code/text box instead.
      // The two can also be MIXED (one on the pad, one in a code box).
      const noDraw = /\b(no|without|don'?t|do not|skip|no need for|rather not)\b[^.]*\b(annotation|draw(ing)?|pad|hand.?writ|pen|paper|canvas|tool.?tip)\b/.test(t);
      const wantsCode = codey || /\b(code|snippet|text ?box)\b/.test(t);
      const wantsBoth = /\bboth\b/.test(t) || (padWanted && wantsCode && !noDraw);
      const acts = noDraw ? ['code'] : wantsBoth ? ['annotation', 'code'] : wantsCode && !padWanted && !annoty ? ['code'] : ['annotation'];
      const surfaceTag = acts.includes('annotation') ? (cjkCalligraphy ? 'calligraphy' : 'worked-answer') : 'code';
      const typeLabel = acts.includes('annotation') && acts.includes('code') ? 'Annotation + code'
        : acts[0] === 'code' ? 'Code activity' : (cjkCalligraphy ? 'Calligraphy' : 'Annotation');
      return {
        archetype: 'lesson', title: mkTitle(typeLabel), description: text.slice(0, 300),
        tags: [subjectKind === 'general' ? 'lesson' : subjectKind, acts.includes('annotation') ? 'annotation' : 'code', surfaceTag].filter((v, i, arr) => arr.indexOf(v) === i),
        settings: [
          { id: 'topic', label: cjkCalligraphy ? 'Character set / topic' : 'Topic', type: 'text', placeholder: cjkCalligraphy ? 'e.g. greetings, a proverb' : 'Narrow the focus' },
          { id: 'difficulty', label: 'Level', type: 'select-or-custom', options: levels },
          { id: 'slides', label: singleActivity ? 'Problems' : 'How many problems', type: 'number', default: nSlides(5) },
        ],
        lesson: {
          subject: langMatch ? cap(langMatch[1]) : subject,
          subjectKind: cjkCalligraphy ? 'language' : subjectKind,
          totalSlides: nSlides(5),
          language: langMatch ? cap(langMatch[1]) : (cjkCalligraphy ? subject : undefined),
          translateTo: 'English',
          // A worked-answer pad / code box speaks for itself — no image/table clutter.
          support: { images: false, code: false, tables: false, formulas: false, audio: false },
          activityTypes: acts,
        },
      };
    }
    // Handwriting/character practice -> a pure WRITING lesson (draw + AI check). No
    // pronunciation/image/phrase — just a character set + difficulty.
    if (writey) {
      return {
        archetype: 'lesson', title: mkTitle('Writing'), description: text.slice(0, 300),
        tags: ['language', 'writing', 'handwriting'].filter((v, i, arr) => arr.indexOf(v) === i),
        settings: [
          { id: 'topic', label: 'Character set / topic', type: 'select-or-custom', options: langMatch && /japanese/.test(t) ? ['Hiragana', 'Katakana', 'Basic Kanji'] : ['Basics', 'Common words'] },
          { id: 'difficulty', label: 'Difficulty', type: 'select-or-custom', options: levels },
          { id: 'slides', label: 'How many characters', type: 'number', default: nSlides(5) },
        ],
        lesson: {
          subject: langMatch ? cap(langMatch[1]) : subject, subjectKind: 'language',
          totalSlides: nSlides(5), language: langMatch ? cap(langMatch[1]) : subject, translateTo: 'English',
          support: { images: false, code: false, tables: false, formulas: false, audio: false },
          activityTypes: ['writing'],
        },
      };
    }
    // Support-material toggles appropriate to the subject.
    const supToggles = subjectKind === 'math'
      ? [{ id: 'sup_formulas', label: 'Formulas', type: 'toggle', default: true }, { id: 'sup_tables', label: 'Tables', type: 'toggle', default: true }]
      : subjectKind === 'programming'
        ? [{ id: 'sup_code', label: 'Code snippets', type: 'toggle', default: true }, { id: 'sup_tables', label: 'Tables', type: 'toggle', default: true }]
        : subjectKind === 'language'
          ? [{ id: 'sup_images', label: 'Images', type: 'toggle', default: true }, { id: 'sup_audio', label: 'Audio', type: 'toggle', default: true }]
          : [{ id: 'sup_images', label: 'Images', type: 'toggle', default: true }, { id: 'sup_tables', label: 'Tables', type: 'toggle', default: false }];
    return {
      archetype: 'lesson', title: mkTitle(singleActivity ? 'Activity' : 'Lesson'), description: text.slice(0, 300),
      tags: [subjectKind === 'general' ? 'lesson' : subjectKind, 'lesson'].filter((v, i, arr) => arr.indexOf(v) === i),
      // The standard slide-presentation settings, kept compact for 9:16.
      settings: [
        { id: 'topic', label: 'Topic', type: 'text', placeholder: 'Narrow the focus' },
        { id: 'difficulty', label: 'Level', type: 'select-or-custom', options: levels },
        { id: 'tone', label: 'Tone', type: 'select-or-custom', options: ['Friendly', 'Formal', 'Playful', 'Socratic', 'Storytelling'] },
        { id: 'slides', label: 'Slides', type: 'number', default: nSlides(5) },
        { id: 'length', label: 'Paragraph length', type: 'select', options: ['brief', 'medium', 'detailed'], default: 'medium' },
        { id: 'paragraphs', label: 'Paragraphs / slide', type: 'number', default: 1 },
        ...supToggles,
      ],
      lesson: {
        subject: langMatch ? cap(langMatch[1]) : subject,
        subjectKind,
        totalSlides: nSlides(5),
        paragraphsPerSlide: 1,
        paragraphLength: 'medium',
        language: langMatch ? cap(langMatch[1]) : undefined,
        translateTo: 'English',
        support: {
          images: subjectKind !== 'programming',
          code: subjectKind === 'programming',
          tables: subjectKind === 'programming' || subjectKind === 'math',
          formulas: subjectKind === 'math',
          audio: subjectKind === 'language',
        },
        activityTypes: ['mcq', 'fill-blank', 'input'],
      },
    };
  }
  const genVerb = /\b(generate|produce|write|draft|compose|summar|essay|outline|ideas|suggestions?|plan out)\b/.test(t);
  const archetype = (strongApp || socialish || languagey) ? 'app' : genVerb ? 'generator' : /\b(list|collect|save)\b/.test(t) ? 'app' : 'generator';
  const title = (text.trim().split(/[.,\n]/)[0] || 'My Tool').replace(/^(a|an|make|build|create|i want|i'd like)\s+/i, '').slice(0, 60) || 'My Tool';

  // Language/lesson tool: leveled lesson cards with speaker + translate (free on text),
  // plus a recorded-pronunciation audio field and an optional handwriting canvas.
  if (archetype === 'app' && languagey) {
    const drawy = /\bdraw|sketch|handwrit|character|kanji|hanzi|alphabet\b/.test(t);
    const fields: any[] = [
      { id: 'level', label: 'Level', type: 'select-or-custom', options: ['Beginner', 'A1', 'A2', 'B1', 'B2', 'C1'] },
      { id: 'phrase', label: 'Phrase / prompt', type: 'textarea', required: true },
      { id: 'image', label: 'Image (optional)', type: 'image' },
      { id: 'audio', label: 'Pronunciation (record)', type: 'audio' },
    ];
    if (drawy) fields.push({ id: 'writing', label: 'Handwriting', type: 'drawing' });
    return { archetype, title: `Lesson — ${title}`.slice(0, 70), description: text.slice(0, 300), tags: ['language', 'lesson'], settings: [], app: { entryFields: fields, display: 'cards', review: false } };
  }

  if (archetype === 'app') {
    const imagey = socialish || /\bphoto|image|picture|upload\b/.test(t);
    const fields: any[] = [];
    if (imagey) fields.push({ id: 'image', label: 'Image', type: 'image' });
    fields.push({ id: socialish ? 'caption' : 'title', label: socialish ? 'Caption' : 'Title', type: socialish ? 'textarea' : 'text', required: !socialish });
    if (/\blink|url\b/.test(t)) fields.push({ id: 'link', label: 'Link', type: 'text' });
    if (/\bdate|due|deadline|schedule\b/.test(t)) fields.push({ id: 'date', label: 'Date', type: 'date' });
    if (/\blevel|category|topic|type|tag\b/.test(t)) fields.push({ id: 'category', label: 'Category', type: 'select-or-custom', options: ['General', 'Beginner', 'Intermediate', 'Advanced'] });
    if (!socialish) fields.push({ id: 'notes', label: 'Notes', type: 'textarea' });
    // Storage/repository/directory read best as a table; galleries/feeds as cards.
    const display = /\b(storage|repository|directory|table|catalog|catalogue|inventory|spreadsheet)\b/.test(t) ? 'table' : /\blist\b/.test(t) ? 'list' : 'cards';
    const appType = display === 'table' || display === 'list' ? 'Storage' : 'Gallery';
    return { archetype, title: `${appType} — ${title}`.slice(0, 70), description: text.slice(0, 300), tags: [], settings: [], app: { entryFields: fields, display, review: false } };
  }
  const output = /\bcards?|ideas|list|items|steps\b/.test(t) ? 'cards' : /\btable|rows|columns|data\b/.test(t) ? 'table' : 'text';
  return {
    archetype, title: `Generator — ${title}`.slice(0, 70), description: text.slice(0, 300), tags: [],
    settings: [{ id: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'What should it be about?' }],
    generator: { promptTemplate: `Based on this request: "${text.slice(0, 200)}". Produce output about: {{topic}}.`, output },
  };
}

const PALETTE = `Field types: text, textarea, number, select (needs options), select-or-custom (dropdown the user can override), toggle, date, image (upload a picture), audio (record voice), drawing (sketch on a canvas). Text/textarea values automatically get speaker (text-to-speech) and translate buttons in the display, so language tools don't need separate "audio" fields for reading text aloud.
Archetypes:
- "generator": settings[] (the inputs) + generator.promptTemplate (use {{fieldId}} placeholders) + generator.output ("text" | "cards" | "table").
- "app": app.entryFields[] (fields per stored record) + app.display ("cards" | "list" | "table") + app.review (bool: new entries need owner approval).
- "lesson": a PLAYABLE, scored slide deck. Use for quizzes, courses, study/practice, and interactive language lessons. settings[] are the standard slide-presentation controls (keep them compact): "topic" (text), "difficulty"/level (select-or-custom), "tone" (select-or-custom: Friendly/Formal/Playful/Socratic/Storytelling), "slides" (number), "length" (select brief/medium/detailed), "paragraphs" per slide (number), and toggle fields to include/exclude support material APPROPRIATE to the subject — id them "sup_images", "sup_audio", "sup_code", "sup_tables", "sup_formulas" (e.g. math -> sup_formulas+sup_tables; programming -> sup_code+sup_tables; language -> sup_images+sup_audio). Only include the toggles that fit the activity. lesson = { subject, subjectKind ("general"|"language"|"math"|"programming"), totalSlides (3-15, default 5), paragraphsPerSlide (1-4), paragraphLength, language (for language lessons -> content generated in that language with speaker+translate), translateTo, support { images, code, tables, formulas, audio }, activityTypes (subset of ["mcq","fill-blank","input"]) }. The runtime fluctuates question types (MCQ with 2 or 4 options, fill-in-the-blank, typed answers with 3 tries), allows multiple questions per slide, and shows support material. For MATH set support.formulas+tables; for PROGRAMMING set support.code+tables; for LANGUAGE set support.audio+images.

The PLATFORM already wraps EVERY published tool in social chrome: the author's
profile, a like button + like count, a share link, and a full comment section.
So NEVER add fields for username/author, likes, comments, or profile — they exist
for free around the tool. Focus the definition purely on the tool's actual content.

ALWAYS build a GENERAL-PURPOSE, reusable tool — never a single hard-coded instance.
If the user says "a French lesson on summer vacation at B1", the specifics
("summer vacation", "B1") become DEFAULTS inside configurable settings, so once
published the tool can be run again and again with different values. Each run
becomes an "activity" that shows up in the tool's own feed of generated activities.
So a lesson/generator tool must expose the varying parts as settings the end-user
fills in at run time (e.g. a "topic" text field and a "level" select-or-custom).

Prompt-engineering: the user's prompt is usually short. EXPAND it into a well-rounded
tool — infer the fields a thoughtful maker would include, write a clear title,
a one-line description, and 2-4 tags.

TITLE FORMAT: the title MUST start with a short TYPE label, then "— ", then a few
words from the idea. Examples: "Annotation — Algebra worked answers",
"Annotation + code — Trig practice", "Lesson — French basics", "Gallery — Sticker
board", "Storage — Course PDFs", "Generator — Haiku maker". Keep it under ~70 chars.

HONOUR REQUESTED COUNTS: if the user says how many slides/problems/questions/cards
they want ("two slides", "3 problems"), set lesson.totalSlides (and the "slides"
setting default) to exactly that number. Otherwise default to 5 (or 1 for an
explicit single-page activity). Never override a count the user asked for.

SETTINGS DESIGN (important): keep the settings form MINIMAL and COMPACT so it
looks good on a tall 9:16 phone screen. For any field that is a choice, use
"select-or-custom" (it shows a small pencil to type a custom value) instead of a
plain text box — avoid unnecessary input boxes. Only include settings that
actually change the output.

Guidance by kind:
- Handwriting / character practice (e.g. "practice writing Japanese characters,
  checked by AI"): make a LESSON with subjectKind "language", language set,
  and activityTypes ["writing"]. The learner draws the character and the AI
  checks it — so do NOT add pronunciation, image, phrase, or prompt fields.
  Settings should be just a "topic/character set" and a "difficulty"
  select-or-custom.
- Worked answers / math problems / "write the answer" / show-your-working / full
  sentences / calligraphy (e.g. "solve math problems on paper, checked by AI",
  "practice writing Chinese sentences / calligraphy"): make a LESSON with
  activityTypes ["annotation"] (ONE question per slide, AI-graded). The paper pad
  is the DEFAULT answer surface — the learner writes the FULL worked answer by
  hand on a big paginated pad (pen thickness/colours + typed text), and the AI
  scans every page and grades it. Only DROP the pad if the user says they don't
  want it — then use activityTypes ["code"] (a code/text box the AI grades),
  which is also the best fit for math when Wolfram isn't available (write the
  working / proof with comments) and for programming answers. You may MIX both:
  activityTypes ["annotation","code"] puts some questions on the pad and some in
  a code box. A lesson can also mix these with "mcq"/"fill-blank"/"input". Set
  subjectKind to "math" for math, or "language" for CJK/calligraphy. Keep support
  material OFF and settings minimal: "topic", "difficulty", "how many problems".
- AI conversation on the annotation pad / "chat with the AI by writing or drawing" /
  "canvas chat" / "AI conversation blog": make a LESSON with lesson.mode
  "conversation" (activityTypes ["annotation"], totalSlides 1). The learner writes
  or draws a message on the pad, sends it, and the AI replies at the top like a
  chat; there is NO set length — they exit whenever they like and the whole thread
  is published as a post with an AI recap. Keep settings to just a "topic".
- Journal / diary / "write pages and post them" with NO AI: make a LESSON with
  lesson.mode "journal" (activityTypes ["annotation"], totalSlides 1). The learner
  writes pages by hand and publishes the collection — no grading, no AI. Settings:
  just an optional "topic".
- Social page / Instagram-style feed / photo gallery / portfolio / "page with uploadable posts":
  APP, display "cards", entryFields = an "image" field + a "textarea" caption (+ optional link/tags).
- Language / lesson tools (e.g. "a French lesson"): APP, display "cards". Include a
  "select-or-custom" level field (Beginner, A1, A2, B1, B2, C1) and content fields for each
  lesson card — a "textarea" for the phrase/prompt (it gets speaker + translate buttons for
  free), an optional "image", an "audio" field for a recorded pronunciation, and a "drawing"
  field when handwriting/characters matter. Learners view the cards inside the tool.
- Dashboards / trackers / directories / journals: APP with the natural fields, display "cards" or "table".`;

// Deterministic gate questions (used without AI, or as a fallback). They probe
// the tool's DOMAIN, SUBJECT and CONTENT/COMPONENTS so the generator can pick the
// right settings and activities — tailored to what's described, and varied to
// avoid asking the same thing every time. It NEVER asks about difficulty/level:
// that is already a preloaded, customizable setting on every lesson.
function gateQuestion(userTurns: number, ideaText = '') {
  const t = String(ideaText).toLowerCase();
  const eduish = /\b(lesson|quiz|learn|study|practi[cs]e|course|teach|educat|language|math|science|physics|chemistry|biolog|grammar|vocabul|history|geograph)\b/.test(t);
  const collectiony = /\b(gallery|collection|store|storage|catalog|catalogue|feed|board|portfolio|directory|album|posts?|repository|inventory|tracker|journal|diary)\b/.test(t);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  if (userTurns <= 1) {
    // DOMAIN — is it educational, language, a collection, a journal…?
    return {
      question: pick([
        'What kind of tool is this — what should it mainly do?',
        'How would you describe this tool at a high level?',
      ]),
      options: ['An educational lesson or quiz', 'A language-learning activity', 'A gallery / collection of items', 'A journal or notes tool'],
      field: 'domain',
    };
  }
  if (userTurns === 2) {
    // SUBJECT / CONTENT of each item.
    if (collectiony && !eduish) {
      return { question: 'What does each item contain?', options: ['A photo + a caption', 'Text / notes', 'A link or file', 'Mixed media'], field: 'itemContent' };
    }
    return {
      question: pick(['What subject or topic should it focus on?', 'What area or subjects should it cover?']),
      options: ['Math or science', 'A language', 'Programming / tech', 'History or general knowledge'],
      field: 'subject',
    };
  }
  // turn 3 — CONTENT/COMPONENTS to display or ask (never difficulty).
  if (collectiony && !eduish) {
    return { question: 'How should the items be shown?', options: ['A grid of cards', 'A simple list', 'A table'], field: 'display' };
  }
  return {
    question: 'What should each activity include or ask the learner to do?',
    options: ['Reading / info + multiple-choice', 'Typed answers checked by AI', 'Handwriting / worked answers on a pad', 'A mix of formats'],
    field: 'activityContent',
  };
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const messages: any[] = Array.isArray(b.messages) ? b.messages.slice(-16) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  // All the user's turns joined (first = the idea) so the heuristic proposal
  // captures the whole request, not just the last "generate as is" answer.
  const ideaText = messages.filter((m) => m.role === 'user').map((m) => String(m.content || '').trim()).filter(Boolean).join('. ') || String(lastUser || 'a simple tool');

  // Gate: turn 1 = the idea; force 2 follow-up questions (turns 1,2) + a
  // recommendation (turn 3) BEFORE any proposal is allowed. Only from turn 4 on
  // (i.e. after the user has answered all three) may the builder propose.
  const userTurns = messages.filter((m) => m.role === 'user').length;
  const inGate = userTurns <= 3;

  if (!geminiEnabled && !deepseekEnabled) {
    if (inGate) return NextResponse.json({ kind: 'question', ...gateQuestion(userTurns, ideaText) });
    const raw = heuristicProposal(ideaText);
    const { def } = validateToolDefinition(raw);
    return NextResponse.json({ kind: 'proposal', definition: def, summary: 'Assembled a starter tool from your answers (no AI connected — edit or publish as-is).' });
  }

  const system = [
    'You are a Tool Builder. Through a short chat you help the user design a "tool" that the platform will run.',
    'You compose ONLY from the fixed palette below — never invent code or components.',
    PALETTE,
    'Return STRICT JSON that is EITHER a clarifying question OR a finished proposal:',
    '{ "kind": "question", "question": "one short question", "options": ["opt1","opt2"], "field": "what this decides" }',
    'OR { "kind": "proposal", "summary": "one sentence", "definition": { ...a full Tool Definition... } }',
    'Questions must be short and give 2-4 concrete options (the user can also type a custom answer). They must uncover what you need to DESIGN the tool: its DOMAIN (educational lesson? language learning? a gallery/collection? a journal?), its SUBJECT/topic area, and the CONTENT/COMPONENTS to use (what each activity asks or each item contains, how it is shown).',
    'NEVER ask about difficulty or level — every lesson already gets a preloaded, customizable difficulty setting. Never re-ask something already answered; each question must reveal something NEW.',
  ].join('\n');
  const convo = messages.map((m) => `${m.role === 'assistant' ? 'Builder' : 'User'}: ${String(m.content).slice(0, 800)}`).join('\n');

  try {
    // While in the gate, force a settings-oriented question (never a proposal yet).
    if (inGate) {
      const directive = userTurns === 1
        ? `Ask ONE short question about the tool's DOMAIN and SUBJECT — e.g. whether it is an educational lesson/quiz, a language-learning activity, a gallery/collection, or a journal, and what subject/topic area it should cover. Base it on their description; don't re-ask what they already told you. 2-4 options + allow custom. Return ONLY a "question" object, do NOT propose.`
        : userTurns === 2
          ? `Ask ONE short question about the CONTENT and COMPONENTS — what each activity should ASK the learner (reading + multiple-choice, typed AI-checked answers, handwriting/worked answers on a pad, a code box, a chat…) OR what each item should CONTAIN and how it's shown (photos, text, links, cards/list/table). 2-4 options + allow custom. Return ONLY a "question" object, do NOT propose.`
          : `Recommend ONE specific CONTENT or COMPONENT choice that would improve this tool (e.g. add an image field, include a listening/audio step, mix in a handwriting activity) — NOT difficulty/level. Ask whether to include it. Options MUST be exactly ["Add it","Generate as is"]. Return ONLY a "question" object, do NOT propose.`;
      const r: any = await generateStructured(
        [{ role: 'system', content: `${system}\n${directive}` }, { role: 'user', content: `Conversation so far:\n${convo}` }],
        { temperature: 0.7, maxTokens: 700 }
      ).catch(() => null);
      const fb = gateQuestion(userTurns, ideaText);
      const options = (Array.isArray(r?.options) ? r.options : []).map((o: any) => String(o).slice(0, 60)).filter(Boolean).slice(0, 4);
      return NextResponse.json({
        kind: 'question',
        question: String(r?.question || fb.question),
        options: options.length ? options : fb.options,
        field: String(r?.field || fb.field),
      });
    }

    // Gate cleared -> propose.
    const r: any = await generateStructured(
      [{ role: 'system', content: `${system}\nYou now have enough. Return a "proposal" with a full definition.` }, { role: 'user', content: `Conversation so far:\n${convo}\n\nReturn the proposal JSON.` }],
      { temperature: 0.6, maxTokens: 1500 }
    );
    if (r?.kind === 'proposal' || r?.definition) {
      const { ok, def } = validateToolDefinition(r.definition);
      if (ok) return NextResponse.json({ kind: 'proposal', definition: def, summary: String(r.summary || 'Here is a tool based on your answers.') });
      const { def: hdef } = validateToolDefinition(heuristicProposal(ideaText));
      return NextResponse.json({ kind: 'proposal', definition: hdef, summary: 'Here is a starter version — tweak it or publish.' });
    }
    // Model still asked something -> pass it through.
    return NextResponse.json({
      kind: 'question',
      question: String(r?.question || 'Anything else to adjust?'),
      options: (Array.isArray(r?.options) ? r.options : []).map((o: any) => String(o).slice(0, 60)).slice(0, 4),
      field: String(r?.field || ''),
    });
  } catch {
    const { def } = validateToolDefinition(heuristicProposal(ideaText));
    return NextResponse.json({ kind: 'proposal', definition: def, summary: 'Assembled a starter tool from your description.' });
  }
}
