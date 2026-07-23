"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, Button, EmptyState, fmtDate, fmtElapsed, inputCls, Spinner } from "@/components/ui";
import { clientId, flavorLabels } from "@/lib/shared";
import type { LessonCard, Repo, Run, SlideTool, UnitCard } from "@/lib/types";

// The repository page — the home of a lesson path: nested cards
// (UNIT → LESSON → PROMPT), study buttons that launch the linked slide tool
// with a seed, and the per-repo lesson-runs table (the cross-lesson memory).

export default function RepoPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, api } = useAuth();
  const router = useRouter();
  const [repo, setRepo] = useState<Repo | null>(null);
  const [tool, setTool] = useState<SlideTool | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [missing, setMissing] = useState(false);
  const [openPrompts, setOpenPrompts] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(() => {
    api<{ repo: Repo; runs: Run[]; tool: SlideTool | null }>(`/api/repos/${slug}`)
      .then((d) => {
        setRepo(d.repo);
        setRuns(d.runs);
        setTool(d.tool);
      })
      .catch(() => setMissing(true));
  }, [api, slug]);

  useEffect(load, [load]);

  if (missing) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-10">
        <EmptyState icon="🗂" title="Repository not found">
          It may have been deleted. <Link href="/repos" className="text-brand underline">Back to repositories</Link>.
        </EmptyState>
      </div>
    );
  }
  if (!repo) {
    return <div className="grid h-full place-items-center"><Spinner label="Loading repository…" /></div>;
  }

  const labels = flavorLabels(repo.flavor);
  const canEdit = !!user && (user.id === repo.ownerId || user.role === "admin" || user.role === "moderator");
  const completedSeqs = new Set(runs.map((r) => r.lessonSeq).filter((n): n is number => typeof n === "number"));

  const saveUnits = async (units: UnitCard[]) => {
    const d = await api<{ repo: Repo }>(`/api/repos/${slug}`, {
      method: "PATCH",
      body: JSON.stringify({ units }),
    });
    setRepo(d.repo);
  };

  const playHref = (lesson: LessonCard, unit: UnitCard) => {
    if (!repo.studyToolSlug) return "#";
    const idx = unit.lessons.findIndex((l) => l.id === lesson.id);
    const params = new URLSearchParams({
      repo: repo.slug,
      lesson: lesson.id,
      // Everything else in the seed is derived server-side from the repo, but
      // we pass the display bits so the player can show them instantly.
      unit: unit.title,
      i: String(idx + 1),
      n: String(unit.lessons.length),
      seq: String(lesson.lessonSeq),
      total: String(repo.lessonSeqTotal),
    });
    return `/slides/${repo.studyToolSlug}?${params}`;
  };

  const addUnit = () => {
    const title = window.prompt(`New ${labels.unit.toLowerCase()} title:`);
    if (!title?.trim()) return;
    saveUnits([...repo.units, { id: clientId("unit"), title: title.trim(), lessons: [] }]);
  };

  const addLesson = (unit: UnitCard) => {
    const title = window.prompt(`New ${labels.lesson.toLowerCase()} title:`);
    if (!title?.trim()) return;
    const lesson: LessonCard = {
      id: clientId("les"),
      title: title.trim(),
      objective: "",
      prompt: `Teach/present "${title.trim()}" in the context of "${repo.title}". Assume everything from earlier ${labels.lesson.toLowerCase()}s is known — reference it, don't re-teach it.`,
      lessonSeq: 0,
      subtopics: [],
    };
    saveUnits(repo.units.map((u) => (u.id === unit.id ? { ...u, lessons: [...u.lessons, lesson] } : u)));
  };

  const savePrompt = (unitId: string, lessonId: string) => {
    saveUnits(
      repo.units.map((u) =>
        u.id === unitId
          ? { ...u, lessons: u.lessons.map((l) => (l.id === lessonId ? { ...l, prompt: draft } : l)) }
          : u
      )
    );
    setEditing(null);
  };

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{repo.ref}</Badge>
            <Badge tone="brand">{labels.repo}</Badge>
            <span className="text-[11.5px] text-dim">by {repo.ownerName}</span>
          </div>
          <h1 className="mt-1.5 text-[24px] font-bold tracking-tight">🗂 {repo.title}</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-mut">{repo.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {tool ? (
            <Link
              href={`/slides/${tool.slug}`}
              className="rounded-lg border border-line2 px-3 py-2 text-[12.5px] text-ink hover:bg-panel2"
            >
              🎞 Study tool: <span className="text-brand">{tool.title}</span>
            </Link>
          ) : (
            <span className="text-[12px] text-dim">No slide tool linked yet</span>
          )}
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={addUnit}>+ {labels.unit}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!window.confirm(`Delete "${repo.title}"? Its runs are kept in Presentation runs.`)) return;
                  await api(`/api/repos/${slug}`, { method: "DELETE" });
                  router.push("/repos");
                }}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Units → lessons → prompt cards */}
      <div className="mt-6 space-y-4">
        {repo.units.length === 0 && (
          <EmptyState icon="📦" title={`No ${labels.unit.toLowerCase()}s yet`}>
            {canEdit ? `Add your first ${labels.unit.toLowerCase()} to start building the path.` : "This repository is still being built."}
          </EmptyState>
        )}
        {repo.units.map((unit, ui) => (
          <section key={unit.id} className="overflow-hidden rounded-2xl border border-line bg-panel">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-panel2/60 px-4 py-2.5">
              <div className="text-[13.5px] font-semibold">
                <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-dim">
                  {labels.unit} {ui + 1}
                </span>
                📦 {unit.title}
              </div>
              {canEdit && (
                <button onClick={() => addLesson(unit)} className="text-[12px] text-mut hover:text-brand">
                  + {labels.lesson}
                </button>
              )}
            </header>
            <div className="divide-y divide-line">
              {unit.lessons.map((lesson) => {
                const done = completedSeqs.has(lesson.lessonSeq);
                return (
                  <div key={lesson.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={`font-mono text-[11px] ${done ? "text-live" : "text-dim"}`}>
                        L{lesson.lessonSeq}/{repo.lessonSeqTotal} {done && "✓"}
                      </span>
                      <span className="text-[14px] font-medium">📖 {lesson.title}</span>
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => setOpenPrompts((o) => ({ ...o, [lesson.id]: !o[lesson.id] }))}
                          className="rounded-md border border-line2 px-2 py-1 text-[11.5px] text-mut hover:text-ink"
                        >
                          🟡 Prompt
                        </button>
                        <Link
                          href={playHref(lesson, unit)}
                          className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                            repo.studyToolSlug ? "bg-brand text-black hover:brightness-110" : "pointer-events-none bg-raise text-dim"
                          }`}
                        >
                          🎬 {labels.play}
                        </Link>
                      </div>
                    </div>
                    {lesson.objective && (
                      <div className="mt-1 text-[12.5px] text-mut">Objective: {lesson.objective}</div>
                    )}
                    {openPrompts[lesson.id] && (
                      <div className="mt-2 rounded-xl border border-dashed border-brand/40 bg-brand/5 p-3">
                        {editing === lesson.id ? (
                          <div className="space-y-2">
                            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className={inputCls} />
                            <div className="flex gap-2">
                              <Button variant="brand" onClick={() => savePrompt(unit.id, lesson.id)}>Save prompt</Button>
                              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[12.5px] leading-relaxed text-ink/90">“{lesson.prompt}”</p>
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setEditing(lesson.id);
                                  setDraft(lesson.prompt);
                                }}
                                className="shrink-0 text-[11.5px] text-mut hover:text-brand"
                              >
                                ✎ Edit
                              </button>
                            )}
                          </div>
                        )}
                        {lesson.subtopics.length > 0 && (
                          <div className="mt-2 space-y-1 border-t border-line pt-2">
                            {lesson.subtopics.map((s) => (
                              <div key={s.id} className="text-[12px] text-mut">
                                <span className="font-mono text-[10.5px] uppercase text-dim">Subtopic</span> {s.title} — “{s.prompt}”
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {unit.lessons.length === 0 && (
                <div className="px-4 py-3 text-[12.5px] text-dim">No {labels.lesson.toLowerCase()}s in this {labels.unit.toLowerCase()} yet.</div>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Lesson runs — the memory the next generation reads */}
      <section className="mt-8">
        <h2 className="text-[15px] font-semibold">📋 {labels.lesson} runs</h2>
        <p className="mt-0.5 text-[12.5px] text-mut">
          Every completed play writes a lesson log back to this repo — the next {labels.lesson.toLowerCase()}&apos;s
          generation reads these so the path advances instead of repeating.
        </p>
        {runs.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-line2 px-4 py-6 text-center text-[12.5px] text-dim">
            No completed runs yet — play a {labels.lesson.toLowerCase()} all the way through to record the first log.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead>
                <tr className="bg-panel2/70 text-left text-mut">
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Played</th>
                  <th className="px-3 py-2 font-medium">{labels.unit}</th>
                  <th className="px-3 py-2 font-medium">{labels.lesson}</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Slides taught (summary)</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-mono text-[11.5px] text-brand">L{r.lessonSeq}/{r.lessonSeqTotal}</td>
                    <td className="px-3 py-2">{r.userName}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-mut">{fmtDate(r.playedAt)}</td>
                    <td className="px-3 py-2">{r.unitTitle}</td>
                    <td className="px-3 py-2">{r.lessonTitle}</td>
                    <td className="px-3 py-2 text-mut">{r.level}</td>
                    <td className="px-3 py-2 font-mono">{r.score}/{r.total}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-mut">{fmtElapsed(r.elapsedMs)}</td>
                    <td className="max-w-[300px] px-3 py-2 text-mut">
                      {r.slideLogs.map((s) => s.summary || s.title).join("; ").slice(0, 180)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
