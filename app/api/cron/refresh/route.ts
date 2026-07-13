import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled, imageEnabled } from '@/src/config';
import { generateStructured, generateImage } from '@/src/ai/providers';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTools, updateTool } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Scheduled "content diversity" job: pick ONE random tool and gently distort its
// title + description (same meaning, reworded) and, some of the time, regenerate
// its thumbnail — simulating slow, progressive user-like interaction.
//
// Protected by CRON_SECRET (Vercel Cron sends it as a Bearer header). If no secret
// is configured, the endpoint refuses to run. Wire it up in vercel.json.
function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  return h === `Bearer ${secret}` || url.searchParams.get('key') === secret;
}

async function run() {
  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) return { skipped: 'no AI model' };
  // Eligible: real (non-example) tools. (listTools with viewerIsAdmin sees all.)
  const all = await listTools({ viewerIsAdmin: true, limit: 200 });
  const pool = (all || []).filter((t: any) => !(t.tags || []).includes('example') && t.slug);
  if (!pool.length) return { skipped: 'no tools' };
  // Vercel's Hobby plan runs crons at most once/day, so do 1-2 DISTINCT tools per
  // run to preserve the "1-2 gentle remixes a day" content-diversity cadence.
  const want = Math.min(pool.length, 1 + (Math.random() < 0.5 ? 1 : 0));
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, want);
  const done = [];
  for (const t of shuffled) done.push(await refreshOne(t));
  return { refreshed: done };
}

async function refreshOne(t: any) {
  const d = t.definition || {};

  // 1) Reword title + description (meaning preserved, platform voice).
  const system = [
    'You are the warm curator of SketchLearn, a community platform of AI-built tools.',
    'Reword this tool\'s TITLE and DESCRIPTION so they mean the SAME thing but are phrased a little differently — a small, gentle distortion, in a friendly voice reflecting positivity, cohesion and engagement. Stay accurate; do not invent features.',
    `Tool type: ${d.archetype || t.archetype}. Current title: "${t.title}". Current description: "${t.description || ''}".`,
    d.lesson?.subject ? `Subject: ${d.lesson.subject}.` : '',
    'Title <= ~8 words. Description 1-3 sentences. Return STRICT JSON: { "title": "...", "description": "..." }.',
  ].filter(Boolean).join('\n');
  let title = t.title, description = t.description || '';
  try {
    const r: any = await generateStructured([{ role: 'system', content: system }, { role: 'user', content: 'Reword it.' }], { temperature: 0.85, maxTokens: 300 });
    title = String(r?.title || '').replace(/^["']|["']$/g, '').slice(0, 100) || t.title;
    description = String(r?.description || '').slice(0, 400) || t.description || '';
  } catch { /* keep originals */ }
  const patch: any = { title, description };

  // 2) Regenerate the thumbnail ~1 in 3 runs (keeps image cost down).
  let newThumb = false;
  if ((imageEnabled || geminiEnabled) && Math.random() < 0.34) {
    try {
      const img = await generateImage(`A warm, advertising-style photorealistic thumbnail representing a tool about "${[t.title, d.lesson?.subject, description].filter(Boolean).join(' — ')}", set in an everyday scene with at most two expressive people (or none), conveying productivity, cohesion and engagement. No text.`);
      if (img && process.env.BLOB_READ_WRITE_TOKEN && /^data:image\//i.test(img)) {
        const m = img.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
        if (m) { const { put } = await import('@vercel/blob'); const blob = await put(`thumbs/${t.slug}-${Date.now()}.png`, Buffer.from(m[2], 'base64'), { access: 'public', addRandomSuffix: true, contentType: m[1] }); patch.thumbnail = blob.url; newThumb = true; }
      } else if (img) { patch.thumbnail = img; newThumb = true; }
    } catch { /* skip image */ }
  }

  await updateTool(t.slug, patch);
  return { refreshed: t.slug, title, newThumb };
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json(await run()); }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 }); }
}
export const POST = GET;
