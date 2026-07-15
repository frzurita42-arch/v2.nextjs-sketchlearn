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
  const isAdmin = a.user.role === 'admin';
  const me = a.user.username;
  // POSTER (blue) links belong to the owner/admin — only they add/remove them.
  // USER (green) links are uploaded by any signed-in viewer; the uploader (by)
  // or an admin may remove one, but the owner (OP) may NOT remove a user's link.
  const index = Number.isInteger(b.index) ? b.index : -1;

  let touched = false; let denied = false;
  const visit = (cards: RepoCard[]): RepoCard[] => cards.map((c) => {
    if (c.id === cardId) {
      const links = Array.isArray(c.links) ? [...c.links] : [];
      let removedGreen = false;
      if (action === 'add') {
        if (color === 'blue' && !isOwnerAdmin) { denied = true; return c; }   // only OP/admin post
        let url = String(b.link?.url || '').trim();
        if (!url) return c;
        // A bare domain gets a scheme so it resolves — but NEVER an uploaded file
        // (data: URL) or a site-relative path, or we corrupt it into "https://data:…".
        if (!/^https?:\/\//i.test(url) && !/^data:/i.test(url) && !url.startsWith('/')) url = 'https://' + url;
        const label = String(b.link?.label || 'Link').slice(0, 15) || 'Link';
        links.push(color === 'green' ? { label, url, color: 'green', by: me } : { label, url, by: me });
        touched = true;
      } else {
        // Remove a specific link (by index) with per-link permission.
        const target = index >= 0 && index < links.length ? links[index] as any : null;
        if (!target) return c;
        const isUser = target.color === 'green';
        const canRemove = isUser ? (target.by === me || isAdmin) : isOwnerAdmin;
        if (!canRemove) { denied = true; return c; }
        links.splice(index, 1);
        removedGreen = isUser;
        touched = true;
      }
      // Auto-status: a user (green) upload moves an ASSIGNED card to PENDING (a
      // submission awaiting review); removing the last user upload moves a PENDING
      // card back to ASSIGNED. Other statuses (approved/rejected/…) are left alone.
      let mode = (c as any).mode;
      const greenLeft = links.some((l: any) => l.color === 'green');
      if (action === 'add' && color === 'green' && mode === 'assigned') mode = 'pending';
      else if (action === 'remove' && removedGreen && !greenLeft && mode === 'pending') mode = 'assigned';
      const next: any = { ...c, links };
      if (mode !== (c as any).mode) { if (mode) next.mode = mode; else delete next.mode; }
      return next;
    }
    if (c.children?.length) return { ...c, children: visit(c.children) };
    return c;
  });

  const nextCards = visit(Array.isArray(repo.cards) ? repo.cards : []);
  if (denied) return NextResponse.json({ error: 'You are not allowed to change that attachment.' }, { status: 403 });
  if (!touched) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });

  // Re-validate the full definition (caps link counts / URLs) before saving.
  const nextDef = { ...tool.definition, repo: { ...repo, cards: nextCards } };
  const { ok, def } = validateToolDefinition(nextDef);
  if (!ok || !def) return NextResponse.json({ error: 'Invalid repository' }, { status: 400 });

  await updateTool(slug, { definition: def });
  return NextResponse.json({ ok: true, repo: def.repo });
}
