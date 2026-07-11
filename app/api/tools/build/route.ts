import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition } from '@/lib/tool-schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Heuristic (no-AI) builder: turn the user's description straight into a valid,
// editable Tool Definition so the Builder always produces something runnable.
function heuristicProposal(text: string) {
  const t = text.toLowerCase();
  // Strong storage nouns => app; explicit generation verbs => generator; then weak signals.
  const strongApp = /\b(store|storage|track|tracker|journal|library|catalog|catalogue|repository|directory|inventory|log|collection|database|bookmark|planner|gallery)\b/.test(t);
  const genVerb = /\b(generate|produce|write|draft|compose|summar|essay|outline|ideas|suggestions?|plan out)\b/.test(t);
  const archetype = strongApp ? 'app' : genVerb ? 'generator' : /\b(list|collect|save)\b/.test(t) ? 'app' : 'generator';
  const title = (text.trim().split(/[.,\n]/)[0] || 'My Tool').replace(/^(a|an|make|build|create|i want|i'd like)\s+/i, '').slice(0, 60) || 'My Tool';

  if (archetype === 'app') {
    const fields: any[] = [{ id: 'title', label: 'Title', type: 'text', required: true }];
    if (/\blink|url\b/.test(t)) fields.push({ id: 'link', label: 'Link', type: 'text' });
    if (/\bdate|due|deadline|schedule\b/.test(t)) fields.push({ id: 'date', label: 'Date', type: 'date' });
    if (/\blevel|category|topic|type|tag\b/.test(t)) fields.push({ id: 'category', label: 'Category', type: 'select-or-custom', options: ['General', 'Beginner', 'Intermediate', 'Advanced'] });
    fields.push({ id: 'notes', label: 'Notes', type: 'textarea' });
    return { archetype, title, description: text.slice(0, 300), tags: [], settings: [], app: { entryFields: fields, display: 'cards', review: false } };
  }
  const output = /\bcards?|ideas|list|items|steps\b/.test(t) ? 'cards' : /\btable|rows|columns|data\b/.test(t) ? 'table' : 'text';
  return {
    archetype, title, description: text.slice(0, 300), tags: [],
    settings: [{ id: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'What should it be about?' }],
    generator: { promptTemplate: `Based on this request: "${text.slice(0, 200)}". Produce output about: {{topic}}.`, output },
  };
}

const PALETTE = `Field types: text, textarea, number, select (needs options), select-or-custom (dropdown the user can override), toggle, date.
Archetypes:
- "generator": settings[] (the inputs) + generator.promptTemplate (use {{fieldId}} placeholders) + generator.output ("text" | "cards" | "table").
- "app": app.entryFields[] (fields per stored record) + app.display ("cards" | "list" | "table") + app.review (bool: new entries need owner approval).`;

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const messages: any[] = Array.isArray(b.messages) ? b.messages.slice(-16) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

  if (!geminiEnabled && !deepseekEnabled) {
    const raw = heuristicProposal(String(lastUser || 'a simple tool'));
    const { def } = validateToolDefinition(raw);
    return NextResponse.json({ kind: 'proposal', definition: def, summary: 'Assembled a starter tool from your description (no AI connected — edit or publish as-is).' });
  }

  const system = [
    'You are a Tool Builder. Through a short chat you help the user design a "tool" that the platform will run.',
    'You compose ONLY from the fixed palette below — never invent code or components.',
    PALETTE,
    'On each turn, return STRICT JSON that is EITHER a clarifying question OR a finished proposal:',
    '{ "kind": "question", "question": "one short question", "options": ["opt1","opt2","opt3"], "field": "what this decides" }',
    'OR',
    '{ "kind": "proposal", "summary": "one sentence", "definition": { ...a full Tool Definition... } }',
    'Ask at most 2-3 questions total, then propose. Keep questions short and always give 2-4 concrete options (the user can also type a custom answer). Prefer proposing once you have enough to make something useful.',
  ].join('\n');

  try {
    const convo = messages.map((m) => `${m.role === 'assistant' ? 'Builder' : 'User'}: ${String(m.content).slice(0, 800)}`).join('\n');
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: `Conversation so far:\n${convo}\n\nReturn the next JSON (question or proposal).` }],
      { temperature: 0.6, maxTokens: 1500 }
    );
    if (r?.kind === 'proposal') {
      const { ok, def } = validateToolDefinition(r.definition);
      if (ok) return NextResponse.json({ kind: 'proposal', definition: def, summary: String(r.summary || 'Here is a tool based on what you described.') });
      // invalid proposal -> fall back to heuristic so the user still gets something
      const { def: hdef } = validateToolDefinition(heuristicProposal(String(lastUser)));
      return NextResponse.json({ kind: 'proposal', definition: hdef, summary: 'Here is a starter version — tweak it or publish.' });
    }
    return NextResponse.json({
      kind: 'question',
      question: String(r?.question || 'What should this tool do?'),
      options: (Array.isArray(r?.options) ? r.options : []).map((o: any) => String(o).slice(0, 60)).slice(0, 4),
      field: String(r?.field || ''),
    });
  } catch {
    const { def } = validateToolDefinition(heuristicProposal(String(lastUser || 'a simple tool')));
    return NextResponse.json({ kind: 'proposal', definition: def, summary: 'Assembled a starter tool from your description.' });
  }
}
