"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { Button, ErrorNote, Field, inputCls } from "@/components/ui";
import type { PublicUser } from "@/lib/types";

export default function LoginPage() {
  const { api, setSession } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const d = await api<{ token: string; user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setSession(d.token, d.user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full place-items-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-panel p-6">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand text-xl text-black">✏</div>
          <h1 className="mt-3 text-[19px] font-bold">Welcome back</h1>
          <p className="text-[12.5px] text-mut">Sign in to create paths and play presentations.</p>
        </div>
        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} autoFocus autoComplete="username" />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="current-password" />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="brand" className="w-full" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-[12.5px] text-mut">
          New here? <Link href="/register" className="text-brand underline">Create a free account</Link>
        </p>
      </form>
    </div>
  );
}
