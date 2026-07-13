import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateText } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { question, subject?, topic? } -> { answer }
// Backs a Studio "Button (Ask the AI)" component: a learner asks a question about
// the lesson and gets a short, friendly answer pitched to the lesson's subject.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const question = String(b.question || '').slice(0, 600).trim();
  if (!question) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ answer: 'No AI model is connected right now, so I can\'t answer — but great question! Ask your teacher or try again once a provider is set up.' });
  }
  const subject = String(b.subject || '').slice(0, 80);
  const topic = String(b.topic || '').slice(0, 120);
  const system = [
    'You are a warm, encouraging tutor inside a SketchLearn lesson.',
    subject ? `The lesson is about: ${subject}${topic ? ` (focus: ${topic})` : ''}.` : '',
    'Answer the learner\'s question clearly and briefly (2-5 sentences), at a helpful level. Be accurate; if it is outside the lesson, still help kindly. No markdown headings.',
  ].filter(Boolean).join(' ');
  try {
    const answer = await generateText([{ role: 'system', content: system }, { role: 'user', content: question }], { temperature: 0.5, maxTokens: 400 });
    return NextResponse.json({ answer: String(answer || '').slice(0, 1500) || 'Sorry, I could not think of an answer — try rephrasing.' });
  } catch {
    return NextResponse.json({ error: 'Could not reach the AI — try again.' }, { status: 200 });
  }
}
