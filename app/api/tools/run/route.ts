import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, deepseekEnabled } from '@/src/config';
import { generateText, generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
import { fillTemplate, validateToolDefinition } from '@/lib/tool-schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// POST { definition, values } -> run a generator tool once, returning its output
// in the shape the tool declared (text | cards | table). Works without an AI key
// via a deterministic placeholder so authored tools are always runnable.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const { ok, def } = validateToolDefinition(b.definition);
  if (!ok || !def || def.archetype !== 'generator' || !def.generator) {
    return NextResponse.json({ error: 'Not a valid generator tool' }, { status: 400 });
  }
  const values = (b.values && typeof b.values === 'object') ? b.values : {};
  const output = def.generator.output;
  const filled = fillTemplate(def.generator.promptTemplate, values);
  const system = def.generator.systemPrompt || 'You are a helpful generator inside a tool-building platform. Follow the instructions precisely and keep output focused and useful.';

  const noAI = !geminiEnabled && !deepseekEnabled;
  if (noAI) {
    if (output === 'cards') {
      return NextResponse.json({ output: 'cards', cards: [
        { title: 'Sample card 1', body: `Generated from: ${filled.slice(0, 120)}` },
        { title: 'Sample card 2', body: 'Connect an AI key (GEMINI_API_KEY) for real output.' },
      ], fallback: true });
    }
    if (output === 'table') {
      return NextResponse.json({ output: 'table', headers: ['Field', 'Value'], rows: Object.entries(values).map(([k, v]) => [k, String(v)]), fallback: true });
    }
    return NextResponse.json({ output: 'text', text: `(Demo mode — no AI connected.)\n\nYour tool would generate from:\n${filled}`, fallback: true });
  }

  try {
    if (output === 'text') {
      const text = await generateText(
        [{ role: 'system', content: system }, { role: 'user', content: filled }],
        { json: false, temperature: 0.7, maxTokens: 1200 }
      );
      return NextResponse.json({ output: 'text', text, fallback: false });
    }
    if (output === 'cards') {
      const shape = `${filled}\n\nReturn STRICT JSON: { "cards": [ { "title": "string", "body": "string" } ] } with 3-8 cards.`;
      const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: shape }], { temperature: 0.7, maxTokens: 2000 });
      const cards = (Array.isArray(r?.cards) ? r.cards : []).slice(0, 12).map((c: any) => ({ title: String(c?.title || '').slice(0, 120), body: String(c?.body || '').slice(0, 800) }));
      return NextResponse.json({ output: 'cards', cards, fallback: false });
    }
    // table
    const shape = `${filled}\n\nReturn STRICT JSON: { "headers": ["col", ...], "rows": [ ["cell", ...], ... ] }.`;
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: shape }], { temperature: 0.5, maxTokens: 2000 });
    const headers = (Array.isArray(r?.headers) ? r.headers : []).map((h: any) => String(h).slice(0, 60)).slice(0, 10);
    const rows = (Array.isArray(r?.rows) ? r.rows : []).slice(0, 50).map((row: any) => (Array.isArray(row) ? row.map((c: any) => String(c).slice(0, 200)).slice(0, 10) : []));
    return NextResponse.json({ output: 'table', headers, rows, fallback: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Generation failed' }, { status: 502 });
  }
}
