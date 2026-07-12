import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateVisionJSON } = require('@/src/ai/providers');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// POST { subject, history:[{role,text}], image } -> the AI reads the learner's
// hand-written / drawn message (the image) in the context of the conversation so
// far and replies with a short text answer shown at the top of the chat. Falls
// back to a gentle acknowledgement when no vision key is configured.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const subject = String(b.subject || '').slice(0, 120);
  const image = String(b.image || '');
  const history = (Array.isArray(b.history) ? b.history : []).slice(-10)
    .map((m: any) => `${m.role === 'assistant' ? 'You (assistant)' : 'Learner'}: ${String(m.text || '').slice(0, 500)}`)
    .join('\n');
  if (!image.startsWith('data:image')) return NextResponse.json({ error: 'Write or draw your message first.' }, { status: 400 });

  const prompt = [
    subject ? `You are a helpful, encouraging tutor for: ${subject}.` : 'You are a helpful, encouraging tutor.',
    'This is a hand-written conversation. The IMAGE contains the learner\'s newest message — read their handwriting/drawing carefully (it may span a tall page).',
    history ? `Conversation so far:\n${history}` : 'This is the first message.',
    'Reply with a clear, concise, helpful answer to what they wrote/drew. If they asked a question, answer it; if they showed work, respond to it. Keep it to a short paragraph.',
    'If your reply contains any code, an equation derivation, or step-by-step working, put that part inside a triple-backtick ``` code block ``` so it renders in a code box; keep ordinary explanation as plain prose outside the block.',
    'Return STRICT JSON: { "reply": "your answer (may contain a ``` code block ```)" }.',
  ].join('\n');

  try {
    const r: any = await generateVisionJSON(prompt, image);
    if (!r || !r.reply) return NextResponse.json({ reply: 'Got your note. (Connect an AI vision key to get a written reply here.)', checked: false });
    return NextResponse.json({ reply: String(r.reply).slice(0, 1200), checked: true });
  } catch {
    return NextResponse.json({ reply: 'Saved your message (could not reach the tutor this time).', checked: false });
  }
}
