/* Prompt for the adaptive Cybersecurity career-path generator.
 * Given a learner's self-report + optional live signals (recent CVEs / news),
 * the model estimates their level, finds gaps, and proposes the next few
 * courses with timeframes — always in a LEGAL, authorized-learning frame
 * (sanctioned labs, CTFs, your-own-systems). Returns strict JSON. */

const ROLE_HINTS = {
  'SOC Analyst': 'detection, SIEM, log analysis, incident triage, threat intel',
  'Penetration Tester': 'web/network exploitation in authorized labs, reporting, OWASP, Burp, Metasploit',
  'Red Team Operator': 'adversary emulation, MITRE ATT&CK, C2, evasion — strictly against sanctioned targets',
  'Security Engineer': 'secure architecture, cloud security, IAM, hardening, automation',
  'Malware Analyst': 'reverse engineering, sandboxing, static/dynamic analysis in isolated VMs',
  'GRC / Risk': 'frameworks (NIST, ISO 27001), risk assessment, compliance, policy',
};

function buildCsPathPrompt(ctx = {}) {
  const {
    goalRole = 'Penetration Tester',
    knownAreas = [],
    interests = [],
    hoursPerWeek = 6,
    currentCourses = [],
    recentSignals = [],
    priorPath = null,
  } = ctx;

  const roleHint = ROLE_HINTS[goalRole] || 'core security fundamentals';
  const signalsBlock = recentSignals.length
    ? `Recent real-world signals to weave in where genuinely relevant (do not force it):\n${recentSignals.map((s) => `- ${s}`).join('\n')}`
    : 'No live signals provided; base recommendations on durable fundamentals.';
  const pinnedBlock = currentCourses.length
    ? `The learner is CURRENTLY working on these and wants to keep them — never drop or duplicate them, build AROUND them:\n${currentCourses.map((c) => `- ${c}`).join('\n')}`
    : 'The learner has no pinned in-progress courses.';
  const priorBlock = priorPath
    ? `This is an UPDATE to an existing path. Prior recommended areas were: ${JSON.stringify(priorPath).slice(0, 800)}. Evolve it — reflect any new interests/signals — rather than restarting from scratch.`
    : '';

  const system = [
    'You are a cybersecurity learning mentor building a personalized, adaptive study path.',
    'HARD RULES on ethics and legality — these are non-negotiable and shape every recommendation:',
    '- Frame ALL offensive/red-team learning around AUTHORIZED environments only: sanctioned labs (Hack The Box, TryHackMe, PortSwigger Academy, VulnHub), CTFs, and systems the learner owns or has written permission to test.',
    '- Never recommend attacking real systems without authorization, evading protections in the wild, or anything whose primary purpose is unlawful access.',
    '- Prefer reputable, real resources and platforms. If unsure a resource exists, describe the topic instead of inventing a specific URL.',
    'Values: productivity and harmony — the path should be motivating, realistic for the learner\'s time budget, and build genuine competence step by step.',
    'Output STRICT JSON only, matching the requested schema. No markdown, no commentary.',
  ].join('\n');

  const user = [
    `Target role: ${goalRole} (core focus: ${roleHint}).`,
    `Self-reported strengths / known areas: ${knownAreas.length ? knownAreas.join(', ') : 'none stated'}.`,
    `Interests: ${interests.length ? interests.join(', ') : 'general security'}.`,
    `Available study time: ~${hoursPerWeek} hours/week (size the timeframes to this).`,
    pinnedBlock,
    signalsBlock,
    priorBlock,
    '',
    'Return JSON with exactly this shape:',
    `{
  "estimatedLevel": { "overall": "Beginner|Intermediate|Advanced", "rationale": "one or two sentences" },
  "areaScores": [ { "area": "e.g. Networking", "score": 0-100 } ],   // 5-8 core areas for the target role
  "gaps": [ { "area": "string", "why": "why this gap matters for the goal role" } ],  // the 3-4 biggest gaps
  "nextCourses": [
    { "title": "concrete course/topic", "area": "which area it fills", "why": "why now", "estWeeks": 1-12,
      "difficulty": "intro|core|advanced", "resources": ["real platform or resource name", "..."] }
  ],   // exactly 5, ordered by what to do first; do NOT repeat pinned courses
  "adaptationNote": "one sentence on how this path will shift as the learner progresses and new signals arrive"
}`,
  ].filter(Boolean).join('\n');

  return { system, user };
}

module.exports = { buildCsPathPrompt, ROLE_HINTS };
