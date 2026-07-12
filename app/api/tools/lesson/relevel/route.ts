import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { levelDepthGuidance } = require('@/src/ai/level-depth');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { subject, topic, title, content, translation, level, language, translateTo,
//        paragraphs, length }
//   -> { content, translation }
// Re-explains the SAME slide idea at a different level: not just longer/shorter,
// but deeper and more technical as the level rises (or extra-simple at Zero).
// Keeps the questions/support untouched — only the teaching text changes.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const content = String(b.content || '').slice(0, 2500);
  const level = String(b.level || 'Beginner').slice(0, 40);
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json({ content, translation: String(b.translation || '') });

  const subject = String(b.subject || 'the topic').slice(0, 80);
  const topic = String(b.topic || '').slice(0, 120);
  const title = String(b.title || '').slice(0, 120);
  const language = String(b.language || '').slice(0, 40);
  const translateTo = String(b.translateTo || 'English').slice(0, 40);
  const paras = Math.max(1, Math.min(4, parseInt(b.paragraphs, 10) || 1));
  const pLen = ['brief', 'medium', 'detailed'].includes(b.length) ? b.length : 'medium';

  const system = [
    `Re-explain ONE ${subject} teaching text${topic ? ` about ${topic}` : ''} at ${level} level.`,
    title ? `Slide title: ${title}.` : '',
    `LEVEL DEPTH (${level}): ${levelDepthGuidance(level)}`,
    'Keep the SAME core idea and facts — do not change the topic. Only change the depth, technicality and phrasing to fit the level.',
    language
      ? `This is a ${language} lesson: write "content" in ${language} and the ${translateTo} meaning in "translation".`
      : `Write "content" as ${paras} ${pLen} paragraph(s) of plain teaching prose. Leave "translation" empty.`,
    'For math/science you may use inline $...$ LaTeX for symbols. Return STRICT JSON: { "content": "...", "translation": "..." }.',
  ].filter(Boolean).join('\n');
  const user = `Original text to re-explain at ${level}:\n${content}`;

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.6, maxTokens: 1600 });
    const out = String(r?.content || '').trim();
    return NextResponse.json({
      content: (out || content).slice(0, 2500),
      translation: String(r?.translation || '').slice(0, 800),
    });
  } catch {
    return NextResponse.json({ content, translation: String(b.translation || '') });
  }
}
