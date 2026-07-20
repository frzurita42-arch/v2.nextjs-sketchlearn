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

  if (state === 'loading') {
    return <div style={{ margin: '6px 0 10px', fontSize: 12, opacity: 0.6 }}>Storage mode: checking…</div>;
  }

  if (state === 'unknown') {
    return <div style={{ margin: '6px 0 10px', fontSize: 12, opacity: 0.55 }}>Storage mode: unavailable.</div>;
  }

  const jsonMode = state === 'json';
  return (
    <div
      title={detail || (jsonMode ? 'Using local JSON/file storage.' : 'Using live database storage.')}
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
      <span>{jsonMode ? 'JSON mode' : 'DB mode'}</span>
      {jsonMode ? <span style={{ opacity: 0.75 }}>fallback active</span> : <span style={{ opacity: 0.75 }}>live</span>}
    </div>
  );
}
