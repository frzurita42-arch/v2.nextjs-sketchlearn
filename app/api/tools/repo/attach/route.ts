import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { validateToolDefinition } from '@/lib/tool-schema';
import type { RepoCard } from '@/lib/tool-schema';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getToolBySlug, updateTool } = require('@/src/db/platform');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// Append or remove ONE attachment link on a single card. Unlike /api/tools/repo
// (owner/admin only, replaces the whole tree), this narrow endpoint lets NORMAL
// users attach when the repo's Configurations allow it — the server changes only
// that one card's links, so it can't be used to rewrite the repo.
//
// POST { slug, cardId, action:'add'|'remove', color:'blue'|'green', link?:{label,url} }
export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const slug = String(b.slug || '');
  const cardId = String(b.cardId || '');
  const action = b.action === 'remove' ? 'remove' : 'add';
  const color: 'blue' | 'green' = b.color === 'green' ? 'green' : 'blue';
  if (!slug || !cardId) return NextResponse.json({ error: 'slug and cardId are required' }, { status: 400 });

  const tool = await getToolBySlug(slug);
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tool.definition?.archetype !== 'repo') return NextResponse.json({ error: 'This tool is not a repository.' }, { status: 400 });
  if ((tool.tags || []).includes('example')) return NextResponse.json({ error: 'Example tools cannot be edited.' }, { status: 400 });

  const repo = tool.definition.repo || {};
  const isOwnerAdmin = a.user.role === 'admin' || tool.owner === a.user.username;
  const allowed = isOwnerAdmin || (color === 'green' ? !!repo.folderForAll : !!repo.clipForAll);
  if (!allowed) return NextResponse.json({ error: 'Attaching is disabled for you on this repository.' }, { status: 403 });

  // Walk the tree to the target card and add/remove exactly one link of `color`.
  let touched = false;
  const visit = (cards: RepoCard[]): RepoCard[] => cards.map((c) => {
    if (c.id === cardId) {
      const links = Array.isArray(c.links) ? [...c.links] : [];
      if (action === 'add') {
        let url = String(b.link?.url || '').trim();
        if (!url) return c;
        if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) url = 'https://' + url;
        const label = String(b.link?.label || 'Link').slice(0, 15) || 'Link';
        links.push(color === 'green' ? { label, url, color: 'green' } : { label, url });
      } else {
        for (let i = links.length - 1; i >= 0; i--) {
          if (((links[i] as any).color === 'green') === (color === 'green')) { links.splice(i, 1); break; }
        }
      }
      touched = true;
      return { ...c, links };
    }
    if (c.children?.length) return { ...c, children: visit(c.children) };
    return c;
  });

  const nextCards = visit(Array.isArray(repo.cards) ? repo.cards : []);
  if (!touched) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });

  // Re-validate the full definition (caps link counts / URLs) before saving.
  const nextDef = { ...tool.definition, repo: { ...repo, cards: nextCards } };
  const { ok, def } = validateToolDefinition(nextDef);
  if (!ok || !def) return NextResponse.json({ error: 'Invalid repository' }, { status: 400 });

  await updateTool(slug, { definition: def });
  return NextResponse.json({ ok: true, repo: def.repo });
}
