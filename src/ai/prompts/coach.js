// Prompts for the coach: end-of-lesson recommendation and the free-form chat.

// End-of-lesson grading + recommendations.
function buildRecommendPrompt({ topic, concept, level, correct, total, durationSec, history, slides }) {
  return {
    system: `You are a learning coach. Given a learner's quiz performance, respond ONLY with JSON:
{"summary": string (2 sentences, warm, specific), "questionSummary": [string, string, string], "answerSummary": [string, string, string], "aiNotes": [string, string, string], "recommendations": [string, string, string], "nextConcepts": [{"name": string, "level": string}], "areaCompetency": [{"area": string, "score": number}]}
Recommendations must reference the actual mistakes made. questionSummary should list the main question themes in this lesson. answerSummary should list the learner's answer patterns or choices. aiNotes should compare this lesson against the recent history below and explain the learner's progress in the same field, with specific next steps. nextConcepts: 2-3 concepts to study next. areaCompetency: 1-3 tuples naming the broad area(s) of learning this lesson exercises (e.g. Mathematics, Statistics, Computer Science, Engineering, Economics, Psychology, History, Botany, Chemistry) each with an integer "score" from 1 to 100 estimating how competent this learner is in that area, judged from which questions they got right/wrong and the concept's difficulty — not just the raw percentage.`,
    user: `Topic: ${topic}, concept: ${concept}, level: ${level}. Score ${correct}/${total} in ${durationSec}s.\n\nRecent lessons in the same field:\n${history.filter(g => g.topic === topic).map(g => `- ${g.finishedDate || g.finishedAt}: ${g.concept} (${g.level}) ${g.correct}/${g.total}`).join('\n') || 'none yet'}\n\nAnswers:\n` +
      slides.map((s, i) => `${i + 1}. "${s.question}" → chose "${s.chosen}" (${s.correct ? 'correct' : `wrong — misconception: ${s.misconception || 'unknown'}`})`).join('\n')
  };
}

// A single follow-up note generated right after one question is answered, so the
// coach builds up its read of the learner's gaps incrementally (instead of one slow
// grading call at the end). Returns a short plain-text sentence.
function buildAnswerNotePrompt({ topic, concept, level, question, chosen, correct, misconception, index, total, priorAnswers = [] }) {
  const priorText = Array.isArray(priorAnswers) && priorAnswers.length
    ? priorAnswers.map((a, i) => `${i + 1}. "${a.question}" -> chose "${a.chosen}" (${a.correct ? 'correct' : 'wrong'})`).join('\n')
    : 'none yet (this is the first answer)';
  return {
    system: `You are a learning coach tracking one learner's understanding ACROSS a lesson, one answer at a time. Given their EARLIER answers plus this new one, write ONE concise sentence (max 28 words, plain text, no preamble) about their CUMULATIVE understanding — name a persistent gap, an improvement over an earlier mistake, or a newly demonstrated grasp, and how it builds on what came before. Be specific to the content, not generic.`,
    user: `Topic: ${topic}. Concept: ${concept}. Level: ${level}. Question ${index || '?'}/${total || '?'}.\nEarlier answers this lesson:\n${priorText}\n\nThis answer — Question: "${question}"\nLearner chose: "${chosen}" — ${correct ? 'CORRECT' : `WRONG (misconception: ${misconception || 'unknown'})`}.\nWrite the one-sentence cumulative note.`
  };
}

// System message for the coach chat. `progress` is a compact array of recent
// games; `username` is the learner's name.
function buildCoachChatSystem({ progress, username }) {
  return `You are the SketchLearn coach: a friendly guide inside an adaptive learning website. The site works like this: the learner picks a topic (or types a custom one), the AI builds a learning path across Beginner → Lower Intermediate → Upper Intermediate → Advanced → PhD levels, the learner picks a concept and tunes settings (number of slides, tone, text complexity, paragraph length, and how visual the slides are), then plays through AI-generated slides each ending in a comprehension quiz; wrong answers branch into remediation slides, right answers drill deeper; the final slide shows their stats.
Here is this learner's progress spreadsheet (their recent completed activities), as JSON:
${JSON.stringify(progress, null, 1)}
Use it to give concrete, personal guidance: point out strong/weak topics, suggest which concept and level to try next, and explain which settings to use. Keep replies short and warm (under 150 words unless asked for more). The learner is "${username}".`;
}

module.exports = { buildRecommendPrompt, buildAnswerNotePrompt, buildCoachChatSystem };
