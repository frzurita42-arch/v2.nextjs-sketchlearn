import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { geminiEnabled, openrouterEnabled, deepseekEnabled } from '@/src/config';
import { generateStructured } from '@/src/ai/providers';
import { requireAuth } from '@/lib/auth-guard';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildCsPathPrompt } = require('@/src/ai/prompts/cs-path');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Deterministic path so the tool works in demo mode / when AI is unavailable.
function fallbackPath(goalRole: string, pinned: string[]) {
  const base = [
    { title: 'Networking & the TCP/IP stack', area: 'Networking', why: 'Everything in security sits on the network — you must read a packet before you can defend or test one.', estWeeks: 3, difficulty: 'intro', resources: ['Professor Messer Network+', 'TryHackMe: Network Fundamentals'] },
    { title: 'Linux fundamentals for security', area: 'Systems', why: 'Most tooling and targets are Linux; the shell is your primary workspace.', estWeeks: 2, difficulty: 'intro', resources: ['OverTheWire: Bandit', 'Linux Journey'] },
    { title: 'Web app security & the OWASP Top 10', area: 'Web Security', why: 'Web is the largest attack surface and the fastest path to hands-on skill.', estWeeks: 4, difficulty: 'core', resources: ['PortSwigger Web Security Academy', 'OWASP Juice Shop'] },
    { title: 'Practical labs on Hack The Box / TryHackMe', area: 'Hands-on', why: 'Authorized, deliberately-vulnerable targets turn theory into muscle memory — legally.', estWeeks: 6, difficulty: 'core', resources: ['TryHackMe learning paths', 'Hack The Box Academy'] },
    { title: 'MITRE ATT&CK & the threat landscape', area: 'Threat Intel', why: 'A shared language for how real adversaries operate; grounds both offense and defense.', estWeeks: 2, difficulty: 'core', resources: ['MITRE ATT&CK Navigator', 'attack.mitre.org'] },
  ];
  const next = base.filter(c => !pinned.some(p => p.toLowerCase() === c.title.toLowerCase())).slice(0, 5);
  return {
    estimatedLevel: { overall: 'Beginner', rationale: 'Estimated from a standard starting point — retake the assessment as you complete courses to refine this.' },
    areaScores: [
      { area: 'Networking', score: 30 }, { area: 'Systems / Linux', score: 30 },
      { area: 'Web Security', score: 20 }, { area: 'Threat Intel', score: 15 },
      { area: 'Hands-on Labs', score: 10 },
    ],
    gaps: [
      { area: 'Web Security', why: `Core to ${goalRole}; the OWASP Top 10 is foundational.` },
      { area: 'Hands-on Labs', why: 'Skills only stick with authorized, repeated practice.' },
      { area: 'Threat Intel', why: 'Understanding real adversary behavior focuses your learning.' },
    ],
    nextCourses: next,
    adaptationNote: 'As you finish courses and new CVEs/news arrive, the next five re-rank toward your weakest areas and current interests.',
    fallback: true,
  };
}

export async function POST(req: Request) {
  const a = await requireAuth(req);
  if (!a.ok) return a.response;
  const b = (await req.json().catch(() => ({}))) || {};
  const goalRole = String(b.goalRole || 'Penetration Tester');
  const knownAreas: string[] = Array.isArray(b.knownAreas) ? b.knownAreas.map(String) : [];
  const interests: string[] = Array.isArray(b.interests) ? b.interests.map(String) : [];
  const hoursPerWeek = Math.max(1, Math.min(40, parseInt(b.hoursPerWeek, 10) || 6));
  const currentCourses: string[] = Array.isArray(b.currentCourses) ? b.currentCourses.map(String).slice(0, 10) : [];
  const recentSignals: string[] = Array.isArray(b.recentSignals) ? b.recentSignals.map(String).slice(0, 10) : [];

  if (!openrouterEnabled && !geminiEnabled && !deepseekEnabled) {
    return NextResponse.json(fallbackPath(goalRole, currentCourses));
  }
  try {
    const p = buildCsPathPrompt({ goalRole, knownAreas, interests, hoursPerWeek, currentCourses, recentSignals, priorPath: b.priorPath || null });
    const r: any = await generateStructured(
      [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
      { temperature: 0.7, maxTokens: 3072 }
    );
    // Shape-guard: keep exactly 5 next courses, echo pinned so the UI can show them.
    const nextCourses = (Array.isArray(r?.nextCourses) ? r.nextCourses : []).slice(0, 5);
    if (!nextCourses.length) return NextResponse.json(fallbackPath(goalRole, currentCourses));
    return NextResponse.json({
      estimatedLevel: r.estimatedLevel || { overall: 'Beginner', rationale: '' },
      areaScores: Array.isArray(r.areaScores) ? r.areaScores : [],
      gaps: Array.isArray(r.gaps) ? r.gaps : [],
      nextCourses,
      pinned: currentCourses,
      adaptationNote: String(r.adaptationNote || ''),
      fallback: false,
    });
  } catch {
    return NextResponse.json(fallbackPath(goalRole, currentCourses));
  }
}
