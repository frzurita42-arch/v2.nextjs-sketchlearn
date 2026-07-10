import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { geminiEnabled, deepseekEnabled, imageEnabled } from '@/src/config';
import { saveGeneration } from '@/src/db/persistence';
import { generateStructured, generateImage } from '@/src/ai/providers';
import { buildLangSlidePrompt } from '@/src/ai/prompts/language';
import { sanitizeComponents } from '@/src/slides/sanitize';
import { fallbackImageDataUrl } from '@/src/slides/visual-policy';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green', 'orange'];
function cleanSticky(s: any) {
  const color = STICKY_COLORS.includes(String(s?.color || '').toLowerCase()) ? String(s.color).toLowerCase() : 'yellow';
  return { color, title: String(s?.title || 'Keep going!').slice(0, 40), note: String(s?.note || 'Nice work — one step at a time.').slice(0, 240) };
}
function cleanOptions(opts: any, want: number) {
  const arr = (Array.isArray(opts) ? opts : []).map((o: any) => ({
    text: String(o?.text || '').trim(), correct: !!o?.correct, explanation: String(o?.explanation || '').slice(0, 240),
  })).filter((o: any) => o.text).slice(0, want);
  if (!arr.some((o: any) => o.correct) && arr.length) arr[0].correct = true;
  return arr;
}

// ---- deterministic fallbacks (demo mode / AI failure) ----
function fbGrammar(topic: string) {
  const q = (prompt: string, a: string, b: string, correctA: boolean) => ({
    prompt, options: [{ text: a, correct: correctA, explanation: '' }, { text: b, correct: !correctA, explanation: '' }],
  });
  return {
    type: 'grammar', title: `Grammar practice: ${topic}`.slice(0, 60), sticky: cleanSticky({ color: 'green', title: 'Warm-up', note: 'Trust what you have learned so far.' }),
    questions: [
      q('Pick the correct word to fill the blank.', 'the correct form', 'a wrong form', true),
      q('Which is the better translation?', 'the accurate translation', 'a mistranslation', true),
      q('Is this grammar structure correct?', 'Yes', 'No', true),
      q('Is this grammar explanation correct?', 'Correct', 'Incorrect', true),
    ],
  };
}
function fbVocab(topic: string) {
  const img = (p: string) => fallbackImageDataUrl(p, '');
  return {
    type: 'vocabulary', title: `Vocabulary: ${topic}`.slice(0, 60), sticky: cleanSticky({ color: 'blue', title: 'Words', note: 'Say each word out loud as you go.' }),
    items: [
      { kind: 'mcq', image: img(`${topic} object`), question: 'What is shown?', options: cleanOptions([{ text: 'the right word', correct: true }, { text: 'wrong 1' }, { text: 'wrong 2' }, { text: 'wrong 3' }], 4) },
      { kind: 'mcq', image: img(`${topic} action`), question: 'What action is shown?', options: cleanOptions([{ text: 'the right verb', correct: true }, { text: 'wrong 1' }, { text: 'wrong 2' }, { text: 'wrong 3' }], 4) },
      { kind: 'input', image: img(`${topic} item`), question: 'Type the word for this item.', answer: 'word', accept: ['word'] },
      { kind: 'input', image: img(`${topic} scene`), question: 'Type the word for this.', answer: 'word', accept: ['word'] },
    ],
  };
}
function fbReading(topic: string) {
  return {
    type: 'reading', title: `Reading: ${topic}`.slice(0, 60),
    passage: `A short reading about ${topic}. Read it carefully and answer the question below.`,
    support: { type: 'table', headers: ['Word', 'Meaning'], rows: [['—', '—'], ['—', '—']], caption: 'Key words' },
    sticky: cleanSticky({ color: 'yellow', title: 'Read on', note: 'Guess unknown words from context.' }),
    quiz: { question: 'What was the passage mainly about?', options: cleanOptions([{ text: topic, correct: true }, { text: 'something else' }, { text: 'a different theme' }, { text: 'none of these' }], 4) },
  };
}

async function fillImage(prompt: string): Promise<string> {
  if (imageEnabled) {
    try { const url = await generateImage(prompt); if (url) return url; } catch { /* fall through */ }
  }
  return fallbackImageDataUrl(prompt, '');
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const type = ['grammar', 'vocabulary', 'reading'].includes(b.type) ? b.type : 'reading';
  const { language = 'Spanish', level = 'A1', topic = 'everyday life', grammarTopic = '', slideNumber = 1, totalSlides = 1, priorSummary = '' } = b;

  const useFallback = !geminiEnabled && !deepseekEnabled;
  let slide: any;

  if (useFallback) {
    slide = type === 'grammar' ? fbGrammar(topic) : type === 'vocabulary' ? fbVocab(topic) : fbReading(topic);
  } else {
    try {
      const p = buildLangSlidePrompt({ type, language, level, topic, grammarTopic, slideNumber, totalSlides, priorSummary });
      const r = await generateStructured([{ role: 'system', content: p.system }, { role: 'user', content: p.user }], { temperature: 0.8, maxTokens: 4096 });
      slide = { ...r, type };
      slide.sticky = cleanSticky(slide.sticky);
      if (type === 'grammar') {
        slide.questions = (Array.isArray(slide.questions) ? slide.questions : []).slice(0, 4).map((q: any) => ({ prompt: String(q?.prompt || '').trim(), options: cleanOptions(q?.options, 2) })).filter((q: any) => q.prompt && q.options.length === 2);
        if (slide.questions.length < 1) slide = fbGrammar(topic);
      } else if (type === 'vocabulary') {
        const items = (Array.isArray(slide.items) ? slide.items : []).slice(0, 4);
        slide.items = await Promise.all(items.map(async (it: any) => {
          const image = await fillImage(String(it?.imagePrompt || `${topic} ${language}`));
          if (it?.kind === 'input') return { kind: 'input', image, question: String(it?.question || 'Type the word.'), answer: String(it?.answer || '').trim(), accept: (Array.isArray(it?.accept) ? it.accept : [it?.answer]).map((v: any) => String(v || '').trim().toLowerCase()).filter(Boolean) };
          return { kind: 'mcq', image, question: String(it?.question || 'What is shown?'), options: cleanOptions(it?.options, 4) };
        }));
        if (!slide.items.length) slide = fbVocab(topic);
      } else {
        slide.passage = String(slide.passage || '').trim();
        const sup = slide.support;
        if (sup?.type === 'image') slide.support = { type: 'image', url: await fillImage(String(sup.prompt || topic)), caption: String(sup.caption || '') };
        else if (sup?.type === 'table' || sup?.type === 'code') slide.support = sanitizeComponents([sup])[0] || null;
        else slide.support = null;
        slide.quiz = { question: String(slide?.quiz?.question || '').trim(), options: cleanOptions(slide?.quiz?.options, 4) };
        if (!slide.passage || !slide.quiz.question) slide = fbReading(topic);
      }
    } catch {
      slide = type === 'grammar' ? fbGrammar(topic) : type === 'vocabulary' ? fbVocab(topic) : fbReading(topic);
    }
  }

  saveGeneration('language-slides', `${b.gameId || 'nogame'}-${type}-${slideNumber}-${crypto.randomUUID().slice(0, 8)}`, {
    username: a.user.username, language, level, topic, grammarTopic, type, slideNumber, slide, fallback: useFallback, createdAt: new Date().toISOString(),
  });
  return NextResponse.json(slide);
}
