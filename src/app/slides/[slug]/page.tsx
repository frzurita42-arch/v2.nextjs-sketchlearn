"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { ApiError, useAuth } from "@/components/AuthContext";
import { SlideView, type QuizResult } from "@/components/SlideView";
import { Badge, Button, ErrorNote, Field, inputCls, Panel, Spinner } from "@/components/ui";
import type { Deck, PlaySeed, Repo, SlideLogEntry, SlideTool } from "@/lib/types";

// The slide tool page: launcher (settings + cost gate) → player (templated
// slides with per-slide quiz) → completion (saves the run / lesson log).

const LEVELS = ["Beginner", "Lower Intermediate", "Intermediate", "Advanced"];
const STYLES = ["Chalkboard sketch", "Watercolor", "Flat illustration", "Photorealistic", "Hand-drawn ink", "Any"];

function summarize(texts: string[]): string {
  const joined = texts.join(" ");
  return joined.length > 220 ? `${joined.slice(0, 217)}…` : joined;
}

function ToolPageInner() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearchParams();
  const { user, api, refresh } = useAuth();

  const [tool, setTool] = useState<SlideTool | null>(null);
  const [missing, setMissing] = useState(false);
  const [repo, setRepo] = useState<Repo | null>(null);

  // Launcher state
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [imageStyle, setImageStyle] = useState("");
  const [cost, setCost] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  // Player state
  const [deck, setDeck] = useState<Deck | null>(null);
  const [memoryLessons, setMemoryLessons] = useState(0);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuizResult>>({});
  const [startedAt, setStartedAt] = useState(0);
  const [finished, setFinished] = useState(false);
  const [savedRun, setSavedRun] = useState<null | { score: number; total: number }>(null);

  const repoSlug = search.get("repo");
  const lessonId = search.get("lesson");

  useEffect(() => {
    api<{ tool: SlideTool }>(`/api/tools/${slug}`)
      .then((d) => {
        setTool(d.tool);
        setLevel(d.tool.defaults.level);
        setSlideCount(d.tool.defaults.slideCount);
        setImageStyle(d.tool.defaults.imageStyle);
        if (!repoSlug) setTopic(d.tool.description);
      })
      .catch(() => setMissing(true));
  }, [api, slug, repoSlug]);

  // Launched from a repo: preset the lesson's PROMPT as topic and build a seed.
  useEffect(() => {
    if (!repoSlug) return;
    api<{ repo: Repo }>(`/api/repos/${repoSlug}`)
      .then((d) => {
        setRepo(d.repo);
        for (const unit of d.repo.units) {
          const lesson = unit.lessons.find((l) => l.id === lessonId);
          if (lesson) setTopic(lesson.prompt);
        }
      })
      .catch(() => {});
  }, [api, repoSlug, lessonId]);

  useEffect(() => {
    api<{ cost: number }>("/api/estimate", { method: "POST", body: JSON.stringify({ slideCount }) })
      .then((d) => setCost(d.cost))
      .catch(() => {});
  }, [api, slideCount]);

  const seed: PlaySeed | null = useMemo(() => {
    if (!repo || !lessonId) return null;
    for (const unit of repo.units) {
      const i = unit.lessons.findIndex((l) => l.id === lessonId);
      if (i !== -1) {
        const lesson = unit.lessons[i];
        return {
          repoSlug: repo.slug,
          repoRef: repo.ref,
          unitTitle: unit.title,
          lessonTitle: lesson.title,
          lessonIndex: i + 1,
          lessonCount: unit.lessons.length,
          lessonSeq: lesson.lessonSeq,
          lessonSeqTotal: repo.lessonSeqTotal,
        };
      }
    }
    return null;
  }, [repo, lessonId]);

  const generate = async () => {
    setError("");
    setGenerating(true);
    try {
      const d = await api<{ deck: Deck; memoryLessons: number }>(`/api/tools/${slug}/generate`, {
        method: "POST",
        body: JSON.stringify({ topic, level, slideCount, imageStyle, seed }),
      });
      setDeck(d.deck);
      setMemoryLessons(d.memoryLessons);
      setIdx(0);
      setAnswers({});
      setFinished(false);
      setSavedRun(null);
      setStartedAt(Date.now());
      refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError(`${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "Generation failed.");
      }
    } finally {
      setGenerating(false);
    }
  };

  const finish = async () => {
    if (!deck || !tool) return;
    setFinished(true);
    const logs: SlideLogEntry[] = deck.slides.map((s) => {
      const texts = s.components.flatMap((c) => (c.type === "paragraphs" ? c.texts : []));
      const a = answers[s.id];
      return {
        title: s.title,
        summary: summarize(texts),
        visuals: s.components.filter((c) => c.type !== "paragraphs").map((c) => c.type),
        question: s.quiz?.question,
        chosen: a?.chosen,
        correct: a?.correct,
      };
    });
    const total = deck.slides.filter((s) => s.quiz).length;
    const score = Object.values(answers).filter((a) => a.correct).length;
    try {
      await api("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: tool.slug,
          toolTitle: tool.title,
          elapsedMs: Date.now() - startedAt,
          repoSlug: deck.seed?.repoSlug,
          repoRef: deck.seed?.repoRef,
          unitTitle: deck.seed?.unitTitle,
          lessonTitle: deck.seed?.lessonTitle,
          lessonSeq: deck.seed?.lessonSeq,
          lessonSeqTotal: deck.seed?.lessonSeqTotal,
          level: deck.level,
          imageStyle: deck.imageStyle,
          score,
          total,
          slideLogs: logs,
        }),
      });
      setSavedRun({ score, total });
    } catch {
      setSavedRun({ score, total });
    }
  };

  if (missing) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-10 text-center text-mut">
        Slide tool not found. <Link href="/slides" className="text-brand underline">Back to slide tools</Link>.
      </div>
    );
  }
  if (!tool) {
    return <div className="grid h-full place-items-center"><Spinner label="Loading slide tool…" /></div>;
  }

  // ------- Player -------
  if (deck && !finished) {
    const slide = deck.slides[idx];
    const answered = !slide.quiz || answers[slide.id] != null;
    const isLast = idx === deck.slides.length - 1;
    return (
      <div className="flex h-full flex-col">
        {/* Player top bar */}
        <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
          <button onClick={() => setDeck(null)} className="text-[12px] text-mut hover:text-ink">← Exit</button>
          <div className="min-w-0 truncate text-[13px] font-semibold">{tool.title}</div>
          {deck.seed && (
            <Badge tone="brand">
              {deck.seed.repoRef} · Lesson {deck.seed.lessonSeq} of {deck.seed.lessonSeqTotal}
            </Badge>
          )}
          {deck.engine === "template" && <Badge tone="warn">template engine</Badge>}
          {memoryLessons > 0 && <Badge tone="live">builds on {memoryLessons} earlier lesson{memoryLessons > 1 ? "s" : ""}</Badge>}
          <div className="ml-auto flex items-center gap-2 font-mono text-[12px] text-mut">
            <span>Slide {idx + 1} / {deck.slides.length}</span>
            <span className="text-brand">{"▓".repeat(idx + 1)}{"░".repeat(deck.slides.length - idx - 1)}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <SlideView
            slide={slide}
            imageStyle={deck.imageStyle}
            quizResult={answers[slide.id] ?? null}
            onAnswer={(r) => setAnswers((a) => ({ ...a, [slide.id]: r }))}
          />
        </div>

        <div className="flex items-center justify-between border-t border-line bg-panel px-4 py-3">
          <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Back</Button>
          <div className="text-[12px] text-dim">
            {slide.quiz && !answered ? "Answer the question to continue" : " "}
          </div>
          {isLast ? (
            <Button variant="brand" disabled={!answered} onClick={finish}>Finish ✓</Button>
          ) : (
            <Button disabled={!answered} onClick={() => setIdx(idx + 1)}>Next →</Button>
          )}
        </div>
      </div>
    );
  }

  // ------- Completion -------
  if (deck && finished) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-14 text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="mt-3 text-[24px] font-bold">Presentation complete</h1>
        {savedRun ? (
          <p className="mt-2 text-[14px] text-mut">
            Score: <span className="font-mono text-ink">{savedRun.score}/{savedRun.total}</span> — this run was
            recorded{deck.seed ? " and its lesson log will shape the next lesson in the path" : ""}.
          </p>
        ) : (
          <Spinner label="Saving your run…" />
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {deck.seed && (
            <Link href={`/repos/${deck.seed.repoSlug}`} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-black hover:brightness-110">
              ← Back to the path
            </Link>
          )}
          <Button variant="ghost" onClick={() => { setDeck(null); setFinished(false); }}>
            Generate another
          </Button>
          <Link href="/runs" className="rounded-lg border border-line2 px-4 py-2 text-[13px] text-ink hover:bg-panel2">
            View all runs
          </Link>
        </div>
      </div>
    );
  }

  // ------- Launcher -------
  return (
    <div className="mx-auto max-w-[780px] px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[22px] font-bold tracking-tight">🎞 {tool.title}</h1>
        <Badge>{tool.plays} plays</Badge>
        {seed && <Badge tone="brand">{seed.repoRef} · L{seed.lessonSeq}/{seed.lessonSeqTotal} — {seed.lessonTitle}</Badge>}
      </div>
      <p className="mt-1 text-[13.5px] text-mut">{tool.description}</p>
      {seed && (
        <p className="mt-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-[12.5px] text-mut">
          Launched from <Link href={`/repos/${seed.repoSlug}`} className="text-brand underline">{seed.unitTitle}</Link> —
          the objective prompt is preset below, and earlier lesson logs in this path will be folded into the generation.
        </p>
      )}

      <Panel className="mt-5" title="Generate a presentation">
        <div className="space-y-3">
          <Field label="Topic / activity prompt">
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={4} className={inputCls} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Level">
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
                {LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label={`Slides (max 15)`}>
              <input
                type="number" min={1} max={15} value={slideCount}
                onChange={(e) => setSlideCount(Math.min(15, Math.max(1, Number(e.target.value) || 1)))}
                className={inputCls}
              />
            </Field>
            <Field label="Image style">
              <select value={imageStyle} onChange={(e) => setImageStyle(e.target.value)} className={inputCls}>
                {STYLES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          {error && <ErrorNote>{error} {error.includes("tokens") && <Link className="underline" href="/pricing">Get tokens →</Link>}</ErrorNote>}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-[12.5px] text-mut">
              {cost != null && <>Cost: <span className="font-mono text-brand">🪙 {cost}</span></>}
              {user && <> · Balance: <span className="font-mono text-ink">{user.tokens.toLocaleString()}</span></>}
            </div>
            {generating ? (
              <Spinner label="Generating your slides…" />
            ) : (
              <Button variant="brand" disabled={!topic.trim()} onClick={generate}>
                Generate & play →
              </Button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default function ToolPage() {
  return (
    <Suspense>
      <ToolPageInner />
    </Suspense>
  );
}
