"use client";

import katex from "katex";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Slide, SlideComponent } from "@/lib/types";
import { Chart } from "./Chart";

// Renders one templated slide: prose paragraphs plus deliberately-chosen
// support components (formula, chart, diagram, table, sticky note, image,
// code, worked steps), a per-slide multiple-choice quiz, and read-aloud TTS.

function Latex({ latex, caption }: { latex: string; caption?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { displayMode: true, throwOnError: false });
    } catch {
      return null;
    }
  }, [latex]);
  return (
    <figure className="rounded-xl border border-line bg-panel2/50 px-4 py-3 text-center">
      {html ? (
        <div className="text-[17px]" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <code className="font-mono text-[15px] text-brand">{latex}</code>
      )}
      {caption && <figcaption className="mt-1 text-[12px] text-mut">{caption}</figcaption>}
    </figure>
  );
}

function ImageSlot({ prompt, dataUrl, alt, imageStyle }: { prompt: string; dataUrl?: string; alt: string; imageStyle: string }) {
  if (dataUrl) {
    return (
      <figure className="overflow-hidden rounded-xl border border-line">
        {/* AI-generated data URLs can't go through next/image optimization */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt={alt} className="max-h-[340px] w-full object-cover" />
        <figcaption className="bg-panel2/60 px-3 py-1.5 text-[12px] text-mut">{alt}</figcaption>
      </figure>
    );
  }
  // Placeholder art when no image provider is configured — keeps layout honest.
  return (
    <figure className="grid place-items-center rounded-xl border border-dashed border-line2 bg-panel2/40 px-4 py-8 text-center">
      <div className="text-2xl">🖼️</div>
      <div className="mt-1 max-w-md text-[12.5px] italic text-mut">
        “{prompt}” <span className="not-italic text-dim">— {imageStyle}</span>
      </div>
      <div className="mt-1 text-[11px] text-dim">Enable image generation in Settings to render this.</div>
    </figure>
  );
}

function Component({ comp, imageStyle }: { comp: SlideComponent; imageStyle: string }) {
  switch (comp.type) {
    case "paragraphs":
      return (
        <div className="space-y-3">
          {comp.texts.map((t, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-ink/95">
              {t}
            </p>
          ))}
        </div>
      );
    case "latex":
      return <Latex latex={comp.latex} caption={comp.caption} />;
    case "chart":
      return (
        <div>
          <Chart spec={comp.chart} />
          {comp.caption && <div className="mt-1 text-[12px] text-mut">{comp.caption}</div>}
        </div>
      );
    case "svg":
      return (
        <figure className="rounded-xl border border-line bg-panel2/50 p-3">
          <div
            className="mx-auto max-w-[440px] [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: comp.svg }}
          />
          {comp.caption && <figcaption className="mt-1 text-center text-[12px] text-mut">{comp.caption}</figcaption>}
        </figure>
      );
    case "table":
      return (
        <figure className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-brand/15 text-left">
                {comp.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 font-semibold text-brand">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comp.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 text-ink/90">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {comp.caption && <figcaption className="bg-panel2/60 px-3 py-1.5 text-[12px] text-mut">{comp.caption}</figcaption>}
        </figure>
      );
    case "sticky":
      return (
        <div className="sl-sticky px-4 py-3 text-[13.5px] text-ink">
          📌 <span className="ml-1">{comp.text}</span>
        </div>
      );
    case "image":
      return <ImageSlot prompt={comp.prompt} dataUrl={comp.dataUrl} alt={comp.alt} imageStyle={imageStyle} />;
    case "code":
      return (
        <figure className="overflow-hidden rounded-xl border border-line">
          <div className="flex items-center justify-between bg-panel2/80 px-3 py-1.5">
            <span className="font-mono text-[11px] text-mut">{comp.language}</span>
          </div>
          <pre className="overflow-x-auto bg-[#101013] p-3 font-mono text-[12.5px] leading-relaxed text-ink/90">
            <code>{comp.code}</code>
          </pre>
          {comp.caption && <figcaption className="bg-panel2/60 px-3 py-1.5 text-[12px] text-mut">{comp.caption}</figcaption>}
        </figure>
      );
    case "steps":
      return (
        <figure className="rounded-xl border border-line bg-panel2/40 p-4">
          <div className="mb-2 text-[13px] font-semibold text-brand">{comp.title || "Step-by-step solution"}</div>
          <ol className="space-y-2">
            {comp.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink/95">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-raise font-mono text-[11px] text-brand">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {comp.caption && <figcaption className="mt-2 text-[12px] text-mut">{comp.caption}</figcaption>}
        </figure>
      );
    default:
      return null;
  }
}

/** Collect every spoken word on the slide for read-aloud. */
function slideText(slide: Slide): string {
  const parts: string[] = [slide.title];
  for (const c of slide.components) {
    if (c.type === "paragraphs") parts.push(...c.texts);
    if (c.type === "sticky") parts.push(c.text);
    if (c.type === "steps") parts.push(...(c.title ? [c.title] : []), ...c.steps);
    if ("caption" in c && c.caption) parts.push(c.caption);
  }
  return parts.join(". ");
}

function ReadAloud({ slide }: { slide: Slide }) {
  const [speaking, setSpeaking] = useState(false);
  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);
  useEffect(() => stop, [slide.id, stop]);

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) return stop();
    // Chunk long text so no engine truncates it; narrate the WHOLE slide.
    const text = slideText(slide);
    const chunks = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text];
    window.speechSynthesis.cancel();
    let remaining = chunks.length;
    for (const chunk of chunks) {
      const u = new SpeechSynthesisUtterance(chunk.trim());
      u.rate = 1;
      u.onend = () => {
        remaining -= 1;
        if (remaining <= 0) setSpeaking(false);
      };
      window.speechSynthesis.speak(u);
    }
    setSpeaking(true);
  };

  return (
    <button
      onClick={speak}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
        speaking ? "border-brand/50 bg-brand/15 text-brand" : "border-line2 text-mut hover:text-ink"
      }`}
      title="Read this slide aloud"
    >
      {speaking ? "◼ Stop" : "🔊 Read aloud"}
    </button>
  );
}

export interface QuizResult {
  chosen: string;
  correct: boolean;
}

export function SlideView({
  slide,
  imageStyle,
  quizResult,
  onAnswer,
}: {
  slide: Slide;
  imageStyle: string;
  quizResult?: QuizResult | null;
  onAnswer?: (r: QuizResult) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [slide.id]);
  const answered = quizResult != null || picked != null;

  return (
    <article className="sl-fade-up mx-auto w-full max-w-[820px]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[22px] font-bold leading-snug tracking-tight">{slide.title}</h2>
        <ReadAloud slide={slide} />
      </div>
      <div className="space-y-4">
        {slide.components.map((c, i) => (
          <Component key={i} comp={c} imageStyle={imageStyle} />
        ))}
      </div>

      {slide.quiz && (
        <div className="mt-6 rounded-2xl border border-line bg-panel2/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            <span className="grid h-5 w-5 place-items-center rounded bg-brand/20 text-[11px] text-brand">Q</span>
            {slide.quiz.question}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {slide.quiz.options.map((opt, i) => {
              const isCorrect = i === slide.quiz!.correctIndex;
              const isPicked = picked === i || quizResult?.chosen === opt;
              let cls = "border-line2 hover:border-brand/50 hover:bg-panel2";
              if (answered) {
                if (isCorrect) cls = "border-live/60 bg-live/10 text-live";
                else if (isPicked) cls = "border-bad/60 bg-bad/10 text-bad";
                else cls = "border-line opacity-60";
              }
              return (
                <button
                  key={i}
                  disabled={answered}
                  onClick={() => {
                    setPicked(i);
                    onAnswer?.({ chosen: opt, correct: isCorrect });
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-left text-[13.5px] transition disabled:cursor-default ${cls}`}
                >
                  <span className="mr-2 font-mono text-[11px] text-dim">{"ABCD"[i]}.</span>
                  {opt}
                  {answered && isCorrect && <span className="ml-1.5">✓</span>}
                </button>
              );
            })}
          </div>
          {answered && slide.quiz.explanation && (
            <div className="mt-3 text-[12.5px] text-mut">{slide.quiz.explanation}</div>
          )}
        </div>
      )}
    </article>
  );
}
