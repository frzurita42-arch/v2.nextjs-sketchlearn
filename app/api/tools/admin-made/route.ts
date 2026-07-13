import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getExampleOverrides } = require('@/src/db/platform');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADMIN_TOOLS, applyOverrides } = require('@/src/tools/examples');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/tools/admin-made -> { tools }
// The platform's built-in "Admin's Made Tools" (Learning Path, Suggested Topic,
// Time Travel, Structured Explanations, Language Learning), with any admin
// title/description/thumbnail overrides applied. Each opens the standard tool page.
export async function GET(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const tools = applyOverrides(Array.isArray(ADMIN_TOOLS) ? ADMIN_TOOLS : [], await getExampleOverrides());
  return NextResponse.json({ tools }, { headers: { 'Cache-Control': 'no-cache' } });
}
