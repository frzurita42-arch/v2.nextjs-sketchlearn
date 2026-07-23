"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

// The application frame: a left side-rail (grouped nav; admin section for
// moderators/admins), collapsed by default on phones/tablets, and a thin top
// progress bar during any data fetch.

const NAV = [
  {
    group: "Create",
    items: [
      { href: "/", label: "Coach chat", icon: "💬" },
      { href: "/path", label: "Lesson Path", icon: "🧭" },
    ],
  },
  {
    group: "Library",
    items: [
      { href: "/slides", label: "Slides", icon: "🎞" },
      { href: "/repos", label: "Repos", icon: "🗂" },
      { href: "/runs", label: "Presentation runs", icon: "📊" },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/pricing", label: "Plans & tokens", icon: "🪙" },
      { href: "/about", label: "About", icon: "✏️" },
    ],
  },
];

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: "📈" },
  { href: "/admin/payments", label: "Payments", icon: "🧾" },
  { href: "/admin/users", label: "Users & moderators", icon: "👥" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, busy, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Collapse the rail after navigating on small screens.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isAdmin = user && (user.role === "admin" || user.role === "moderator");

  const link = (href: string, label: string, icon: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
    return (
      <Link
        key={href}
        href={href}
        prefetch
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
          active ? "bg-raise text-ink" : "text-mut hover:bg-panel2 hover:text-ink"
        }`}
      >
        <span className="w-5 text-center text-[15px] leading-none">{icon}</span>
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      {busy && <div className="sl-progress" />}

      {/* Mobile scrim */}
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Side rail */}
      <aside
        className={`fixed z-40 flex h-full w-[248px] shrink-0 flex-col border-r border-line bg-panel transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-[17px] text-black">
            ✏
          </span>
          <span className="font-mono text-[15px] font-bold tracking-wide">
            Sketch<span className="text-brand">Learn</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-dim">
                {g.group}
              </div>
              <div className="space-y-0.5">{g.items.map((i) => link(i.href, i.label, i.icon))}</div>
            </div>
          ))}
          {isAdmin && (
            <div>
              <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-dim">
                Admin
              </div>
              <div className="space-y-0.5">{ADMIN_NAV.map((i) => link(i.href, i.label, i.icon))}</div>
            </div>
          )}
        </nav>

        {/* Account footer */}
        <div className="border-t border-line p-3">
          {user ? (
            <div className="rounded-xl bg-panel2 p-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raise text-[13px] font-bold uppercase text-brand">
                  {user.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{user.name}</div>
                  <div className="truncate text-[11px] text-mut">
                    @{user.username} · {user.role}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Link
                  href="/pricing"
                  className="rounded-md bg-raise px-2 py-1 font-mono text-[11.5px] text-brand hover:bg-line2"
                  title="Token balance — tap to top up"
                >
                  🪙 {user.tokens.toLocaleString()}
                </Link>
                <button
                  onClick={logout}
                  className="rounded-md px-2 py-1 text-[11.5px] text-mut hover:bg-raise hover:text-ink"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Link
                href="/login"
                className="flex-1 rounded-lg bg-ink px-3 py-2 text-center text-[13px] font-semibold text-black hover:bg-white"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="flex-1 rounded-lg border border-line2 px-3 py-2 text-center text-[13px] text-ink hover:bg-panel2"
              >
                Join free
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 lg:hidden">
          <button
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-mut"
          >
            ☰
          </button>
          <span className="font-mono text-sm font-bold">
            Sketch<span className="text-brand">Learn</span>
          </span>
          {user && (
            <span className="ml-auto font-mono text-[12px] text-brand">
              🪙 {user.tokens.toLocaleString()}
            </span>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
