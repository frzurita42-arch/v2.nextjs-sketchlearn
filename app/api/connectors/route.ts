import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listConnectors } = require('@/src/connectors');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public catalogue of every API the platform knows about, each annotated with
// whether it is currently available (its key is set). Key VALUES are never
// returned — only availability + which key names are still missing. This powers
// "make space for all the APIs; use them if configured, adapt if not".
export async function GET() {
  const connectors = listConnectors();
  const byCategory: Record<string, any[]> = {};
  for (const c of connectors) (byCategory[c.category] ||= []).push(c);
  return NextResponse.json(
    {
      connectors,
      byCategory,
      availableCount: connectors.filter((c: any) => c.available).length,
      total: connectors.length,
    },
    { headers: { 'Cache-Control': 'no-cache' } }
  );
}
