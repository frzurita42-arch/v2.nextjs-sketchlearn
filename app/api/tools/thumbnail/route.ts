import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { imageEnabled, geminiEnabled } from '@/src/config';
import { generateImage } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, updateTool } = require('@/src/db/platform');

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

  const tool = await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((tool.tags || []).includes('example')) return NextResponse.json({ error: 'Example tools cannot be edited.' }, { status: 400 });
  if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can set the thumbnail.' }, { status: 403 });
  }
  if (!imageEnabled && !geminiEnabled) {
    return NextResponse.json({ error: 'No image model is configured.' }, { status: 200 });
  }

  const d = tool.definition || {};
  const subject = d.lesson?.subject || '';
  const desc = String(tool.description || '').slice(0, 180);
  const theme = [tool.title, subject, desc].filter(Boolean).join(' — ');

  // A wide set of everyday-life settings so thumbnails vary — the idea for / use of
  // the tool captured wherever inspiration strikes. One is picked at random.
  const SCENES = [
    'a cozy cafe with latte art and steamy windows', 'a bustling coffee shop counter',
    'a grocery store aisle with a shopping cart', 'a colorful farmers market stall',
    'a sunny beach at golden hour', 'a lively school classroom', 'a university lecture hall',
    'a warm public library among tall bookshelves', 'a busy airport terminal with luggage',
    'a train window seat watching the countryside', 'a lush green jungle with sunlight through leaves',
    'a windy mountain summit above the clouds', 'a scenic hiking trail with a backpack',
    'cycling on a country road at sunrise', 'a bright modern gym / fitness studio',
    'inside a car on a road trip, hands on the wheel', 'a tech expo / conference booth with crowds',
    'a home kitchen table covered in notes', 'a quiet park bench under a tree',
    'a rooftop terrace at sunset over the city', 'a friendly co-working space',
    'a charming independent bookstore', 'a museum gallery', 'a subway car in motion',
    'friends around a campfire at night', 'a blooming backyard garden', 'a maker/craft workshop',
    'a food truck festival', 'a boat on a calm lake', 'a ski lodge in winter',
  ];
  const scene = SCENES[Math.floor(Math.random() * SCENES.length)];

  const prompt = [
    `A warm, inviting, cinematic photorealistic thumbnail set in ${scene}.`,
    `In that setting, show a diverse person (or a few people) having the idea for — or joyfully using — a tool about: "${theme}". Surround them with objects and details that clearly evoke this exact topic.`,
    'Capture genuine emotion and sentiment through their expressions and body language — a spark of inspiration, focus, collaboration and delight — conveying the platform\'s core messages of productivity, cohesion and community engagement.',
    `You MAY include the tool's name "${tool.title}" as one clean, tastefully hand-lettered sign or note within the scene (spelled correctly); otherwise avoid random text.`,
    'Bright, uplifting, editorial-photo style, natural lighting, shallow depth of field. Composition centered and readable at small thumbnail size.',
  ].join(' ');

  try {
    let img = await generateImage(prompt);
    if (!img) return NextResponse.json({ error: 'Could not generate an image — try again.' }, { status: 200 });

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

    await updateTool(slug, { thumbnail: img });
    return NextResponse.json({ thumbnail: img });
  } catch {
    return NextResponse.json({ error: 'Image generation failed.' }, { status: 200 });
  }
}
