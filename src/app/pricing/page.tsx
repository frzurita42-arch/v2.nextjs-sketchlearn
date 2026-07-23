"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, Button, ErrorNote, Field, fmtDate, inputCls, Panel } from "@/components/ui";
import type { Payment, Plan } from "@/lib/types";

// Plans & tokens — subscription-based because generations consume AI tokens.
// The payment system is deliberately MANUAL: transfer outside the site, upload
// the receipt, and an admin activates the subscription after review.

export default function PricingPage() {
  const { user, api, refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [instructions, setInstructions] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [selected, setSelected] = useState<Plan | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<string>("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [mine, setMine] = useState<Payment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ plans: Plan[]; paymentInstructions: string; paymentSheetUrl: string }>("/api/plans").then((d) => {
      setPlans(d.plans);
      setInstructions(d.paymentInstructions);
      setSheetUrl(d.paymentSheetUrl);
    });
  }, [api]);

  useEffect(() => {
    if (!user) return;
    api<{ payments: Payment[] }>("/api/payments").then((d) => setMine(d.payments)).catch(() => {});
  }, [api, user, submitted]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setError("Receipt image must be under 3MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProof(String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!selected) return;
    setError("");
    try {
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({ planId: selected.id, reference, note, proofDataUrl: proof }),
      });
      setSubmitted(true);
      setSelected(null);
      setReference("");
      setNote("");
      setProof("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit the payment.");
    }
  };

  const active = user?.subscription && new Date(user.subscription.expiresAt).getTime() > Date.now();

  return (
    <div className="mx-auto max-w-[980px] px-4 py-6">
      <h1 className="text-[22px] font-bold tracking-tight">Plans & tokens</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] text-mut">
        Generations run on AI and consume tokens, so SketchLearn is subscription-based. Pick a plan,
        transfer manually, upload your proof — an administrator reviews it and activates your subscription.
      </p>

      {user && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-4">
          <Badge tone="brand">🪙 {user.tokens.toLocaleString()} tokens</Badge>
          {active ? (
            <Badge tone="live">
              {user.subscription!.planName} — active until {user.subscription!.expiresAt.slice(0, 10)}
            </Badge>
          ) : (
            <Badge>No active subscription</Badge>
          )}
        </div>
      )}

      {submitted && (
        <div className="mt-4 rounded-xl border border-live/40 bg-live/10 px-4 py-3 text-[13px] text-live">
          ✓ Payment submitted. An administrator will review your proof and activate the plan — usually within a day.
        </div>
      )}

      {/* Plans */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-2xl border p-5 transition ${
              selected?.id === p.id ? "border-brand/70 bg-brand/5" : "border-line bg-panel"
            }`}
          >
            <div className="text-[15px] font-bold">{p.name}</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[28px] font-bold tracking-tight">${p.price}</span>
              <span className="text-[12px] text-mut">/{p.days} days</span>
            </div>
            <div className="mt-1 font-mono text-[13px] text-brand">🪙 {p.tokens.toLocaleString()} tokens</div>
            <p className="mt-2 flex-1 text-[12.5px] text-mut">{p.blurb}</p>
            <Button
              variant={selected?.id === p.id ? "brand" : "ghost"}
              className="mt-4"
              disabled={!user}
              onClick={() => setSelected(p)}
            >
              {selected?.id === p.id ? "Selected ✓" : user ? "Choose plan" : "Sign in to subscribe"}
            </Button>
          </div>
        ))}
      </div>
      {!user && (
        <p className="mt-3 text-[12.5px] text-mut">
          <Link href="/login" className="text-brand underline">Sign in</Link> or{" "}
          <Link href="/register" className="text-brand underline">create an account</Link> to subscribe.
        </p>
      )}

      {/* Manual payment flow */}
      {selected && user && (
        <Panel className="mt-6" title={`Pay for ${selected.name} — $${selected.price} ${selected.currency}`}>
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-brand/40 bg-brand/5 p-4 text-[13px] leading-relaxed text-ink/90">
              {instructions}
              {sheetUrl && (
                <div className="mt-2">
                  <a href={sheetUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">
                    Open the payment sheet (account details) →
                  </a>
                </div>
              )}
              <div className="mt-2 font-mono text-[12px] text-mut">
                Your reference code: <span className="text-brand">SL-{user.username.toUpperCase()}-{selected.id.toUpperCase()}</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Transfer reference" hint="The reference/confirmation number of your transfer.">
                <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Receipt image" hint="Photo or screenshot of the payment proof (max 3MB).">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                  className="block w-full text-[12.5px] text-mut file:mr-3 file:rounded-lg file:border-0 file:bg-raise file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-ink hover:file:bg-line2"
                />
              </Field>
            </div>
            {proof && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proof} alt="Receipt preview" className="h-20 rounded-lg border border-line object-cover" />
                <button onClick={() => { setProof(""); if (fileRef.current) fileRef.current.value = ""; }} className="text-[12px] text-mut hover:text-bad">
                  Remove
                </button>
              </div>
            )}
            <Field label="Note for the reviewer (optional)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="brand" disabled={!reference.trim() && !proof} onClick={submit}>
              Submit payment for review
            </Button>
          </div>
        </Panel>
      )}

      {/* My payment history */}
      {user && mine.length > 0 && (
        <Panel className="mt-6" title="My payments">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12.5px]">
              <thead>
                <tr className="text-left text-mut">
                  <th className="py-1.5 pr-3 font-medium">Plan</th>
                  <th className="py-1.5 pr-3 font-medium">Amount</th>
                  <th className="py-1.5 pr-3 font-medium">Submitted</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 font-medium">Reviewer note</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2 pr-3">{p.planName}</td>
                    <td className="py-2 pr-3 font-mono">${p.amount}</td>
                    <td className="py-2 pr-3 text-mut">{fmtDate(p.createdAt)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={p.status === "approved" ? "live" : p.status === "rejected" ? "bad" : "warn"}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="py-2 text-mut">{p.adminNote ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
