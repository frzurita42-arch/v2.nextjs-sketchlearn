"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, Button, EmptyState, ErrorNote, Field, inputCls, Spinner } from "@/components/ui";
import type { SlideTool } from "@/lib/types";

export default function SlidesGalleryPage() {
  const { user, api } = useAuth();
  const [tools, setTools] = useState<SlideTool[] | null>(null);
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ tools: SlideTool[] }>("/api/tools").then((d) => setTools(d.tools)).catch(() => setTools([]));
  }, [api]);

  const filtered = useMemo(() => {
    if (!tools) return null;
    let out = tools;
    if (q.trim()) {
      const needle = q.toLowerCase();
      out = out.filter((t) => t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle));
    }
    if (favOnly && user) out = out.filter((t) => user.favoriteTools.includes(t.slug));
    return out;
  }, [tools, q, favOnly, user]);

  const create = async () => {
    setError("");
    try {
      const d = await api<{ tool: SlideTool }>("/api/tools", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      setTools((t) => (t ? [d.tool, ...t] : [d.tool]));
      setCreating(false);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the tool.");
    }
  };

  const toggleFav = async (slug: string) => {
    if (!user) return;
    await api("/api/favorites", { method: "POST", body: JSON.stringify({ kind: "tool", slug }) });
    const idx = user.favoriteTools.indexOf(slug);
    if (idx === -1) user.favoriteTools.push(slug);
    else user.favoriteTools.splice(idx, 1);
    setTools((t) => (t ? [...t] : t));
  };

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Slide tools</h1>
          <p className="text-[13px] text-mut">Reusable generators — give one a topic and it builds a playable presentation.</p>
        </div>
        {user && (
          <Button variant="brand" onClick={() => setCreating(!creating)}>
            {creating ? "Close" : "+ New slide tool"}
          </Button>
        )}
      </div>

      {creating && (
        <div className="mt-4 space-y-3 rounded-2xl border border-line bg-panel p-4">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. FS1111 Slide Generator" />
          </Field>
          <Field label="Default topic / description" hint="Used as the topic when none is given at play time.">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button variant="brand" disabled={!title.trim()} onClick={create}>Create tool</Button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search slide tools…" className={`${inputCls} max-w-xs`} />
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
        <div className="mt-10 grid place-items-center"><Spinner label="Loading slide tools…" /></div>
      ) : filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon="🎞" title="No slide tools yet">
            Create one here, or build a whole <Link href="/path" className="text-brand underline">Lesson Path</Link> and get a linked tool automatically.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/slides/${t.slug}`}
              prefetch
              className="group rounded-2xl border border-line bg-panel p-4 transition hover:border-line2 hover:bg-panel2/60"
            >
              <div className="flex items-start justify-between">
                <div className="text-[22px]">🎞</div>
                <div className="flex items-center gap-1.5">
                  <Badge>{t.defaults.slideCount} slides</Badge>
                  {user && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toggleFav(t.slug);
                      }}
                      className={`text-[15px] ${user.favoriteTools.includes(t.slug) ? "text-brand" : "text-dim hover:text-mut"}`}
                      aria-label="Toggle favorite"
                    >
                      ★
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 line-clamp-1 text-[15px] font-semibold group-hover:text-brand">{t.title}</div>
              <div className="mt-1 line-clamp-2 min-h-[34px] text-[12.5px] text-mut">{t.description}</div>
              <div className="mt-3 flex items-center gap-2 text-[11.5px] text-dim">
                <span>{t.defaults.level}</span>·<span>{t.defaults.imageStyle}</span>
                <span className="ml-auto">{t.plays} plays</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
