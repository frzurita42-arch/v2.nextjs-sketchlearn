"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, Button, fmtDate, Spinner } from "@/components/ui";
import type { Payment } from "@/lib/types";

type Row = Payment & { hasProof?: boolean };

// The manual-payments review queue: inspect the uploaded receipt, then
// approve (activates the subscription + grants tokens) or reject.

export default function AdminPaymentsPage() {
  const { api, loading, user } = useAuth();
  const [payments, setPayments] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [proof, setProof] = useState<{ id: string; url: string } | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(() => {
    api<{ payments: Row[] }>("/api/admin/payments")
      .then((d) => setPayments(d.payments))
      .catch(() => setDenied(true));
  }, [api]);

  useEffect(() => {
    if (!loading) load();
  }, [load, loading, user?.id]);

  const viewProof = async (id: string) => {
    const d = await api<{ payments: Payment[] }>(`/api/admin/payments?proof=${id}`);
    const url = d.payments[0]?.proofDataUrl;
    if (url) setProof({ id, url });
  };

  const review = async (id: string, decision: "approved" | "rejected") => {
    const adminNote = decision === "rejected" ? window.prompt("Reason for rejection (shown to the user):") ?? "" : "";
    setBusyId(id);
    try {
      await api("/api/admin/payments", {
        method: "PATCH",
        body: JSON.stringify({ id, decision, adminNote }),
      });
      load();
    } finally {
      setBusyId("");
    }
  };

  if (denied) {
    return <div className="grid h-full place-items-center text-[13px] text-mut">Moderator or admin access required.</div>;
  }
  if (!payments) {
    return <div className="grid h-full place-items-center"><Spinner label="Loading payments…" /></div>;
  }

  const pending = payments.filter((p) => p.status === "pending");
  const reviewed = payments.filter((p) => p.status !== "pending");

  const table = (rows: Row[], showActions: boolean) => (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[760px] text-[12.5px]">
        <thead>
          <tr className="bg-panel2/70 text-left text-mut">
            <th className="px-3 py-2.5 font-medium">User</th>
            <th className="px-3 py-2.5 font-medium">Plan</th>
            <th className="px-3 py-2.5 font-medium">Amount</th>
            <th className="px-3 py-2.5 font-medium">Reference</th>
            <th className="px-3 py-2.5 font-medium">Submitted</th>
            <th className="px-3 py-2.5 font-medium">Proof</th>
            <th className="px-3 py-2.5 font-medium">{showActions ? "Decision" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-line align-middle">
              <td className="px-3 py-2">{p.userName}</td>
              <td className="px-3 py-2">{p.planName}</td>
              <td className="px-3 py-2 font-mono">${p.amount} {p.currency}</td>
              <td className="max-w-[180px] truncate px-3 py-2 font-mono text-[11.5px] text-mut">{p.reference || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-mut">{fmtDate(p.createdAt)}</td>
              <td className="px-3 py-2">
                {p.hasProof ? (
                  <button onClick={() => viewProof(p.id)} className="text-brand underline">View receipt</button>
                ) : (
                  <span className="text-dim">none</span>
                )}
              </td>
              <td className="px-3 py-2">
                {showActions ? (
                  <div className="flex gap-1.5">
                    <Button variant="brand" className="!px-2.5 !py-1 !text-[11.5px]" disabled={busyId === p.id} onClick={() => review(p.id, "approved")}>
                      ✓ Approve
                    </Button>
                    <Button variant="danger" className="!px-2.5 !py-1 !text-[11.5px]" disabled={busyId === p.id} onClick={() => review(p.id, "rejected")}>
                      ✗ Reject
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge tone={p.status === "approved" ? "live" : "bad"}>{p.status}</Badge>
                    <span className="text-[11px] text-dim">by {p.reviewedBy}</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-dim">Nothing here.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1050px] px-4 py-6">
      <h1 className="text-[22px] font-bold tracking-tight">Payments</h1>
      <p className="text-[13px] text-mut">
        Approving a payment activates the plan&apos;s subscription on the account and grants its tokens.
      </p>

      <h2 className="mt-6 flex items-center gap-2 text-[14px] font-semibold">
        Pending review {pending.length > 0 && <Badge tone="warn">{pending.length}</Badge>}
      </h2>
      <div className="mt-2">{table(pending, true)}</div>

      <h2 className="mt-8 text-[14px] font-semibold">Reviewed</h2>
      <div className="mt-2">{table(reviewed, false)}</div>

      {/* Receipt viewer */}
      {proof && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={() => setProof(null)}>
          <div className="max-h-[85vh] max-w-2xl overflow-auto rounded-2xl border border-line bg-panel p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof.url} alt="Payment receipt" className="w-full rounded-lg" />
            <div className="mt-2 text-center text-[12px] text-mut">Click anywhere to close</div>
          </div>
        </div>
      )}
    </div>
  );
}
