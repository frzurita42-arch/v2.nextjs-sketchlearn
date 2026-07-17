import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition } from '@/lib/tool-schema';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolWithKeys, updateTool } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function canManage(tool: any, user: any) {
  return tool && (user.role === 'admin' || tool.owner === user.username);
}

// GET /api/tools/settings?slug= -> full tool + api keys. OWNER or ADMIN only.
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const slug = new URL(req.url).searchParams.get('slug') || '';
  const tool = await getToolWithKeys(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canManage(tool, a.user)) return NextResponse.json({ error: 'Only the owner or an admin can manage this tool.' }, { status: 403 });
  return NextResponse.json({ tool, apiKeys: tool.apiKeys || [] }, { headers: { 'Cache-Control': 'no-cache' } });
}

// PUT /api/tools/settings { slug, definition?, visibility?, apiKeys? } -> save. OWNER/ADMIN only.
export async function PUT(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  const tool = await getToolWithKeys(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canManage(tool, a.user)) return NextResponse.json({ error: 'Only the owner or an admin can manage this tool.' }, { status: 403 });

  const patch: any = {};
  if (b.definition !== undefined) {
    const { ok, def, errors } = validateToolDefinition(b.definition);
    if (!ok || !def) return NextResponse.json({ error: 'Invalid definition', details: errors }, { status: 400 });
    patch.definition = def;
  }
  // Bare title / description edits (e.g. the dashboard's inline ✎ pencil). These
  // write straight to the tools row AND sync into definition.title/description via
  // updateTool, so a rename persists in the DB — not just the ephemeral file store.
  if (typeof b.title === 'string') { const t = b.title.trim().slice(0, 120); if (t) patch.title = t; }
  if (typeof b.description === 'string') patch.description = b.description.trim().slice(0, 400);
  if (b.visibility !== undefined && ['private', 'unlisted', 'public'].includes(b.visibility)) patch.visibility = b.visibility;
  if (Array.isArray(b.apiKeys)) {
    patch.apiKeys = b.apiKeys
      .map((k: any) => ({ name: String(k?.name || '').slice(0, 60), key: String(k?.key || '').slice(0, 400) }))
      .filter((k: any) => k.name && k.key)
      .slice(0, 20);
  }
  const okUpd = await updateTool(slug, patch);
  return NextResponse.json({ ok: okUpd });
}
