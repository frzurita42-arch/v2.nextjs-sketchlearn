import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// POST { subject, history:[{role,text}] } -> a short written report/recap of the
// whole canvas conversation, used when the learner exits and publishes it.
// Falls back to a simple recap when no AI is configured.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const subject = String(b.subject || '').slice(0, 120);
  const turns = (Array.isArray(b.history) ? b.history : []).slice(-20);
  const transcript = turns
    .map((m: any) => `${m.role === 'assistant' ? 'Tutor' : 'Me'}: ${String(m.text || '').slice(0, 500)}`)
    .join('\n');

  const fallback = () => {
    const topics = turns.filter((m: any) => m.role !== 'assistant').length;
    return `A hand-written ${subject || 'conversation'} with ${topics} message${topics === 1 ? '' : 's'}.`;
  };

  if (!geminiEnabled && !deepseekEnabled || !transcript) {
    return NextResponse.json({ report: fallback(), ai: false });
  }
  const system = [
    subject ? `Summarise this hand-written tutoring conversation about ${subject}.` : 'Summarise this hand-written conversation.',
    'Write a short, friendly recap (3-5 sentences): what was discussed, key points or answers, and one takeaway. Plain text.',
    'Return STRICT JSON: { "report": "the recap" }.',
  ].join('\n');
  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: transcript }], { temperature: 0.4, maxTokens: 400 });
    return NextResponse.json({ report: String(r?.report || fallback()).slice(0, 1500), ai: !!r?.report });
  } catch {
    return NextResponse.json({ report: fallback(), ai: false });
  }
}
