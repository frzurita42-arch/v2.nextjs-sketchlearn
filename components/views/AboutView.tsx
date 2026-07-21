'use client';
/* About us — the story behind SketchLearn, in the site's hand-drawn paper style.
 * A public page (everyone sees it): a short mission, the three things the site
 * makes (repos → slide tools → played presentations), how it works, a note on the
 * sketch look, and two buttons out to the galleries. No data, no AI — static. */
import { useApp } from '@/components/AppContext';
import { PageHeaderBar } from '@/components/ui/PageHeaderBar';

// A faint dotted rule matching the separators used across the site.
const dottedRule: React.CSSProperties = { border: 'none', borderTop: '2px dotted var(--line,#d9cfc0)', margin: '22px 0' };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 10px' };

// The three things the site makes, each a taped sticky note in its own colour
// (matching the rest of the app: repo → orange, slide tool → blue, run → green).
const PILLARS: { cls: string; emoji: string; title: string; body: string; tilt: number }[] = [
  { cls: 'sticky-orange', emoji: '📁', title: 'Repos', body: 'A repository is a course: units and cards laid out as a path. Each objective carries its own prompt — the brief the slide machine studies from.', tilt: -2 },
  { cls: 'sticky-blue', emoji: '🎞️', title: 'Slide tools', body: 'A reusable generator that builds a lesson from text, sketches, tables, formulas, code and charts — following templates tailored to the subject.', tilt: 1.5 },
  { cls: 'sticky-green', emoji: '🎬', title: 'Play & learn', body: 'Play a presentation one slide at a time, answer the question on each, and get scored — with presets and sample slides so you know what you are starting.', tilt: -1 },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '1', title: 'Pick or build a repo', body: 'Start from a ready-made course, or describe what you want and let the coach steer you to the right path.' },
  { n: '2', title: 'Choose an objective', body: 'Every objective is one learning step with its own study prompt — the exact objectives, topics and exercises to cover.' },
  { n: '3', title: 'Generate the slides', body: 'The slide tool turns that prompt into a deck, matching templates and support material (images, code, formulas) to the topic.' },
  { n: '4', title: 'Play it and get scored', body: 'Read, answer, advance. Each slide ends in a question, and the run remembers how you did.' },
];

export function AboutView() {
  const app = useApp();
  return (
    <>
      <PageHeaderBar pageKey="about" title="ℹ️ About us" subtitle="The story behind SketchLearn" />

      {/* Mission — the one-paragraph what-and-why, on paper. */}
      <div className="card" style={{ padding: '18px 20px', transform: 'rotate(-0.3deg)' }}>
        <p style={eyebrow}>Our mission</p>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
          SketchLearn turns anything you want to learn into a <b>hand-drawn lesson you can play</b>. Instead of
          a wall of text, you get a short deck of sketch-style slides — each one explaining an idea and then
          checking that it landed. Describe a subject and the site organises it into a course, writes the
          lessons, and quizzes you as you go.
        </p>
      </div>

      <hr style={dottedRule} />

      {/* The three pillars as taped sticky notes. */}
      <p style={eyebrow}>What we make</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 4 }}>
        {PILLARS.map((p) => (
          <div key={p.title} style={{ flex: '1 1 240px', minWidth: 240 }}>
            <div className={`slide-comp comp-sticky ${p.cls}`} style={{ transform: `rotate(${p.tilt}deg)`, marginBottom: 0, height: '100%' }}>
              <b className="sticky-title" style={{ display: 'block', fontSize: 16 }}>{p.emoji} {p.title}</b>
              <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5 }}>{p.body}</p>
            </div>
          </div>
        ))}
      </div>

      <hr style={dottedRule} />

      {/* How it works — a numbered path, mirroring the repo "objectives" list. */}
      <p style={eyebrow}>How it works</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map((s) => (
          <div key={s.n} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px' }}>
            <span aria-hidden style={{ flex: '0 0 auto', width: 34, height: 34, borderRadius: '50%', border: '2.5px solid var(--ink,#2d2a26)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>{s.n}</span>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 15 }}>{s.title}</b>
              <p style={{ margin: '3px 0 0', fontSize: 13.5, lineHeight: 1.5, opacity: 0.9 }}>{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <hr style={dottedRule} />

      {/* Why the sketch look — the identity note. */}
      <div className="card" style={{ padding: '18px 20px', background: 'var(--paper,#fbf7ee)', transform: 'rotate(0.3deg)' }}>
        <p style={eyebrow}>Why the pencil?</p>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
          Everything here is drawn like a page from a notebook — dashed borders, wobbly cards, a friendly marker
          font — because that is how the best studying actually feels: rough, hand-made, and yours. The paper look
          keeps lessons light and approachable, so learning never feels like a form to fill in.
        </p>
      </div>

      {/* Two ways out — into the galleries. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '22px 0 30px' }}>
        <button className="btn green" onClick={() => app.nav('slides')}>🎞️ Browse slide tools</button>
        <button className="btn ghost" onClick={() => app.nav('tools')}>📁 Explore repos</button>
      </div>
    </>
  );
}
