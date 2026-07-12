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
  const subject = String(b.subject || '').slice(0, 160);
  const image = String(b.image || '');
  const note = String(b.note || '').slice(0, 800);
  const pageCount = Math.max(1, parseInt(b.pageCount, 10) || 1);
  const history = (Array.isArray(b.history) ? b.history : []).slice(-10)
    .map((m: any) => `${m.role === 'assistant' ? 'You (tutor)' : 'Student'}: ${String(m.text || '').slice(0, 500)}`)
    .join('\n');
  if (!image.startsWith('data:image')) return NextResponse.json({ error: 'Write or draw your message first.' }, { status: 400 });

  const prompt = [
    subject ? `You are a patient, encouraging tutor helping a student with: ${subject}.` : 'You are a patient, encouraging tutor.',
    `The IMAGE is the student's ENTIRE notebook — ALL ${pageCount} page(s) stacked vertically, top to bottom${pageCount > 1 ? ', each preceded by a "— Page N of ' + pageCount + ' —" label' : ''}. You CAN see every page; read the whole tall image from top to bottom. If the student refers to a specific page, look at that labelled section. NEVER say you don't have access to earlier/other pages — they are all here in this one image.`,
    note ? `The student also TYPED: "${note}". Use it to understand exactly what they're asking, their sentiment, and their goal, and answer that.` : 'The student did not type a note; respond to what they wrote/drew.',
    history ? `Conversation so far:\n${history}` : 'This is the first message.',
    'HOW TO REPLY — follow ALL of these:',
    '- Keep it SHORT and concise (usually 1–3 sentences). No walls of text.',
    '- First, briefly ACKNOWLEDGE what they said or showed (e.g. "Yes, I can see your work.").',
    '- Then GUIDE them to the NEXT step only — a hint or a question that nudges them forward. Do NOT give the full solution or the final answer; lead them to it step by step.',
    '- Stay focused on solving the current problem; if they drift off-topic, gently steer them back.',
    '- If a hint needs code or an equation/step, put just that part inside a triple-backtick ``` code block ``` (prose stays outside it).',
    'Return STRICT JSON: { "reply": "your short guiding reply" }.',
  ].join('\n');

  try {
    const r: any = await generateVisionJSON(prompt, image);
    if (!r || !r.reply) return NextResponse.json({ reply: 'Got your note. (Connect an AI vision key to get a written reply here.)', checked: false });
    return NextResponse.json({ reply: String(r.reply).slice(0, 1200), checked: true });
  } catch {
    return NextResponse.json({ reply: 'Saved your message (could not reach the tutor this time).', checked: false });
  }
}
