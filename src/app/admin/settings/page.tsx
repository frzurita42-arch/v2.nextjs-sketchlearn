"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Badge, Button, ErrorNote, Field, inputCls, Panel, Spinner } from "@/components/ui";
import type { PlatformSettings, Plan } from "@/lib/types";

// Admin settings: API keys (editable here; Vercel env vars are the base
// layer), token prices, plans and the manual-payment instructions.

export default function AdminSettingsPage() {
  const { api, loading, user } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [envKeys, setEnvKeys] = useState<{ anthropic: boolean; openai: boolean; database: boolean } | null>(null);
  const [denied, setDenied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    api<{ settings: PlatformSettings; envKeys: { anthropic: boolean; openai: boolean; database: boolean } }>(
      "/api/admin/settings"
    )
      .then((d) => {
        setSettings(d.settings);
        setEnvKeys(d.envKeys);
      })
      .catch(() => setDenied(true));
  }, [api, loading, user?.id]);

  if (denied) {
    return <div className="grid h-full place-items-center text-[13px] text-mut">Admin access required.</div>;
  }
  if (!settings) {
    return <div className="grid h-full place-items-center"><Spinner label="Loading settings…" /></div>;
  }

  const set = (patch: Partial<PlatformSettings>) => {
    setSettings({ ...settings, ...patch });
    setSaved(false);
  };

  const setPlan = (i: number, patch: Partial<Plan>) => {
    const plans = settings.plans.map((p, j) => (j === i ? { ...p, ...patch } : p));
    set({ plans });
  };

  const save = async () => {
    setError("");
    try {
      const d = await api<{ settings: PlatformSettings }>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(d.settings);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    }
  };

  const num = (key: keyof PlatformSettings) => (
    <input
      type="number"
      value={Number(settings[key])}
      onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<PlatformSettings>)}
      className={inputCls}
    />
  );

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">Platform settings</h1>
        <div className="flex items-center gap-2">
          {saved && <Badge tone="live">Saved ✓</Badge>}
          <Button variant="brand" onClick={save}>Save all settings</Button>
        </div>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      <Panel className="mt-5" title="AI providers" right={
        <span className="text-[11px] text-dim">
          env: Anthropic {envKeys?.anthropic ? "✓" : "—"} · OpenAI {envKeys?.openai ? "✓" : "—"} · DB {envKeys?.database ? "✓" : "—"}
        </span>
      }>
        <p className="mb-3 text-[12.5px] text-mut">
          Keys saved here override the Vercel environment variables (<code className="font-mono text-[11px]">ANTHROPIC_API_KEY</code>,{" "}
          <code className="font-mono text-[11px]">OPENAI_API_KEY</code>). Leave a field empty to fall back to the env var.
          With no key at all, the deterministic template engine keeps the site playable.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provider preference">
            <select value={settings.aiProvider} onChange={(e) => set({ aiProvider: e.target.value as PlatformSettings["aiProvider"] })} className={inputCls}>
              <option value="auto">Auto (Anthropic first)</option>
              <option value="anthropic">Anthropic only</option>
              <option value="openai">OpenAI only</option>
            </select>
          </Field>
          <Field label="Image generation (uses OpenAI key)">
            <select value={settings.imageGeneration ? "on" : "off"} onChange={(e) => set({ imageGeneration: e.target.value === "on" })} className={inputCls}>
              <option value="off">Off — placeholder art</option>
              <option value="on">On — generate slide images</option>
            </select>
          </Field>
          <Field label="Anthropic API key">
            <input value={settings.anthropicApiKey} onChange={(e) => set({ anthropicApiKey: e.target.value })} className={inputCls} placeholder="sk-ant-…" />
          </Field>
          <Field label="Anthropic model">
            <input value={settings.anthropicModel} onChange={(e) => set({ anthropicModel: e.target.value })} className={inputCls} />
          </Field>
          <Field label="OpenAI API key">
            <input value={settings.openaiApiKey} onChange={(e) => set({ openaiApiKey: e.target.value })} className={inputCls} placeholder="sk-…" />
          </Field>
          <Field label="OpenAI model">
            <input value={settings.openaiModel} onChange={(e) => set({ openaiModel: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </Panel>

      <Panel className="mt-4" title="Token economy">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Base generation cost">{num("baseGenerationCost")}</Field>
          <Field label="Tokens per slide">{num("tokensPerSlide")}</Field>
          <Field label="Tokens per image">{num("tokensPerImage")}</Field>
          <Field label="Coach chat cost">{num("chatCost")}</Field>
          <Field label="Lesson Path cost">{num("pathGenerationCost")}</Field>
          <Field label="Free signup tokens">{num("signupTokens")}</Field>
        </div>
        <div className="mt-3">
          <Field label="Guests can play (no account)">
            <select value={settings.guestCanPlay ? "yes" : "no"} onChange={(e) => set({ guestCanPlay: e.target.value === "yes" })} className={inputCls}>
              <option value="no">No — browsing only</option>
              <option value="yes">Yes — guests can generate and play</option>
            </select>
          </Field>
        </div>
      </Panel>

      <Panel className="mt-4" title="Subscription plans">
        <div className="space-y-3">
          {settings.plans.map((p, i) => (
            <div key={p.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-5">
              <Field label="Name"><input value={p.name} onChange={(e) => setPlan(i, { name: e.target.value })} className={inputCls} /></Field>
              <Field label="Price (USD)"><input type="number" value={p.price} onChange={(e) => setPlan(i, { price: Number(e.target.value) })} className={inputCls} /></Field>
              <Field label="Tokens"><input type="number" value={p.tokens} onChange={(e) => setPlan(i, { tokens: Number(e.target.value) })} className={inputCls} /></Field>
              <Field label="Days"><input type="number" value={p.days} onChange={(e) => setPlan(i, { days: Number(e.target.value) })} className={inputCls} /></Field>
              <Field label="Blurb"><input value={p.blurb} onChange={(e) => setPlan(i, { blurb: e.target.value })} className={inputCls} /></Field>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="mt-4" title="Manual payment instructions">
        <div className="space-y-3">
          <Field label="Instructions shown on the pricing page">
            <textarea value={settings.paymentInstructions} onChange={(e) => set({ paymentInstructions: e.target.value })} rows={4} className={inputCls} />
          </Field>
          <Field label="Payment sheet URL" hint="e.g. a Google Sheets link with your account/transfer details.">
            <input value={settings.paymentSheetUrl} onChange={(e) => set({ paymentSheetUrl: e.target.value })} className={inputCls} placeholder="https://docs.google.com/spreadsheets/…" />
          </Field>
        </div>
      </Panel>

      <div className="mt-5 flex justify-end">
        <Button variant="brand" onClick={save}>Save all settings</Button>
      </div>
    </div>
  );
}
