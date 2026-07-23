"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useState } from "react";
import { ApiError, useAuth } from "@/components/AuthContext";
import { Button, ErrorNote, Field, inputCls, Panel, Spinner } from "@/components/ui";
import type { Repo, RepoFlavor } from "@/lib/types";

// The Lesson Path composer: one action generates BOTH a repository AND a
// linked slide tool, then lands the user on the REPOSITORY (the path's home).

const FLAVORS: { id: RepoFlavor | "auto"; icon: string; label: string; blurb: string }[] = [
  { id: "auto", icon: "✨", label: "Auto-detect", blurb: "Let the AI pick the best structure." },
  { id: "course", icon: "🎓", label: "Course", blurb: "A learning path: units → lessons → objectives." },
  { id: "menu", icon: "🍳", label: "Menu", blurb: "A restaurant: sections → dishes, each presented as a story." },
  { id: "catalog", icon: "🛠️", label: "Catalog", blurb: "Products or services: categories → items." },
  { id: "portfolio", icon: "🖼️", label: "Portfolio", blurb: "Your work: collections → projects." },
];

function PathComposer() {
  const { user, api } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [description, setDescription] = useState("");
  const [flavor, setFlavor] = useState<RepoFlavor | "auto">("auto");
  const [cost, setCost] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const prefill = params.get("prefill");
    if (prefill) setDescription(prefill);
    const f = params.get("flavor");
    if (f && FLAVORS.some((x) => x.id === f)) setFlavor(f as RepoFlavor);
  }, [params]);

  useEffect(() => {
    api<{ pathCost: number }>("/api/estimate", { method: "POST", body: "{}" })
      .then((d) => setCost(d.pathCost))
      .catch(() => {});
  }, [api]);

  const build = async () => {
    setError("");
    setBuilding(true);
    try {
      const data = await api<{ repo: Repo }>("/api/lesson-path", {
        method: "POST",
        body: JSON.stringify({ description, flavor }),
      });
      // Land on the repository — the path's home — not the individual deck.
      router.push(`/repos/${data.repo.slug}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError(`${err.message} Visit Plans & tokens to top up.`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to build the path.");
      }
      setBuilding(false);
    }
  };

  return (
    <div className="mx-auto max-w-[780px] px-4 py-6">
      <h1 className="text-[22px] font-bold tracking-tight">Lesson Path</h1>
      <p className="mt-1 text-[13.5px] text-mut">
        One action creates a <b className="text-ink">repository</b> (your syllabus or catalog) and a{" "}
        <b className="text-ink">linked slide tool</b> — every card&apos;s prompt generates a playable
        presentation, and each presentation builds on what the earlier ones already covered.
      </p>

      <Panel className="mt-5" title="1 · What is this path about?">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder={
            "e.g. “FS1111 — Foundations of Physics: motion and forces, for lower-intermediate students”\nor “My diner's breakfast, lunch and dinner menu — tell each dish's story”"
          }
          className={inputCls}
        />
      </Panel>

      <Panel className="mt-4" title="2 · Structure">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FLAVORS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFlavor(f.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                flavor === f.id ? "border-brand/60 bg-brand/10" : "border-line2 hover:bg-panel2"
              }`}
            >
              <div className="text-[13px] font-semibold">
                {f.icon} {f.label}
              </div>
              <div className="mt-0.5 text-[11.5px] text-mut">{f.blurb}</div>
            </button>
          ))}
        </div>
      </Panel>

      <div className="mt-4 space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4">
          <div className="text-[12.5px] text-mut">
            {cost != null && <>Estimated cost: <span className="font-mono text-brand">🪙 {cost}</span> · </>}
            {user ? (
              <>Balance: <span className="font-mono text-ink">{user.tokens.toLocaleString()}</span></>
            ) : (
              <>
                <Link href="/login" className="text-brand underline">Sign in</Link> to build a path.
              </>
            )}
          </div>
          {building ? (
            <Spinner label="Designing your path (repo + slide tool)…" />
          ) : (
            <Button variant="brand" disabled={!user || description.trim().length < 10} onClick={build}>
              Generate both →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PathPage() {
  return (
    <Suspense>
      <PathComposer />
    </Suspense>
  );
}
