"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, fmtDate, inputCls, Spinner } from "@/components/ui";
import type { PublicUser, Role } from "@/lib/types";

const ROLES: Role[] = ["user", "teacher", "moderator", "admin"];

export default function AdminUsersPage() {
  const { user: me, api, loading } = useAuth();
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(() => {
    api<{ users: PublicUser[] }>("/api/admin/users")
      .then((d) => setUsers(d.users))
      .catch(() => setDenied(true));
  }, [api]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading, me?.id]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      await api("/api/admin/users", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
      load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId("");
    }
  };

  if (denied) {
    return <div className="grid h-full place-items-center text-[13px] text-mut">Moderator or admin access required.</div>;
  }
  if (!users) {
    return <div className="grid h-full place-items-center"><Spinner label="Loading users…" /></div>;
  }

  const isAdmin = me?.role === "admin";
  const filtered = q.trim()
    ? users.filter((u) => `${u.username} ${u.name} ${u.email ?? ""} ${u.role}`.toLowerCase().includes(q.toLowerCase()))
    : users;

  return (
    <div className="mx-auto max-w-[1050px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Users & moderators</h1>
          <p className="text-[13px] text-mut">
            {isAdmin ? "Manage roles, token balances and suspensions." : "Moderators can adjust tokens and suspend accounts; roles are admin-only."}
          </p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…" className={`${inputCls} max-w-xs`} />
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[860px] text-[12.5px]">
          <thead>
            <tr className="bg-panel2/70 text-left text-mut">
              <th className="px-3 py-2.5 font-medium">User</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium">Tokens</th>
              <th className="px-3 py-2.5 font-medium">Subscription</th>
              <th className="px-3 py-2.5 font-medium">Joined</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const subActive = u.subscription && new Date(u.subscription.expiresAt).getTime() > Date.now();
              return (
                <tr key={u.id} className={`border-t border-line ${u.suspended ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-[11.5px] text-mut">@{u.username}{u.email ? ` · ${u.email}` : ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    {isAdmin ? (
                      <select
                        value={u.role}
                        disabled={busyId === u.id || u.id === me?.id}
                        onChange={(e) => patch(u.id, { role: e.target.value })}
                        className="rounded-md border border-line2 bg-panel2 px-2 py-1 text-[12px]"
                      >
                        {ROLES.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    ) : (
                      <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">{u.tokens.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {subActive ? (
                      <Badge tone="live">{u.subscription!.planName} → {u.subscription!.expiresAt.slice(0, 10)}</Badge>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-mut">{fmtDate(u.createdAt).slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        disabled={busyId === u.id}
                        onClick={() => {
                          const v = window.prompt(`Add tokens to @${u.username} (negative to deduct):`, "1000");
                          if (v != null && v.trim() !== "" && Number.isFinite(Number(v))) patch(u.id, { addTokens: Number(v) });
                        }}
                        className="rounded-md border border-line2 px-2 py-1 text-[11.5px] text-mut hover:text-brand"
                      >
                        🪙 Tokens
                      </button>
                      {u.id !== me?.id && u.role !== "admin" && (
                        <button
                          disabled={busyId === u.id}
                          onClick={() => patch(u.id, { suspended: !u.suspended })}
                          className={`rounded-md border px-2 py-1 text-[11.5px] ${u.suspended ? "border-live/40 text-live" : "border-line2 text-mut hover:text-bad"}`}
                        >
                          {u.suspended ? "Reinstate" : "Suspend"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
