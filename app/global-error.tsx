'use client';
/* Top-level fallback for errors that escape everything else (e.g. during the
 * very first render). Replaces Next's raw "a client-side exception has occurred"
 * with a friendly, recoverable page. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#f7f3e9', color: '#2d2a26' }}>
        <div style={{ maxWidth: 520, padding: 28, textAlign: 'center' }}>
          <h1 style={{ marginBottom: 8 }}>Something broke</h1>
          <p style={{ opacity: 0.8 }}>The app hit an unexpected error. Reloading usually fixes it — especially right after an update.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <button onClick={() => reset()} style={{ padding: '8px 16px', cursor: 'pointer' }}>Try again</button>
            <button onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }} style={{ padding: '8px 16px', cursor: 'pointer' }}>Reload</button>
          </div>
        </div>
      </body>
    </html>
  );
}
