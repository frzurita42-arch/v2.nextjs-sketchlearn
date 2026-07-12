import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { subject, prompt, attempt, note, kind, history } -> { reply }
// A text tutor that GUIDES the learner toward the answer without giving it away.
// Used by the "Ask the AI" button on code / multiple-choice / input activities.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const subject = String(b.subject || 'this topic').slice(0, 120);
  const prompt = String(b.prompt || '').slice(0, 800);
  const attempt = String(b.attempt || '').slice(0, 3000);
  const note = String(b.note || '').slice(0, 600);
  const kind = String(b.kind || '').slice(0, 20);
  const history = (Array.isArray(b.history) ? b.history : []).slice(-8)
    .map((m: any) => `${m.role === 'assistant' ? 'You (tutor)' : 'Student'}: ${String(m.text || '').slice(0, 400)}`)
    .join('\n');

  const gentle = 'Good question — try breaking the problem into the smallest first step. What do you already know that applies here?';
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return NextResponse.json({ reply: gentle, checked: false });

  const system = [
    `You are a patient, encouraging tutor for ${subject}.`,
    prompt ? `The student is working on this task: "${prompt}".` : '',
    attempt ? `Their current attempt so far:\n${attempt}` : 'They have not written anything yet.',
    note ? `They asked you: "${note}". Answer THAT, using their attempt for context.` : 'They tapped "ask the AI" without a specific question — nudge them toward the next step.',
    history ? `Conversation so far:\n${history}` : '',
    'HOW TO REPLY — follow ALL of these:',
    '- Keep it SHORT and consistent (usually 1–3 sentences).',
    '- Briefly ACKNOWLEDGE what they said or tried.',
    '- GUIDE them to the NEXT step with a hint or a question. NEVER give the full or direct answer / final solution / the exact code that solves it — lead them to discover it.',
    kind === 'code'
      ? '- If a small illustrative code snippet helps (a pattern or ONE line, NOT the whole solution), put it in a ``` code block ```. Computer science often rests on the math behind it — when the logic is mathematical (complexity, recurrences, boolean algebra, probability…), show it as $$LaTeX$$.'
      : '- If a formula or worked step helps, write math as $$LaTeX$$ (display) and $...$ (inline); use a ``` code block ``` only for real code.',
    '- Stay on the task; gently steer them back if they drift.',
    'Return STRICT JSON: { "reply": "your short guiding reply" }.',
  ].filter(Boolean).join('\n');

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: note || 'Give me a hint for the next step.' }], { temperature: 0.6, maxTokens: 600 });
    return NextResponse.json({ reply: String(r?.reply || gentle).slice(0, 1500), checked: !!r?.reply });
  } catch {
    return NextResponse.json({ reply: gentle, checked: false });
  }
}
