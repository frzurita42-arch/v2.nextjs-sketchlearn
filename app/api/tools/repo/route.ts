import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition } from '@/lib/tool-schema';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, updateTool, setExampleOverride } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exampleBySlug } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// POST { slug, repo } -> save a repository's nested-card tree. OWNER or ADMIN only.
// The whole `repo` block is re-validated (depth/count/link/image caps) before it's
// written back into the tool definition.
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  if (!slug || !b.repo) return NextResponse.json({ error: 'slug and repo are required' }, { status: 400 });

  const ex = exampleBySlug(slug);
  const tool = ex || await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const isExample = !!ex || (tool.tags || []).includes('example');
  if (!(a.user.role === 'admin' || tool.owner === a.user.username)) {
    return NextResponse.json({ error: 'Only the owner or an admin can edit this repository.' }, { status: 403 });
  }
  if (tool.definition?.archetype !== 'repo') {
    return NextResponse.json({ error: 'This tool is not a repository.' }, { status: 400 });
  }

  // Re-validate the full definition with the new repo tree swapped in.
  const nextDef = { ...tool.definition, repo: b.repo };
  const { ok, errors, def } = validateToolDefinition(nextDef);
  if (!ok || !def) return NextResponse.json({ error: 'Invalid repository', details: errors }, { status: 400 });

  if (isExample) {
    await setExampleOverride(slug, { repo: def.repo });
  } else {
    await updateTool(slug, { definition: def });
  }
  return NextResponse.json({ ok: true, repo: def.repo });
}
