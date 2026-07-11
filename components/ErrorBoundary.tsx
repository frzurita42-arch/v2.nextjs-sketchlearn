'use client';
/* Client error boundary so a crash in ONE view (e.g. a malformed AI-built tool,
 * or a stale bundle after a redeploy) shows a recoverable message instead of
 * white-screening the whole app. The header/footer live outside this boundary,
 * so navigation keeps working. Auto-recovers once from chunk-load errors. */
import React from 'react';

type Props = { children: React.ReactNode; onHome?: () => void };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error) {
    // A ChunkLoadError means the deployed bundle changed under the open tab
    // (common right after a Vercel redeploy). Reload once to fetch fresh chunks.
    const isChunk = /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(
      `${error?.name} ${error?.message}`
    );
    if (isChunk && typeof window !== 'undefined') {
      const KEY = 'sl_chunk_reloaded_at';
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 10000) { // avoid reload loops
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
    // eslint-disable-next-line no-console
    console.error('View error boundary caught:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ maxWidth: 560, margin: '40px auto', padding: '22px 24px', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong on this screen</h2>
          <p style={{ opacity: 0.8, fontSize: 14 }}>
            The rest of the app is fine — you can go back and keep working. If this just happened after an update, a reload usually fixes it.
          </p>
          <div className="slide-actions" style={{ justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn green" onClick={() => { this.setState({ error: null }); this.props.onHome?.(); }}>← Back to home</button>
            <button className="btn" onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}>↻ Reload</button>
          </div>
          <details style={{ marginTop: 14, textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.6 }}>Technical details</summary>
            <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', opacity: 0.7 }}>{String(this.state.error?.message || this.state.error)}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
