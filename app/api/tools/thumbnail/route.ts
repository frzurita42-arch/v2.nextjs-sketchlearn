import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { imageEnabled, geminiEnabled, openrouterEnabled, deepseekEnabled, moonshotEnabled } from '@/src/config';
import { generateImage, generateSvgSketch, getLastImageError } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
import { emojiThumb, emojiOf, randomEmoji } from '@/lib/emoji-thumb';
import { NO_TEXT_RULE } from '@/lib/image-styles';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, updateTool, setExampleOverride } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

// POST { slug } -> { thumbnail }
// Generates an AI thumbnail for a tool from what it does, saves it (offloaded to
// the blob store when configured so the gallery payload stays light), and returns
// the URL. Each press regenerates/updates the image. Owner/admin only.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');

  // Built-in examples are virtual (not DB rows): an ADMIN may curate them, and the
  // change is saved as an override. Real tools: the owner or an admin edits them.
  const ex = exampleBySlug(slug);
  const tool = ex || await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ex) {
    if (a.user.role !== 'admin') return NextResponse.json({ error: 'Only an admin can edit an example.' }, { status: 403 });
  } else if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can set the thumbnail.' }, { status: 403 });
  }
  const saveThumb = (img: string) => ex ? setExampleOverride(slug, { thumbnail: img }) : updateTool(slug, { thumbnail: img });

  // Set an EMOJI thumbnail (🎲 die / a chosen emoji). No AI needed. 'random' (or
  // a value equal to the current emoji) picks a fresh one different from now.
  if (b.emoji !== undefined) {
    const raw = String(b.emoji || '');
    const current = emojiOf(tool.thumbnail);
    const pic = (raw === 'random' || !raw) ? randomEmoji(current) : raw.slice(0, 8);
    const thumb = emojiThumb(pic);
    await saveThumb(thumb);
    return NextResponse.json({ thumbnail: thumb });
  }

  // A user-provided image (an uploaded blob URL, a pasted https URL, or a data
  // URL) — just save it; no AI model needed. Data URLs are offloaded to the blob
  // store when configured so the gallery payload stays light.
  const provided = String(b.image || '');
  if (provided) {
    if (!(/^https?:\/\//i.test(provided) || /^data:image\//i.test(provided))) {
      return NextResponse.json({ error: 'Not a valid image.' }, { status: 400 });
    }
    let img = provided.slice(0, 1_800_000);
    if (/^data:image\//i.test(img) && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const m = img.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
        if (m) {
          const { put } = await import('@vercel/blob');
          const blob = await put(`thumbs/${slug}-${Date.now()}.png`, Buffer.from(m[2], 'base64'), { access: 'public', addRandomSuffix: true, contentType: m[1] });
          img = blob.url;
        }
      } catch { /* keep the data URL */ }
    }
    await saveThumb(img);
    return NextResponse.json({ thumbnail: img });
  }

  // Need EITHER an image model OR any text model (for the SVG-sketch fallback).
  if (!imageEnabled && !geminiEnabled && !openrouterEnabled && !deepseekEnabled && !moonshotEnabled) {
    return NextResponse.json({ error: 'No image model is configured.' }, { status: 200 });
  }

  const instruction = String(b.instruction || '').slice(0, 400);
  const d = tool.definition || {};
  const subject = d.lesson?.subject || '';
  const desc = String(tool.description || '').slice(0, 180);
  const theme = [tool.title, subject, desc].filter(Boolean).join(' — ');

  // A wide set of settings — everyday life, nature, interiors and city sights — so
  // thumbnails vary. One backdrop is picked at random.
  const SCENES = [
    'a cozy cafe', 'a grocery store', 'a farmers market', 'a sunny beach', 'a school hallway',
    'a university campus lawn', 'a public library', 'an airport / travel', 'a train ride',
    'a lush jungle', 'a mountain summit', 'a hiking trail', 'a country road', 'a gym',
    'a road trip in a car', 'a park', 'a bookstore', 'a museum', 'a hotel lobby', 'a garden',
    'a lakeside', 'a ski slope', 'a street market', 'a rooftop garden at sunset',
    // nature
    'a quiet forest', 'a desert at dawn', 'a waterfall', 'a flower field', 'a starry night sky',
    // interiors / rooms (any building type)
    'a sleek corporate office interior', 'a cozy home living room', 'a warm kitchen',
    'a modern hotel room', 'an artist studio', 'a classroom', 'a workshop',
    // city sights
    'a lively downtown street', 'a city skyline at dusk', 'a rainy neon city street', 'a historic town square',
  ];
  const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
  // Number of people varies — often none. At most two.
  const PEOPLE = [
    'no people at all', 'no people at all', 'no people at all',
    'exactly one man', 'exactly one woman',
    'exactly one man and one woman', 'exactly two men', 'exactly two women',
  ];
  const people = PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
  const hasPeople = people !== 'no people at all';

  const prompt = [
    `A polished, advertising-style photorealistic thumbnail that REPRESENTS a tool — like a tasteful magazine ad or brand photo, NOT a screenshot of someone operating software.`,
    `The tool is about: "${theme}".`,
    `Setting / backdrop: ${scene}. People in the image: ${people} (never more than two).`,
    hasPeople
      ? `Show the ${people === 'no people at all' ? '' : people} TALKING or interacting freely and warmly — emphasize expressive BODY LANGUAGE and FACIAL EXPRESSIONS to convey the tool's feeling and message. Absolutely NO computers, laptops, phones, tablets, screens or devices — no one is "using an app". Their gestures and mood should hint at the tool's purpose. Choose the people from a DIVERSE, randomly-picked mix — vary ethnicity/race across the full real-world range and vary body types naturally; everyone healthy and normal-looking, authentic and respectful, never defaulting to one look.`
      : `With no people, let the setting, nature, interior or city view and a few meaningful everyday objects tell the story and evoke the tool's purpose.`,
    `Represent the tool's idea through everyday objects, gentle visual metaphors and mood. For example: an assignment-grading tool → a relaxed teacher on a morning jog with a thoughtful smile; a collaborative math tool → two students chatting warmly and gesturing on a campus lawn.`,
    `Keep it coherent and believable, warm and uplifting, conveying productivity, cohesion and community engagement. Natural lighting, shallow depth of field, centered composition readable at small thumbnail size.`,
    NO_TEXT_RULE,
    instruction ? `IMPORTANT — also weave in the user's specific request and blend it seamlessly with everything above into ONE coherent image: "${instruction}".` : '',
  ].filter(Boolean).join(' ');

  try {
    let img = await generateImage(prompt);
    // No image model available (e.g. Gemini image generation is unreachable) —
    // fall back to a hand-drawn SVG illustration via the TEXT model, so the 🎨
    // button still produces a picture instead of erroring.
    if (!img) img = await (generateSvgSketch as any)(instruction ? `${theme} — ${instruction}` : theme);
    if (!img) {
      const why = (typeof getLastImageError === 'function' && getLastImageError()) || '';
      return NextResponse.json({ error: why ? `Could not generate an image. ${String(why).slice(0, 400)}` : 'Could not generate an image — try again.' }, { status: 200 });
    }

    // Offload a data: URL to the blob store so we don't store megabytes in the DB
    // and ship them in the gallery list. Fall back to the data URL if no blob.
    if (/^data:image\//i.test(img) && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const m = img.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
        if (m) {
          const { put } = await import('@vercel/blob');
          const buf = Buffer.from(m[2], 'base64');
          const ext = (m[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
          const blob = await put(`thumbs/${slug}-${Date.now()}.${ext}`, buf, { access: 'public', addRandomSuffix: true, contentType: m[1] });
          img = blob.url;
        }
      } catch { /* keep the data URL */ }
    }

    await saveThumb(img);
    return NextResponse.json({ thumbnail: img });
  } catch {
    return NextResponse.json({ error: 'Image generation failed.' }, { status: 200 });
  }
}
