"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, Spinner } from "@/components/ui";

interface Stats {
  users: number;
  activeSubscriptions: number;
  repos: number;
  tools: number;
  runs: number;
  runsThisWeek: number;
  pendingPayments: number;
  approvedRevenue: number;
  aiConfigured: boolean;
}

export default function AdminDashboardPage() {
  const { user, api, loading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (loading) return;
    api<{ stats: Stats }>("/api/admin/stats")
      .then((d) => setStats(d.stats))
      .catch(() => setDenied(true));
  }, [api, loading, user?.id]);

  if (denied) {
    return <div className="grid h-full place-items-center text-[13px] text-mut">Moderator or admin access required.</div>;
  }
  if (!stats) {
    return <div className="grid h-full place-items-center"><Spinner label="Loading dashboard…" /></div>;
  }

  const tiles: { label: string; value: string; href?: string; tone?: "warn" | "live" }[] = [
    { label: "Users", value: String(stats.users), href: "/admin/users" },
    { label: "Active subscriptions", value: String(stats.activeSubscriptions), tone: "live" },
    { label: "Pending payments", value: String(stats.pendingPayments), href: "/admin/payments", tone: stats.pendingPayments ? "warn" : undefined },
    { label: "Approved revenue", value: `$${stats.approvedRevenue}` },
    { label: "Repositories", value: String(stats.repos) },
    { label: "Slide tools", value: String(stats.tools) },
    { label: "Completed runs", value: String(stats.runs) },
    { label: "Runs this week", value: String(stats.runsThisWeek) },
  ];

  return (
    <div className="mx-auto max-w-[980px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">Dashboard</h1>
        <Badge tone={stats.aiConfigured ? "live" : "warn"}>
          {stats.aiConfigured ? "● AI provider configured" : "○ No AI key — template engine active"}
        </Badge>
      </div>
      {!stats.aiConfigured && (
        <p className="mt-2 text-[12.5px] text-mut">
          Add an Anthropic or OpenAI key in <Link href="/admin/settings" className="text-brand underline">Settings</Link> (or as a
          Vercel environment variable) to enable full AI generation.
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => {
          const inner = (
            <div className={`rounded-2xl border p-4 transition ${t.href ? "hover:border-line2 hover:bg-panel2/60" : ""} ${t.tone === "warn" ? "border-warn/40 bg-warn/5" : "border-line bg-panel"}`}>
              <div className="font-mono text-[24px] font-bold tracking-tight">{t.value}</div>
              <div className="mt-0.5 text-[12px] text-mut">{t.label}</div>
            </div>
          );
          return t.href ? <Link key={t.label} href={t.href}>{inner}</Link> : <div key={t.label}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
