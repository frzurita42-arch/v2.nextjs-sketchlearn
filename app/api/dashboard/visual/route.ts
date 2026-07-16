import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { imageEnabled } from '@/src/config';
import { generateImageWithMeta } from '@/src/ai/providers';
import { requireAdmin } from '@/lib/auth-guard';
import { recordImageUsage } from '@/lib/usage-log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// The output styles the admin can pick from the dropdown. Each frames the same
// data differently. Unlike slide images, these WANT labels/numbers.
const KINDS: Record<string, string> = {
  infographic: 'a clean, modern INFOGRAPHIC that visualises this data with icons, simple embedded charts, a few big highlighted numbers and short labels',
  chart: 'a polished data-visualisation CHART poster — pick the best chart (bar, pie/donut, line…) for this data, with a title, axis labels and a legend',
  'business-poster': 'a professional BUSINESS poster summarising these metrics — corporate and confident, with a headline, a few KPI stats and a subtle chart',
  'marketing-poster': 'an eye-catching MARKETING poster that turns the best numbers into selling points — bold, colourful, punchy headline and stats',
  'business-plan': 'a one-page BUSINESS PLAN ASSESSMENT diagram — a strategic overview with key metrics, a simple funnel or 2×2 quadrant, and short labelled callouts',
  'executive-summary': 'an EXECUTIVE SUMMARY dashboard poster with clean KPI tiles and a couple of small labelled charts',
  'trend-forecast': 'a TREND & FORECAST poster showing the trajectory of these numbers with an arrow / line and a short written takeaway',
};

// POST { kind, tableName, summary, allSummaries?, includeAll?, custom? } -> { url, by }
export async function POST(req: Request) {
  const a = await requireAdmin(req);
  if (!a.ok) return a.response;
  if (!imageEnabled) return NextResponse.json({ error: 'No image model is configured.' }, { status: 200 });
  const b = (await req.json().catch(() => ({}))) || {};
  const kind = KINDS[String(b.kind)] ? String(b.kind) : 'infographic';
  const tableName = String(b.tableName || 'dashboard data').slice(0, 80);
  const summary = String(b.summary || '').slice(0, 3000);
  const includeAll = !!b.includeAll;
  const allSummaries = includeAll ? String(b.allSummaries || '').slice(0, 6000) : '';
  const custom = String(b.custom || '').slice(0, 500);

  const prompt = [
    `Design ${KINDS[kind]}.`,
    `It is about the SketchLearn admin dashboard${includeAll ? ' (all tables)' : `: the "${tableName}" table`}.`,
    includeAll ? `ALL DASHBOARD DATA:\n${allSummaries}` : `DATA:\n${summary}`,
    custom ? `Also follow this instruction from the author: "${custom}".` : '',
    'Tell a clear story with the data — surface the most relevant insight, not every number. Use a cohesive modern colour palette, clear hierarchy and SHORT, accurate labels/numbers (spell everything correctly). Make it look like a real, polished business/marketing asset. Portrait or square, readable at a glance.',
  ].filter(Boolean).join('\n');

  try {
    const r = await generateImageWithMeta(prompt, {});
    if (!r?.url) return NextResponse.json({ error: 'Could not generate an image — try again.' }, { status: 200 });
    await recordImageUsage({ username: a.user.username, kind: 'dashboard-visual', provider: r.provider || '', subject: `${kind} — ${tableName}`, meta: { prompt } });
    return NextResponse.json({ url: r.url, by: r.provider || '' });
  } catch {
    return NextResponse.json({ error: 'Image generation failed.' }, { status: 200 });
  }
}
