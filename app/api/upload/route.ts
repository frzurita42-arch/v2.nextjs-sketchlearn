import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST multipart { file } -> uploads the image to the blob store (Vercel Blob)
// and returns { url }. The image lives on a CDN; only the URL is stored in the DB.
// When BLOB_READ_WRITE_TOKEN isn't configured, returns 501 so the client falls
// back to an inline data URL (no crash, just heavier).
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'blob-not-configured' }, { status: 501 });
  }
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch { /* not multipart */ }
  if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  if (!/^image\//.test(file.type)) return NextResponse.json({ error: 'Please upload an image.' }, { status: 415 });
  if (file.size > 8_000_000) return NextResponse.json({ error: 'Image too large (max 8 MB).' }, { status: 413 });

  try {
    const { put } = await import('@vercel/blob');
    const safe = String(file.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40) || 'image';
    const blob = await put(`uploads/${a.user.username}/${Date.now()}-${safe}`, file, { access: 'public', addRandomSuffix: true });
    return NextResponse.json({ url: blob.url });
  } catch {
    return NextResponse.json({ error: 'upload-failed' }, { status: 500 });
  }
}
