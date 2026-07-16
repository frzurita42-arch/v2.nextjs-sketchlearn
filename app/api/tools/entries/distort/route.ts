import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { imageEnabled, geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured, generateImage } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, getEntry, updateEntryData } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// POST /api/tools/entries/distort { slug, entryId, action, ... }
// Gives a rendition card the SAME "AI-changing distortion" powers as a tool card:
//   action 'remix'  -> reword its display title + subtitle (same meaning)
//   action 'image'  -> generate an AI thumbnail (optional `instruction`)
//   action 'set'    -> save a typed title/description and/or a provided image
// Distortions live on the entry's `data` (data.title / data.subtitle /
// data.thumbnail) so the feed card can show them. Author, owner, or admin only.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  // Resolve real DB tools AND built-in virtual example/admin tools (whose
  // renditions live under the slug), so their cards can be edited too.
  const tool = (await getToolBySlug(String(b.slug || ''))) || exampleBySlug(String(b.slug || ''));
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const entry = await getEntry(String(b.entryId || ''));
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  const isOwner = tool.owner === a.user.username || a.user.role === 'admin';
  if (!(isOwner || entry.username === a.user.username)) {
    return NextResponse.json({ error: 'You can only edit your own renditions.' }, { status: 403 });
  }

  const d = entry.data || {};
  const action = String(b.action || '');
  const subject = tool.definition?.lesson?.subject || '';
  const curTitle = String(d.title || [subject, d.level || d.difficulty, d.topic].filter(Boolean).join(' · ') || 'Activity');
  const curDesc = String(d.subtitle || d.why || '');

  // --- Manual set (typed text and/or a provided/uploaded image URL). ---
  if (action === 'set') {
    const patch: any = {};
    if (typeof b.title === 'string') patch.title = b.title.slice(0, 120);
    if (typeof b.subtitle === 'string') patch.subtitle = b.subtitle.slice(0, 400);
    const provided = String(b.image || '');
    if (provided) {
      // An "emoji:X" thumbnail (the 🎲 random-emoji button) is stored as-is.
      if (/^emoji:/.test(provided)) {
        patch.thumbnail = provided.slice(0, 40);
        const data = await updateEntryData(entry.id, patch);
        return NextResponse.json({ data });
      }
      if (!(/^https?:\/\//i.test(provided) || /^data:image\//i.test(provided))) {
        return NextResponse.json({ error: 'Not a valid image.' }, { status: 400 });
      }
      let img = provided.slice(0, 1_800_000);
      if (/^data:image\//i.test(img) && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const m = img.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
          if (m) {
            const { put } = await import('@vercel/blob');
            const blob = await put(`renditions/${entry.id}-${Date.now()}.png`, Buffer.from(m[2], 'base64'), { access: 'public', addRandomSuffix: true, contentType: m[1] });
            img = blob.url;
          }
        } catch { /* keep the data URL */ }
      }
      patch.thumbnail = img;
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to set.' }, { status: 400 });
    const data = await updateEntryData(entry.id, patch);
    return NextResponse.json({ data });
  }

  // --- AI reword of the title + subtitle (same meaning, platform voice). ---
  if (action === 'remix') {
    if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
      return NextResponse.json({ error: 'No text model is configured.' }, { status: 200 });
    }
    const system = [
      'You are the warm curator of SketchLearn, a community of AI-built learning tools.',
      'Reword this activity\'s TITLE and a short SUBTITLE so they mean the same thing, phrased a little differently — a gentle distortion in a friendly voice reflecting positivity, cohesion and engagement. Stay accurate; invent nothing.',
      `Activity subject: ${subject || 'general'}. Current title: "${curTitle}". Current subtitle: "${curDesc}".`,
      'Title <= ~8 words. Subtitle 1 short sentence. Return STRICT JSON: { "title": "...", "subtitle": "..." }.',
    ].join('\n');
    try {
      const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: 'Reword it.' }], { temperature: 0.85, maxTokens: 200 });
      const patch: any = {
        title: String(r?.title || '').replace(/^["']|["']$/g, '').slice(0, 120) || curTitle,
        subtitle: String(r?.subtitle || '').slice(0, 400) || curDesc,
      };
      const data = await updateEntryData(entry.id, patch);
      return NextResponse.json({ data });
    } catch {
      return NextResponse.json({ error: 'Reword failed — try again.' }, { status: 200 });
    }
  }

  // --- AI thumbnail generation. ---
  if (action === 'image') {
    if (!imageEnabled && !geminiEnabled) {
      return NextResponse.json({ error: 'No image model is configured.' }, { status: 200 });
    }
    const instruction = String(b.instruction || '').slice(0, 400);
    const theme = [curTitle, subject, curDesc].filter(Boolean).join(' — ');
    // Optional performance reflection (0-100): the just-finished run's score, shown
    // ONLY as a subtle shift in mood / body language — never as text or numbers.
    const perfRaw = b.perf;
    const perf = (typeof perfRaw === 'number' && perfRaw >= 0 && perfRaw <= 100) ? Math.round(perfRaw) : null;
    const perfMood = perf == null ? '' :
      perf >= 80 ? `Subtly reflect a strong result: the mood is quietly confident and accomplished — a calm, warm smile and relaxed, open, gently triumphant body language.`
      : perf >= 50 ? `Subtly reflect a solid, mid-journey result: the mood is steady, focused and encouraged — hopeful, engaged body language, clearly making progress.`
      : `Subtly reflect an early-stage result: the mood is gently determined and reflective — thoughtful, resilient, room-to-grow body language. Never sad, negative or discouraging.`;
    const prompt = [
      `A warm, advertising-style photorealistic thumbnail that REPRESENTS a learning activity — like a tasteful magazine ad, NOT a screenshot of software.`,
      `The activity is about: "${theme}".`,
      `Set it in an everyday scene with at most two expressive people (or none) — talking or interacting warmly, no computers, phones or screens. Let mood, body language and a few everyday objects tell the story.`,
      // Diversity: real-world variety, randomly chosen, never a single default look.
      `If people appear, feature a DIVERSE, randomly-chosen mix — vary ethnicity/race across the full real-world range and vary body types naturally; everyone healthy and normal-looking, authentic and respectful. Do not default to one look.`,
      perfMood,
      `Convey any feeling ONLY through expression, mood and body language — never through text, numbers, charts, checkmarks or score indicators.`,
      `Natural lighting, shallow depth of field, centered and readable at small size. No text or watermarks.`,
      instruction ? `Also weave in the user's request seamlessly: "${instruction}".` : '',
    ].filter(Boolean).join(' ');
    try {
      let img = await generateImage(prompt);
      if (!img) return NextResponse.json({ error: 'Could not generate an image — try again.' }, { status: 200 });
      if (/^data:image\//i.test(img) && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const m = img.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
          if (m) {
            const { put } = await import('@vercel/blob');
            const ext = (m[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
            const blob = await put(`renditions/${entry.id}-${Date.now()}.${ext}`, Buffer.from(m[2], 'base64'), { access: 'public', addRandomSuffix: true, contentType: m[1] });
            img = blob.url;
          }
        } catch { /* keep data URL */ }
      }
      const patch: any = { thumbnail: img };
      if (perf != null) { patch.score = perf; patch.perfBand = perf >= 80 ? 'strong' : perf >= 50 ? 'solid' : 'early'; }
      const data = await updateEntryData(entry.id, patch);
      return NextResponse.json({ data });
    } catch {
      return NextResponse.json({ error: 'Image generation failed.' }, { status: 200 });
    }
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
