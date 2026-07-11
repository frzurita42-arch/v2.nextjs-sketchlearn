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
  // A playable, scored lesson (quiz slides) — distinct from a static lesson-card app.
  const playable = /\b(quiz|quizz|test|exam|play|playable|scored|slides?|course|study|practice questions|interactive lesson)\b/.test(t);
  if (playable || (languagey && /\b(course|study|quiz|slides?|play|test|practice)\b/.test(t))) {
    const langMatch = t.match(/\b(french|spanish|german|italian|portuguese|japanese|chinese|mandarin|arabic|hindi|english)\b/);
    const mathy = /\b(math|algebra|calculus|geometry|trigonometry|statistics|probability|equation|arithmetic)\b/.test(t);
    const progy = /\b(programming|coding|code|python|javascript|java|software|algorithm|sql|rust|typescript)\b/.test(t);
    const subjectKind = langMatch ? 'language' : mathy ? 'math' : progy ? 'programming' : 'general';
    const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;
    const subject = (text.trim().split(/[.,\n]/)[0] || 'Lesson').replace(/^(a|an|make|build|create|i want|i'd like)\s+/i, '').slice(0, 60) || 'Lesson';
    const levels = langMatch ? ['A1', 'A2', 'B1', 'B2', 'C1'] : ['Beginner', 'Intermediate', 'Advanced'];
    // Handwriting/character practice -> a pure WRITING lesson (draw + AI check). No
    // pronunciation/image/phrase — just a character set + difficulty.
    const writey = /\b(write|writing|handwriting|hand-write|trace|tracing|character|characters|kanji|hiragana|katakana|hanzi|alphabet|stroke|calligraphy)\b/.test(t);
    if (writey) {
      return {
        archetype: 'lesson', title: subject, description: text.slice(0, 300),
        tags: ['language', 'writing', 'handwriting'].filter((v, i, arr) => arr.indexOf(v) === i),
        settings: [
          { id: 'topic', label: 'Character set / topic', type: 'select-or-custom', options: langMatch && /japanese/.test(t) ? ['Hiragana', 'Katakana', 'Basic Kanji'] : ['Basics', 'Common words'] },
          { id: 'difficulty', label: 'Difficulty', type: 'select-or-custom', options: levels },
          { id: 'slides', label: 'How many characters', type: 'number', default: 5 },
        ],
        lesson: {
          subject: langMatch ? cap(langMatch[1]) : subject, subjectKind: 'language',
          totalSlides: 5, language: langMatch ? cap(langMatch[1]) : subject, translateTo: 'English',
          support: { images: false, code: false, tables: false, formulas: false, audio: false },
          activityTypes: ['writing'],
        },
      };
    }
    return {
      archetype: 'lesson', title: subject, description: text.slice(0, 300),
      tags: [subjectKind === 'general' ? 'lesson' : subjectKind, 'lesson'].filter((v, i, arr) => arr.indexOf(v) === i),
      // Customizable per run: topic, difficulty, slide count, paragraph density.
      settings: [
        { id: 'topic', label: 'Topic (optional)', type: 'text', placeholder: 'Narrow the focus' },
        { id: 'difficulty', label: 'Difficulty', type: 'select-or-custom', options: levels },
        { id: 'slides', label: 'Number of slides', type: 'number', default: 5 },
        { id: 'length', label: 'Paragraph length', type: 'select', options: ['brief', 'medium', 'detailed'], default: 'medium' },
      ],
      lesson: {
        subject: langMatch ? cap(langMatch[1]) : subject,
        subjectKind,
        totalSlides: 5,
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
    return { archetype, title, description: text.slice(0, 300), tags: ['language', 'lesson'], settings: [], app: { entryFields: fields, display: 'cards', review: false } };
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
    return { archetype, title, description: text.slice(0, 300), tags: [], settings: [], app: { entryFields: fields, display: 'cards', review: false } };
  }
  const output = /\bcards?|ideas|list|items|steps\b/.test(t) ? 'cards' : /\btable|rows|columns|data\b/.test(t) ? 'table' : 'text';
  return {
    archetype, title, description: text.slice(0, 300), tags: [],
    settings: [{ id: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'What should it be about?' }],
    generator: { promptTemplate: `Based on this request: "${text.slice(0, 200)}". Produce output about: {{topic}}.`, output },
  };
}

const PALETTE = `Field types: text, textarea, number, select (needs options), select-or-custom (dropdown the user can override), toggle, date, image (upload a picture), audio (record voice), drawing (sketch on a canvas). Text/textarea values automatically get speaker (text-to-speech) and translate buttons in the display, so language tools don't need separate "audio" fields for reading text aloud.
Archetypes:
- "generator": settings[] (the inputs) + generator.promptTemplate (use {{fieldId}} placeholders) + generator.output ("text" | "cards" | "table").
- "app": app.entryFields[] (fields per stored record) + app.display ("cards" | "list" | "table") + app.review (bool: new entries need owner approval).
- "lesson": a PLAYABLE, scored slide deck. Use for quizzes, courses, study/practice, and interactive language lessons. settings[] are learner options that make it customizable — include a "topic" text field, a "difficulty" select-or-custom, a "slides" number, and a "length" select (brief/medium/detailed). lesson = { subject, subjectKind ("general"|"language"|"math"|"programming"), totalSlides (3-15, default 5), paragraphsPerSlide (1-4), paragraphLength, language (for language lessons -> content generated in that language with speaker+translate), translateTo, support { images, code, tables, formulas, audio }, activityTypes (subset of ["mcq","fill-blank","input"]) }. The runtime fluctuates question types (MCQ with 2 or 4 options, fill-in-the-blank, typed answers with 3 tries), allows multiple questions per slide, and shows support material. For MATH set support.formulas+tables; for PROGRAMMING set support.code+tables; for LANGUAGE set support.audio+images.

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
- Social page / Instagram-style feed / photo gallery / portfolio / "page with uploadable posts":
  APP, display "cards", entryFields = an "image" field + a "textarea" caption (+ optional link/tags).
- Language / lesson tools (e.g. "a French lesson"): APP, display "cards". Include a
  "select-or-custom" level field (Beginner, A1, A2, B1, B2, C1) and content fields for each
  lesson card — a "textarea" for the phrase/prompt (it gets speaker + translate buttons for
  free), an optional "image", an "audio" field for a recorded pronunciation, and a "drawing"
  field when handwriting/characters matter. Learners view the cards inside the tool.
- Dashboards / trackers / directories / journals: APP with the natural fields, display "cards" or "table".`;

// Deterministic gate questions (used without AI, or as a fallback). The builder
// ALWAYS asks 2 settings questions + 1 recommendation before it may propose.
function gateQuestion(userTurns: number) {
  if (userTurns <= 1) return { question: 'Who is this tool mainly for, and how will it be used?', options: ['Just me / personal', 'A public community tool'], field: 'audience' };
  if (userTurns === 2) return { question: 'How should people mainly use it each time?', options: ['Play / generate an activity', 'Add & browse saved entries'], field: 'interaction' };
  return { question: 'I can also add a difficulty / level setting so it adapts to the user. Add that?', options: ['Add it', 'Generate as is'], field: 'recommendation' };
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const messages: any[] = Array.isArray(b.messages) ? b.messages.slice(-16) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  // All the user's turns joined (first = the idea) so the heuristic proposal
  // captures the whole request, not just the last "generate as is" answer.
  const ideaText = messages.filter((m) => m.role === 'user').map((m) => String(m.content)).join('. ') || String(lastUser || 'a simple tool');

  // Gate: turn 1 = the idea; force 2 follow-up questions (turns 1,2) + a
  // recommendation (turn 3) BEFORE any proposal is allowed. Only from turn 4 on
  // (i.e. after the user has answered all three) may the builder propose.
  const userTurns = messages.filter((m) => m.role === 'user').length;
  const inGate = userTurns <= 3;

  if (!geminiEnabled && !deepseekEnabled) {
    if (inGate) return NextResponse.json({ kind: 'question', ...gateQuestion(userTurns) });
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
    'Questions must be short, oriented to the tool\'s SETTINGS/design, and give exactly 2 concrete options (the user can also type a custom answer).',
  ].join('\n');
  const convo = messages.map((m) => `${m.role === 'assistant' ? 'Builder' : 'User'}: ${String(m.content).slice(0, 800)}`).join('\n');

  try {
    // While in the gate, force a settings-oriented question (never a proposal yet).
    if (inGate) {
      const directive = userTurns <= 2
        ? `Ask clarifying question ${userTurns} of 2 about this tool's SETTINGS/design (2 options + allow custom). Return ONLY a "question" object, do NOT propose.`
        : `Recommend ONE extra useful setting for this tool and ask whether to add it. The options MUST be exactly ["Add it","Generate as is"]. Return ONLY a "question" object, do NOT propose.`;
      const r: any = await generateStructured(
        [{ role: 'system', content: `${system}\n${directive}` }, { role: 'user', content: `Conversation so far:\n${convo}` }],
        { temperature: 0.6, maxTokens: 700 }
      ).catch(() => null);
      const fb = gateQuestion(userTurns);
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
