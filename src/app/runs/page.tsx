"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, EmptyState, fmtDate, fmtElapsed, Spinner } from "@/components/ui";
import type { Run } from "@/lib/types";

// Presentation runs — every completed play across the site. "Direct" plays
// were generated straight from a slide tool without a repo, so course order
// is blank for them.

export default function RunsPage() {
  const { api } = useAuth();
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    api<{ runs: Run[] }>("/api/runs").then((d) => setRuns(d.runs)).catch(() => setRuns([]));
  }, [api]);

  return (
    <div className="mx-auto max-w-[1150px] px-4 py-6">
      <h1 className="text-[22px] font-bold tracking-tight">Presentation runs</h1>
      <p className="text-[13px] text-mut">
        Every completed play is recorded — only when finished all the way through. These logs are also the
        cross-lesson memory that later lessons build on.
      </p>

      {!runs ? (
        <div className="mt-10 grid place-items-center"><Spinner label="Loading runs…" /></div>
      ) : runs.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon="📊" title="No completed plays yet">
            Play a presentation from a <Link href="/slides" className="text-brand underline">slide tool</Link> or a{" "}
            <Link href="/repos" className="text-brand underline">repository</Link> to record the first run.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[900px] text-[12.5px]">
            <thead>
              <tr className="bg-panel2/70 text-left text-mut">
                <th className="px-3 py-2.5 font-medium">Slide tool</th>
                <th className="px-3 py-2.5 font-medium">Student</th>
                <th className="px-3 py-2.5 font-medium">Played</th>
                <th className="px-3 py-2.5 font-medium">Elapsed</th>
                <th className="px-3 py-2.5 font-medium">Repo ref</th>
                <th className="px-3 py-2.5 font-medium">Course order</th>
                <th className="px-3 py-2.5 font-medium">Level</th>
                <th className="px-3 py-2.5 font-medium">Image style</th>
                <th className="px-3 py-2.5 font-medium">Slides</th>
                <th className="px-3 py-2.5 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-panel2/40">
                  <td className="px-3 py-2">
                    <Link href={`/slides/${r.toolSlug}`} className="hover:text-brand">{r.toolTitle}</Link>
                  </td>
                  <td className="px-3 py-2">{r.userName}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-mut">{fmtDate(r.playedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-mut">{fmtElapsed(r.elapsedMs)}</td>
                  <td className="px-3 py-2">
                    {r.repoSlug ? (
                      <Link href={`/repos/${r.repoSlug}`}><Badge tone="brand">{r.repoRef}</Badge></Link>
                    ) : (
                      <Badge>Direct</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11.5px]">
                    {r.lessonSeq ? `L${r.lessonSeq}/${r.lessonSeqTotal}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-mut">{r.level}</td>
                  <td className="px-3 py-2 text-mut">{r.imageStyle}</td>
                  <td className="px-3 py-2 font-mono">{r.slideCount}</td>
                  <td className="px-3 py-2 font-mono">{r.score}/{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
