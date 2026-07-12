import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition } from '@/lib/tool-schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PALETTE = `Field types: text, textarea, number, select (options), select-or-custom, toggle, date, image, audio, drawing.
Archetypes: "generator" (settings + generator.promptTemplate + generator.output text|cards|table),
"app" (app.entryFields + app.display cards|list|table + app.review),
"lesson" (settings + lesson{subject,totalSlides,language,translateTo,style} — a playable scored slide deck).
The platform already provides author, likes, comments — never add those fields.`;

// POST { definition, request } -> a MODIFIED tool definition per the user's edit
// request. Returns the new definition (validated) + a short summary of the change.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const current = b.definition || {};
  const request = String(b.request || '').slice(0, 800).trim();
  if (!request) return NextResponse.json({ error: 'Describe the change you want.' }, { status: 400 });

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json({ error: 'Editing with AI needs an AI key (GEMINI_API_KEY). You can still edit fields manually.' }, { status: 503 });
  }
  try {
    const system = [
      'You EDIT an existing tool definition. Apply the user\'s requested change and return the FULL updated definition.',
      'Keep everything else the same; change only what was asked. Preserve the archetype unless the user clearly wants a different kind of tool.',
      PALETTE,
      'Return STRICT JSON: { "summary": "one sentence describing what you changed", "definition": { ...the full updated tool definition... } }',
    ].join('\n');
    const user = `Current definition:\n${JSON.stringify(current).slice(0, 4000)}\n\nRequested change: ${request}`;
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { temperature: 0.4, maxTokens: 2000 }
    );
    const { ok, def, errors } = validateToolDefinition(r?.definition);
    if (!ok || !def) return NextResponse.json({ error: 'The edit produced an invalid tool.', details: errors }, { status: 422 });
    return NextResponse.json({ definition: def, summary: String(r?.summary || 'Updated the tool.') });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Edit failed' }, { status: 502 });
  }
}
