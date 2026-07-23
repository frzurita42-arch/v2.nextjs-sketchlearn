"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Spinner } from "@/components/ui";
import type { ChatAction, ChatMessage } from "@/lib/types";

// The Coach chat — home page. A conversational assistant that helps the user
// decide what to make, then hands off to the Lesson Path composer (or opens
// an existing repo/tool).

const SUGGESTIONS = [
  { icon: "🔭", text: "Teach me the foundations of physics: motion and forces" },
  { icon: "🥞", text: "Build a menu experience for my breakfast restaurant" },
  { icon: "🔧", text: "Showcase my handyman services as a catalog" },
  { icon: "🗣️", text: "A beginner Spanish course, 3 units" },
];

export default function CoachChatPage() {
  const { user, api } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const runAction = (a: ChatAction) => {
    if (a.type === "lessonPath") {
      const params = new URLSearchParams({ prefill: a.value, ...(a.flavor ? { flavor: a.flavor } : {}) });
      router.push(`/path?${params}`);
    } else if (a.type === "openRepo") router.push(`/repos/${a.value}`);
    else if (a.type === "openTool") router.push(`/slides/${a.value}`);
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setSending(true);
    try {
      const data = await api<{ reply: string; actions: ChatAction[] }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next }),
      });
      setMessages([...next, { role: "assistant", content: data.reply, actions: data.actions }]);
    } catch (err) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong — try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-[880px] flex-col px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="sl-live-dot" />
          <h1 className="text-[15px] font-semibold">Coach chat</h1>
        </div>
        <Link href="/path" className="text-[12.5px] text-mut hover:text-brand">
          Skip the chat → open the Lesson Path composer
        </Link>
      </div>

      {/* Thread */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-line bg-panel p-4">
        {messages.length === 0 && (
          <div className="grid h-full place-items-center">
            <div className="max-w-lg text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand text-2xl text-black">✏</div>
              <h2 className="mt-4 text-[20px] font-bold tracking-tight">What should we build today?</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-mut">
                Describe anything you want to <b className="text-ink">learn</b> — or anything you want to{" "}
                <b className="text-ink">display</b>: a course, a restaurant menu, a product catalog, a portfolio.
                I&apos;ll turn it into a repository of units and lessons, each generating its own slide
                presentation that builds on the ones played before it.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    className="rounded-xl border border-line2 bg-panel2 px-3 py-2.5 text-left text-[12.5px] text-mut transition hover:border-brand/50 hover:text-ink"
                  >
                    <span className="mr-2">{s.icon}</span>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                m.role === "user" ? "bg-raise text-ink" : "border border-line bg-panel2/70 text-ink/95"
              }`}
            >
              {m.content}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {m.actions.map((a, j) => (
                    <button
                      key={j}
                      onClick={() => runAction(a)}
                      className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-black transition hover:brightness-110"
                    >
                      {a.label} →
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <Spinner label="Coach is thinking…" />}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-3 flex items-end gap-2 rounded-2xl border border-line bg-panel p-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={user ? "Describe what you want to learn or display…" : "Browse as a guest, or sign in to create…"}
          className="max-h-40 min-h-[42px] flex-1 resize-y bg-transparent px-2 py-2 text-[13.5px] outline-none placeholder:text-dim"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-black transition hover:bg-white disabled:opacity-40"
          aria-label="Send"
        >
          ➤
        </button>
      </form>
    </div>
  );
}
