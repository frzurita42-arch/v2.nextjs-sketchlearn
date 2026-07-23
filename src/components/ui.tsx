"use client";

import React from "react";

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-line bg-panel ${className}`}>
      {(title || right) && (
        <header className="flex h-11 items-center justify-between gap-3 border-b border-line bg-panel2/60 px-4">
          <div className="min-w-0 truncate text-[13px] font-semibold text-ink">{title}</div>
          <div className="flex shrink-0 items-center gap-2">{right}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "brand";
}) {
  const styles = {
    primary: "bg-ink text-black hover:bg-white disabled:hover:bg-ink",
    brand: "bg-brand text-black hover:brightness-110",
    ghost: "border border-line2 text-ink hover:bg-panel2",
    danger: "border border-bad/40 text-bad hover:bg-bad/10",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "live" | "warn" | "bad" | "brand";
}) {
  const styles = {
    neutral: "bg-raise text-mut",
    live: "bg-live/15 text-live",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    brand: "bg-brand/15 text-brand",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] ${styles}`}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[12px] font-medium text-mut">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-dim">{hint}</div>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line2 bg-panel2 px-3 py-2 text-[13.5px] text-ink placeholder:text-dim outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40";

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-mut">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line2 border-t-brand" />
      {label}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line2 px-6 py-14 text-center">
      <div className="text-3xl">{icon}</div>
      <div className="mt-2 text-[15px] font-semibold">{title}</div>
      <div className="mt-1 max-w-md text-[13px] text-mut">{children}</div>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[13px] text-bad">
      {children}
    </div>
  );
}

export function fmtElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}
