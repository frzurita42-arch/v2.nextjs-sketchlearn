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
  const prompt = [
    'A cinematic, photorealistic scene: a warm, lived-in 1990s architectural design studio / woodworking workshop.',
    'A large cork bulletin board is pinned full of hand-drawn sketches, blueprints, index cards and reference photos; nearby are drafting tools, rulers, pencils in jars, scale models, wood shavings and a brass desk lamp casting warm light — an analog, hand-crafted "SketchLearn" design-studio atmosphere.',
    `Fill the scene with objects, models, pinned drawings and props clearly related to the theme of this tool: "${theme}". Everything on the board and desk should evoke that specific subject.`,
    'Shallow depth of field, soft warm lighting, rich wood-and-paper textures, subtle film-photo grain, editorial still-life composition.',
    'Absolutely NO text, NO letters, NO numbers, NO words anywhere in the image.',
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
