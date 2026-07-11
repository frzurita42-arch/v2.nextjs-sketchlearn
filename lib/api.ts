'use client';
/* Typed fetch client with the signed-token session, ported from
 * public/js/core/api.js. A client-side singleton: the token/user live in
 * localStorage and in memory, exactly like the legacy SPA. */

export interface SessionUser {
  username: string;
  role: string;
}

class ApiClient {
  token: string | null = null;
  user: SessionUser | null = null;

  private hydrate() {
    if (typeof window === 'undefined') return;
    if (this.token === null) this.token = localStorage.getItem('sl_token');
    if (this.user === null) {
      try { this.user = JSON.parse(localStorage.getItem('sl_user') || 'null'); } catch { this.user = null; }
    }
  }

  setSession(token: string, user: SessionUser) {
    this.token = token;
    this.user = user;
    localStorage.setItem('sl_token', token);
    localStorage.setItem('sl_user', JSON.stringify(user));
  }

  clearSession() {
    this.token = null;
    this.user = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sl_token');
      localStorage.removeItem('sl_user');
    }
  }

  // A single request attempt. Errors thrown here carry `.status` when the server
  // responded, or `.transient` for network-level failures that never got a reply.
  private async once(method: string, url: string, body?: any): Promise<any> {
    this.hydrate();
    const controller = new AbortController();
    // AI lesson/slide generation can run close to the server's 60s function limit,
    // so the client must not abort earlier. Fast endpoints still return immediately.
    const timeoutMs = 60000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err: any) {
      // Timeout, or a network failure ("Failed to fetch") — the request may not
      // have reached the server, so it is safe to retry.
      const e: any = new Error(err && err.name === 'AbortError'
        ? 'The request took too long. Retrying…'
        : 'Network hiccup — could not reach the server.');
      e.transient = true;
      throw e;
    } finally {
      clearTimeout(timer);
    }
    let data: any = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    if (res.status === 401 && this.token) {
      this.clearSession();
      location.reload();
      throw new Error('Session expired. Please sign in again.');
    }
    if (!res.ok) {
      const e: any = new Error((data && data.error) || `Request failed (${res.status})`);
      e.status = res.status;
      throw e;
    }
    return data;
  }

  // Whether a failed attempt is worth retrying: network failures, and the
  // transient gateway/overload statuses (never 4xx, which won't change on retry).
  private isTransient(err: any): boolean {
    if (!err) return false;
    if (err.transient) return true;
    return err.status === 502 || err.status === 503 || err.status === 504 || err.status === 429;
  }

  // Retries transient failures with exponential backoff. `retries` defaults to 2
  // for idempotent GETs; other methods opt in (pass { retries }) — safe for
  // side-effect-free endpoints like the Builder, which just returns a proposal.
  async call(method: string, url: string, body?: any, opts?: { retries?: number }): Promise<any> {
    const maxRetries = opts?.retries ?? (method === 'GET' ? 2 : 0);
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await this.once(method, url, body);
      } catch (err: any) {
        if (this.isTransient(err) && attempt < maxRetries) {
          attempt++;
          await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt - 1))); // 600ms, 1200ms, …
          continue;
        }
        throw err;
      }
    }
  }

  get(url: string, opts?: { retries?: number }) { return this.call('GET', url, undefined, opts); }
  post(url: string, body?: any, opts?: { retries?: number }) { return this.call('POST', url, body, opts); }
  put(url: string, body?: any, opts?: { retries?: number }) { return this.call('PUT', url, body, opts); }
  del(url: string, opts?: { retries?: number }) { return this.call('DELETE', url, undefined, opts); }
}

export const API = new ApiClient();
