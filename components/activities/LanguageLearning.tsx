'use client';
/* Language Learning activity (home-feed section). Settings from the sketch:
 * language (+custom), level (Zero..C2), AI-generated grammar topics (+custom),
 * per-activity slide counts, a lesson theme (+AI suggest), Generate + Randomize,
 * and a donations mug. Phase 1 runs the READING activity through the shared slide
 * engine; grammar/listening/spelling/vocabulary land in later phases. */
import { useEffect, useState } from 'react';
import { API } from '@/lib/api';
import { appState, LANGUAGES, LANG_LEVELS, WRITING_DEFAULT_BY_LEVEL } from '@/lib/app-state';
import { withTimeout } from '@/lib/util';
import { useApp } from '@/components/AppContext';
import { InstructionPlank } from './InstructionPlank';
import { DonationsCard } from '@/components/ui/DonationMug';

const ACTIVITIES: [string, string][] = [
  ['grammar', 'Grammar'], ['reading', 'Reading'], ['listening', 'Listening'], ['spelling', 'Spelling'], ['vocabulary', 'Vocabulary'], ['writing', 'Character practice'],
];
const MAX_SLIDES = 12;

const LEVEL_GUIDANCE: Record<string, string> = {
  Zero: 'Absolute beginner from nothing: alphabet/characters, letter or character sounds, a few essential words and 2-4 word sentences. For script-based languages introduce individual characters (what each depicts, means and sounds like) and translate everything into English.',
  Beginner: 'Very simple greetings, numbers, days, essential words and short present-tense sentences.',
  A1: 'Basic everyday phrases, simple questions/answers about concrete needs.',
  A2: 'Simple routine matters, describing background and immediate environment, simple past/future.',
  B1: 'Travel situations, experiences and plans, brief reasons and opinions.',
  B2: 'A range of topics with clear detailed text and argued viewpoints.',
  C1: 'Complex texts and implicit meaning; social, academic and professional use.',
  C2: 'Near-native precision and nuance across specialized contexts.',
};

// Built client-side and passed to the shared slide engine as customInstructions.
function readingInstructions(language: string, level: string, topic: string, grammarTopic: string): string {
  const guide = LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.A1;
  const symbol = /japanese|mandarin|chinese|korean|arabic/i.test(language)
    ? ` ${language} is script/character-based: at Zero/Beginner introduce the characters (what each depicts, means and sounds like) and always give the English meaning.`
    : '';
  const inEnglish = ['Zero', 'Beginner', 'A1'].includes(level)
    ? ' Explain in clear English so a near-beginner understands, then show the target-language example.'
    : ' Write mostly in the target language with brief English glosses only where needed.';
  return `LANGUAGE READING LESSON. Target language: ${language}. Learner level: ${level} — ${guide}${symbol}${inEnglish}` +
    ` Theme for examples: "${topic || 'everyday life'}". Grammar focus: "${grammarTopic || 'general'}".` +
    ` Each slide is a short reading passage sized to the level (Zero: a few short words/sentences; higher levels: more sentences/paragraphs, richer vocabulary and harder interpretation) followed by a comprehension multiple-choice question.` +
    ` On EVERY slide include exactly one support component that fits the passage — an image, a table (vocabulary/conjugations), or a code snippet when illustrating a rule/pattern — AND exactly one sticky note that is an encouraging note on progress, a short level-appropriate quote about the theme, or a quick motivational cheer.` +
    ` Keep it oriented to what a ${level} learner needs (Zero: survival basics; A1/A2: greetings and daily life; B1/B2: experiences and opinions; C1/C2: negotiation, study, travel, business).`;
}

