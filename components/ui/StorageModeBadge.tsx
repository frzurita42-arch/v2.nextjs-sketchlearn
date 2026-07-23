'use client';

import { useEffect, useState } from 'react';
import { API } from '@/lib/api';

export function StorageModeBadge() {
  const [state, setState] = useState<'loading' | 'db' | 'json' | 'unknown'>('loading');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let alive = true;
    API.get('/api/health').then((h: any) => {
      if (!alive) return;
      const jsonMode = !h?.dbLive || !h?.canWrite;
      setState(jsonMode ? 'json' : 'db');
      setDetail(String(h?.error || ''));
    }).catch(() => {
      if (!alive) return;
      setState('unknown');
      setDetail('Sign in as admin to view storage mode.');
    });
    return () => { alive = false; };
  }, []);

  // Nothing useful to say yet (still checking) or nothing to show (guests can't
  // read the health endpoint) — stay hidden instead of printing status noise.
  if (state === 'loading' || state === 'unknown') return null;

  const jsonMode = state === 'json';
  return (
    <div
      title={detail || (jsonMode
        ? 'Content is being saved to a local file on the server (no external database connected). Everything works — repos, slides and plays are stored in the app’s own JSON files.'
        : 'Content is being saved to the connected live database.')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        margin: '6px 0 10px',
        padding: '3px 8px',
        borderRadius: 999,
        border: '1.5px solid var(--ink)',
        fontSize: 12,
        background: jsonMode ? 'rgba(228,87,46,0.1)' : 'rgba(127,176,105,0.14)',
      }}
    >
      <span>{jsonMode ? '💾 Saving to local files' : '🗄️ Saving to database'}</span>
    </div>
  );
}
