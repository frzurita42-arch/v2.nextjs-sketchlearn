"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PublicUser } from "@/lib/types";

interface AuthState {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  busy: boolean;
  setSession: (token: string, user: PublicUser) => void;
  setUser: (user: PublicUser | null) => void;
  logout: () => void;
  /** Fetch wrapper: attaches the Bearer token and drives the top progress bar. */
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "sl_token";

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, data: Record<string, unknown>) {
    super(typeof data.error === "string" ? data.error : `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inflight, setInflight] = useState(0);

  const api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
      setInflight((n) => n + 1);
      try {
        const res = await fetch(path, {
          ...init,
          headers: {
            "content-type": "application/json",
            ...(stored ? { authorization: `Bearer ${stored}` } : {}),
            ...(init?.headers ?? {}),
          },
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) throw new ApiError(res.status, data);
        return data as T;
      } finally {
        setInflight((n) => n - 1);
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!stored) {
      setUser(null);
      setLoading(false);
      return;
    }
    setToken(stored);
    try {
      const data = await api<{ user: PublicUser | null }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setSession = useCallback((newToken: string, newUser: PublicUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, token, loading, busy: inflight > 0, setSession, setUser, logout, api, refresh }),
    [user, token, loading, inflight, setSession, logout, api, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