export function LanguageLearning() {
  const app = useApp();
  const [st, setSt] = useState<any>({ ...appState.languageLearning });
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [busyTopic, setBusyTopic] = useState(false);
  const patch = (p: any) => setSt((prev: any) => { const next = { ...prev, ...p }; appState.languageLearning = next; return next; });

  const loadGrammarTopics = async (language: string, level: string) => {
    setLoadingTopics(true);
    try {
      const r = await withTimeout(API.post('/api/ai/language/grammar-topics', { language, level }), 45000, 'Grammar topics timed out.');
      const topics: string[] = Array.isArray(r?.topics) ? r.topics : [];
      setSt((prev: any) => {
        const next = { ...prev, grammarTopicOptions: topics, grammarTopic: (!prev.customGrammar && topics[0]) ? topics[0] : prev.grammarTopic };
        appState.languageLearning = next; return next;
      });
    } catch { patch({ grammarTopicOptions: [] }); }
    setLoadingTopics(false);
  };

  useEffect(() => {
    if (!st.customGrammar && !(st.grammarTopicOptions || []).length) loadGrammarTopics(st.language, st.level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLevel = (level: string) => {
    // Seed a level-appropriate amount of character practice (more at Zero/Beginner).
    const writing = WRITING_DEFAULT_BY_LEVEL[level] ?? 0;
    patch({ level, counts: { ...(st.counts || {}), writing } });
    if (!st.customGrammar) loadGrammarTopics(st.language, level);
  };
  const onLanguage = (language: string) => { patch({ language }); if (!st.customGrammar) loadGrammarTopics(language, st.level); };

  const counts = st.counts || {};
  const totalCount = ACTIVITIES.reduce((a, [k]) => a + Number(counts[k] || 0), 0);
  const setCount = (key: string, val: string) => {
    const v = Math.max(0, Math.min(MAX_SLIDES, parseInt(val, 10) || 0));
    const others = totalCount - Number(counts[key] || 0);
    patch({ counts: { ...counts, [key]: Math.min(v, MAX_SLIDES - others) } });
  };

  const suggestTopic = async () => {
    setBusyTopic(true);
    try {
      const r = await withTimeout(API.post('/api/ai/language/topic', { language: st.language, level: st.level, avoid: [st.topic].filter(Boolean) }), 30000, 'Topic timed out.');
      patch({ topic: String(r?.topic || '').trim() });
    } catch { /* ignore */ }
    setBusyTopic(false);
  };

  const randomize = () => {
    const level = LANG_LEVELS[Math.floor(Math.random() * LANG_LEVELS.length)];
    // Random counts summing to 3-6 with grammar always >= 1.
    const target = 3 + Math.floor(Math.random() * 4);
    const next: any = { grammar: 1, reading: 0, listening: 0, spelling: 0, vocabulary: 0, writing: WRITING_DEFAULT_BY_LEVEL[level] ?? 0 };
    let remaining = target - 1;
    const keys = ['reading', 'listening', 'spelling', 'vocabulary', 'grammar'];
    while (remaining > 0) { const k = keys[Math.floor(Math.random() * keys.length)]; next[k] += 1; remaining--; }
    patch({ level, counts: next });
    if (!st.customGrammar) loadGrammarTopics(st.language, level);
  };

  const generate = () => {
    const language = (st.language || 'Spanish').trim() || 'Spanish';
    const grammarTopic = (st.grammarTopic || '').trim();
    const topic = (st.topic || '').trim() || 'everyday life';
    // Ensure at least one activity slide; grammar renders first, the rest shuffle.
    const c = { ...counts };
    if (!ACTIVITIES.reduce((a, [k]) => a + Number(c[k] || 0), 0)) c.reading = 1;
    appState.languageLesson = { language, level: st.level, topic, grammarTopic, counts: c };
    appState.game = null;
    app.nav('language');
  };

  const grammarUnavailable = !st.customGrammar && loadingTopics;

  return (
    <section style={{ maxWidth: 860, margin: '24px auto 0' }}>
      <h4 className="activity-heading" style={{ margin: '0 0 6px', opacity: 0.9 }}>Language learning</h4>
      <InstructionPlank>Pick a language, level and grammar focus — get a playable lesson with reading, quizzes and coaching notes.</InstructionPlank>
      <div className="card alt" style={{ maxWidth: 860, margin: '0 auto', padding: '14px 16px' }}>
        {/* ---- row 1: settings (wider) + activities (narrower), side by side even on 9:16 ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, alignItems: 'start' }}>
          <div className="card">
            <div className="field">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Language
                <PencilToggle active={st.customLanguage} onClick={() => patch({ customLanguage: !st.customLanguage })} title="Type your own language" /></span>
              {st.customLanguage
                ? <input type="text" id="ll-language-custom" value={st.language} placeholder="e.g. Swahili, Greek…" onChange={e => patch({ language: e.target.value })} />
                : <select id="ll-language" value={st.language} onChange={e => onLanguage(e.target.value)}>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>}
            </div>
            <label className="field"><span>Level</span>
              <select id="ll-level" value={st.level} onChange={e => onLevel(e.target.value)}>
                {LANG_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <div className="field">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Grammar topic
                <PencilToggle active={st.customGrammar} onClick={() => patch({ customGrammar: !st.customGrammar })} title="Type your own grammar topic" /></span>
              {st.customGrammar
                ? <input type="text" id="ll-grammar-custom" value={st.grammarTopic} placeholder="e.g. Past tense of regular verbs" onChange={e => patch({ grammarTopic: e.target.value })} />
                : <select id="ll-grammar" value={st.grammarTopic} disabled={grammarUnavailable} onChange={e => patch({ grammarTopic: e.target.value })}>
                    {grammarUnavailable && <option>⏳ Generating topics…</option>}
                    {!grammarUnavailable && !(st.grammarTopicOptions || []).length && <option value="">(no topics — try Custom)</option>}
                    {(st.grammarTopicOptions || []).map((t: string) => <option key={t} value={t}>{t}</option>)}
                  </select>}
              {grammarUnavailable && <span className="muted-line">Generating {st.level} topics…</span>}
            </div>
          </div>

          <div className="card alt" style={{ minWidth: 0 }}>
            <h3 style={{ marginTop: 0, fontSize: '1.2rem' }}>Activities <small style={{ fontWeight: 'normal', opacity: .7 }}>{totalCount}/{MAX_SLIDES}</small></h3>
            {ACTIVITIES.map(([key, label]) => (
              <label className="field" key={key} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: '.86rem', minWidth: 0, lineHeight: 1.1 }}>{label}{key === 'listening' || key === 'spelling' ? ' 🔊' : ''}</span>
                <input type="number" className="ll-count" id={`ll-count-${key}`} min={0} max={MAX_SLIDES} value={Number(counts[key] || 0)}
                  onChange={e => setCount(key, e.target.value)} />
              </label>
            ))}
          </div>
        </div>

        {/* ---- row 2: topic paper + donations mug ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 12, marginTop: 12, alignItems: 'stretch' }}>
          <div className="card">
            <div className="field">
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Topic
                <button className="btn small blue" type="button" disabled={busyTopic} onClick={suggestTopic} style={{ padding: '2px 8px' }}>{busyTopic ? '…' : '🎲'}</button></span>
              <input type="text" id="ll-topic" value={st.topic} placeholder="e.g. Food, Summer vibes, Travel…" onChange={e => patch({ topic: e.target.value })} />
            </div>
          </div>
          <DonationsCard />
        </div>

        {/* ---- generate, beneath the topic card ---- */}
        <div className="slide-actions" style={{ justifyContent: 'center', marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
          <button className="btn primary" id="ll-generate" style={{ fontSize: '1.15rem' }} onClick={generate}>Generate ✏️</button>
          <button className="btn blue" id="ll-randomize" title="Randomize level, grammar topic and activities" onClick={randomize}>🎲 Surprise me</button>
        </div>
      </div>
    </section>
  );
}

// Small pencil icon that toggles a field between "pick from list" and "type your own".
function PencilToggle({ active, onClick, title }: { active: boolean; onClick: () => void; title: string }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={active} onClick={onClick}
      style={{ background: active ? 'var(--yellow)' : 'none', border: active ? '2px solid var(--ink)' : '2px solid transparent', borderRadius: 8, cursor: 'pointer', fontSize: '.9rem', lineHeight: 1, padding: '2px 5px' }}>✏️</button>
  );
}

