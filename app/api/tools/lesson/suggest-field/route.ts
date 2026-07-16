import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { lesson, field:{ id, label, options? }, values } -> { value }
// Suggests ONE value for a single create-form field (Topic, Tone, Level, Slides,
// Custom instructions…). It reads the author's OTHER current settings — especially
// the Custom instructions box — so the suggestion is consistent with them.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const lesson = b.lesson || {};
  const field = b.field || {};
  const id = String(field.id || '');
  const label = String(field.label || id || 'value').slice(0, 60);
  const options: string[] = (Array.isArray(field.options) ? field.options : []).map((o: any) => String(o)).slice(0, 40);
  const values = (b.values && typeof b.values === 'object') ? b.values : {};

  const subject = String(lesson.subject || '').slice(0, 80);
  const language = String(lesson.language || '').slice(0, 40);
  const title = String(lesson.title || '').slice(0, 120);
  // Everything the author has already set — the model keeps the suggestion consistent
  // with these (custom instructions weigh most).
  const custom = String(values.custom || values.customInstructions || '').slice(0, 500);
  const context = Object.entries(values)
    .filter(([k, v]) => k !== id && typeof v !== 'object' && String(v ?? '').trim() && !/^(sup_|__)/.test(k))
    .map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`)
    .join('; ')
    .slice(0, 700);

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    // No AI — fall back to the first option (selects) or empty (free text).
    return NextResponse.json({ value: options[0] || '' });
  }

  const system = [
    `Suggest ONE concise value for the "${label}" field when creating a ${subject || 'lesson'} lesson${language ? ` (language: ${language})` : ''}.`,
    title ? `Tool: ${title}.` : '',
    custom ? `The author's CUSTOM INSTRUCTIONS (weigh these most — the suggestion must fit them): ${custom}` : '',
    context ? `The author's other current settings: ${context}.` : '',
    options.length
      ? `Choose EXACTLY ONE of these allowed options, copied verbatim: ${options.join(' | ')}.`
      : (id === 'slides'
        ? 'Return a single whole number (a sensible slide count, 3–12).'
        : (/(topic|title)/i.test(id)
          ? 'Return a specific, engaging topic — a short phrase (no more than ~8 words), not a sentence.'
          : (/(custom|instruction)/i.test(id)
            ? 'Return one short, useful instruction sentence for the lesson generator.'
            : 'Return a short, sensible value (a few words).'))),
    'Return STRICT JSON only: { "value": "..." }. No commentary.',
  ].filter(Boolean).join('\n');
  const user = `Suggest the "${label}".`;

  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.9, maxTokens: 200 });
    let value = String(r?.value ?? '').replace(/^["']|["']$/g, '').trim().slice(0, 300);
    // For a select, snap to an allowed option (exact, else case-insensitive match).
    if (options.length && !options.includes(value)) {
      const hit = options.find((o) => o.toLowerCase() === value.toLowerCase()) || options.find((o) => o.toLowerCase().includes(value.toLowerCase()));
      value = hit || options[0];
    }
    return NextResponse.json({ value });
  } catch {
    return NextResponse.json({ value: options[0] || '' });
  }
}
