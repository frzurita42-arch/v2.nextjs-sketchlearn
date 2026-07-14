import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, moonshotEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const textAI = () => openrouterEnabled || geminiEnabled || deepseekEnabled || moonshotEnabled;

// A small emoji pool for the deterministic fallback (topic-agnostic but friendly).
const FALLBACK_EMOJI = ['📘', '🧠', '🔬', '📐', '🧪', '🌍', '🎨', '🎵', '💡', '⚙️', '📊', '🧭', '🚀', '🌱', '🔎', '📝'];
const pickEmoji = (seed: number) => FALLBACK_EMOJI[Math.abs(seed) % FALLBACK_EMOJI.length];

// Flatten a repo's card tree into a list of topic titles.
function collectTitles(cards: any[], out: string[] = []): string[] {
  for (const c of Array.isArray(cards) ? cards : []) {
    const t = String(c?.title || '').trim();
    if (t) out.push(t);
    if (Array.isArray(c?.children) && c.children.length) collectTitles(c.children, out);
    if (out.length > 60) break;
  }
  return out;
}

// POST { slug, seed? } -> { topics: [{ topic, emoji, blurb }] }
// Ten AI-recommended LEARNABLE topics drawn from a repository's own subjects,
// each with a related emoji + one-line blurb. These become preset cards that
// open the presentation builder seeded with that topic. Any signed-in viewer
// may call it (read-only); falls back to the repo's own titles without a model.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const tool = await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const repo = tool.definition?.repo || {};
  const repoTitle = String(tool.title || repo.title || 'this repository').slice(0, 120);
  const topCards: any[] = Array.isArray(repo.cards) ? repo.cards : [];
  // Top-level unit titles power the "focus on a unit" dropdown.
  const units = topCards.map((c) => String(c?.title || '').trim()).filter(Boolean).slice(0, 40);

  // Optionally focus on ONE unit (a top-level card, by title) — then the topics
  // are drawn from that unit + its sub-cards only. Otherwise use the whole repo.
  const unit = String(b.unit || '').trim();
  const focusCard = unit ? topCards.find((c) => String(c?.title || '').trim() === unit) : null;
  const titles = (focusCard ? collectTitles([focusCard]) : collectTitles(topCards)).slice(0, 40);
  const scope = focusCard ? `the unit "${unit}" of ` : '';

  const fallback = () => {
    // Use the repo's own subjects as topics, padded from the title.
    const base = titles.length ? titles : [repoTitle];
    const topics = [];
    for (let i = 0; i < 10; i++) {
      const t = base[i % base.length];
      topics.push({ topic: String(t).slice(0, 90), emoji: pickEmoji(i * 7 + (t?.length || 0)), blurb: `A lesson about ${String(t).slice(0, 60)}.` });
    }
    return topics;
  };

  if (!textAI() || !titles.length) return NextResponse.json({ topics: fallback(), units, unit: unit || '', ai: false });

  const system = [
    'You suggest topics a learner could study, based on ' + scope + 'a REPOSITORY of subjects on SketchLearn (a community learning platform whose values are positivity, community and engagement).',
    `The repository is "${repoTitle}". ${focusCard ? `Focus ONLY on the unit "${unit}". Its topics are:` : 'Its subjects/units are:'}`,
    titles.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    `Propose EXACTLY 10 specific, engaging topics a learner could turn into a short presentation lesson to understand ${focusCard ? `the unit "${unit}"` : 'any of these subjects'} better. Draw them from and around the subjects above (mix core topics and closely-related ones). Make each concrete (not one word), varied, and genuinely useful.`,
    'Fit the KIND of repository: a course/syllabus → academic explainer topics; a menu/catalogue → topics about individual items (what they are, how they are made, how to choose); a business/action plan → the concrete steps or skills needed to reach the objective. Pick topics that make an engaging lesson.',
    'For EACH topic give a single relevant EMOJI (one emoji, clearly related to that topic) and a short one-sentence blurb (why it is worth learning).',
    'Return STRICT JSON: { "topics": [ { "topic": string, "emoji": "one emoji", "blurb": string } x10 ] }.',
  ].join('\n');

  try {
    const r: any = await generateStructured(
      [{ role: 'system', content: system }, { role: 'user', content: 'Suggest 10 topics.' }],
      { temperature: 0.9, maxTokens: 1200, provider: String(b.provider || 'auto') });
    const emojiOf = (s: any) => { const m = String(s || '').match(/\p{Extended_Pictographic}/u); return m ? m[0] : ''; };
    const topics = (Array.isArray(r?.topics) ? r.topics : [])
      .map((t: any, i: number) => ({
        topic: String(t?.topic || '').slice(0, 90),
        emoji: emojiOf(t?.emoji) || pickEmoji(i * 5),
        blurb: String(t?.blurb || '').slice(0, 160),
      }))
      .filter((t: any) => t.topic)
      .slice(0, 10);
    return NextResponse.json({ topics: topics.length ? topics : fallback(), units, unit: unit || '', ai: topics.length > 0 });
  } catch {
    return NextResponse.json({ topics: fallback(), units, unit: unit || '', ai: false });
  }
}
