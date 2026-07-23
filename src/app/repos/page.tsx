"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, EmptyState, inputCls, Spinner } from "@/components/ui";
import { flavorLabels } from "@/lib/shared";
import type { Repo } from "@/lib/types";

const FLAVOR_ICON: Record<string, string> = { course: "🎓", menu: "🍳", catalog: "🛠️", portfolio: "🖼️" };

export default function ReposGalleryPage() {
  const { user, api } = useAuth();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
    api<{ repos: Repo[] }>("/api/repos").then((d) => setRepos(d.repos)).catch(() => setRepos([]));
  }, [api]);

  const filtered = useMemo(() => {
    if (!repos) return null;
    let out = repos;
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.title.toLowerCase().includes(needle) ||
          r.description.toLowerCase().includes(needle) ||
          r.ref.toLowerCase().includes(needle)
      );
    }
    if (favOnly && user) out = out.filter((r) => user.favoriteRepos.includes(r.slug));
    return out;
  }, [repos, q, favOnly, user]);

  const toggleFav = async (slug: string) => {
    if (!user) return;
    await api("/api/favorites", { method: "POST", body: JSON.stringify({ kind: "repo", slug }) });
    // Optimistic-enough: refetch identity from /me via context refresh is heavier; flip locally.
    const idx = user.favoriteRepos.indexOf(slug);
    if (idx === -1) user.favoriteRepos.push(slug);
    else user.favoriteRepos.splice(idx, 1);
    setRepos((r) => (r ? [...r] : r));
  };

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Repositories</h1>
          <p className="text-[13px] text-mut">Courses, menus, catalogs and portfolios — each linked to its slide tool.</p>
        </div>
        <Link href="/path" className="rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-black hover:brightness-110">
          + New path
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, description or #ref…" className={`${inputCls} max-w-xs`} />
        {user && (
          <button
            onClick={() => setFavOnly(!favOnly)}
            className={`rounded-lg border px-3 py-2 text-[12.5px] ${favOnly ? "border-brand/60 bg-brand/10 text-brand" : "border-line2 text-mut hover:text-ink"}`}
          >
            ★ Favorites
          </button>
        )}
      </div>

      {!filtered ? (
        <div className="mt-10 grid place-items-center"><Spinner label="Loading repositories…" /></div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon="🗂" title="No repositories yet">
            Build your first path from the <Link className="text-brand underline" href="/path">Lesson Path composer</Link> or ask the <Link className="text-brand underline" href="/">Coach</Link>.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const labels = flavorLabels(r.flavor);
            const lessons = r.lessonSeqTotal;
            return (
              <Link
                key={r.id}
                href={`/repos/${r.slug}`}
                prefetch
                className="group rounded-2xl border border-line bg-panel p-4 transition hover:border-line2 hover:bg-panel2/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[22px]">{FLAVOR_ICON[r.flavor] ?? "🗂"}</div>
                  <div className="flex items-center gap-1.5">
                    <Badge>{r.ref}</Badge>
                    {user && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          toggleFav(r.slug);
                        }}
                        className={`text-[15px] ${user.favoriteRepos.includes(r.slug) ? "text-brand" : "text-dim hover:text-mut"}`}
                        aria-label="Toggle favorite"
                      >
                        ★
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 line-clamp-1 text-[15px] font-semibold group-hover:text-brand">{r.title}</div>
                <div className="mt-1 line-clamp-2 min-h-[34px] text-[12.5px] text-mut">{r.description}</div>
                <div className="mt-3 flex items-center gap-2 text-[11.5px] text-dim">
                  <span>{labels.repo}</span>·<span>{lessons} {labels.lesson.toLowerCase()}{lessons === 1 ? "" : "s"}</span>·<span>{r.plays} plays</span>
                  <span className="ml-auto">{r.ownerName}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
